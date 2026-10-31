/** Diff visible marker records and create new markers in cancellable frames. */
export class ViewportMarkers {
  constructor({create,add,remove,update=()=>{},schedule=callback=>requestAnimationFrame(callback),cancel=id=>cancelAnimationFrame(id),now=()=>performance.now(),budgetMs=5,maxPerFrame=250,immediate=false}){
    if(![create,add,remove,update,schedule,cancel,now].every(callback=>typeof callback==='function'))throw new TypeError('Marker adapters must be functions.');
    if(!Number.isFinite(budgetMs)||budgetMs<=0||!Number.isInteger(maxPerFrame)||maxPerFrame<1)throw new RangeError('Invalid marker frame budget.');
    if(typeof immediate!=='boolean')throw new TypeError('Immediate marker rendering must be a boolean.');
    this.adapter={create,add,remove,update};this.schedule=schedule;this.cancelFrame=cancel;this.now=now;this.budgetMs=budgetMs;this.maxPerFrame=maxPerFrame;
    this.immediate=immediate;this.activeMap=new Map();this.generation=0;this.frame=null;this.pending=[];this.pendingIndex=0;
  }
  get pendingCount(){return this.pending.length-this.pendingIndex;}
  cancel(){
    this.generation++;
    if(this.frame!==null)this.cancelFrame(this.frame);
    this.frame=null;this.pending=[];this.pendingIndex=0;
  }
  clear(){
    this.cancel();
    const generation=this.generation;
    for(const [key,{marker,record}] of [...this.activeMap]){
      if(generation!==this.generation)return;
      this.activeMap.delete(key);this.adapter.remove(marker,record);
    }
  }
  reconcile(records){
    const wanted=new Map();
    for(const record of records){
      if(!record||typeof record.key!=='string'||!record.key||wanted.has(record.key))throw new TypeError('Marker keys must be unique nonempty strings.');
      wanted.set(record.key,record);
    }
    this.cancel();
    const generation=this.generation;
    const counts={retained:0,updated:0,removed:0,queued:0};
    for(const [key,entry] of [...this.activeMap]){
      if(generation!==this.generation)return counts;
      if(!wanted.has(key)){this.activeMap.delete(key);this.adapter.remove(entry.marker,entry.record);counts.removed++;}
    }
    for(const [key,record] of wanted){
      if(generation!==this.generation)return counts;
      const entry=this.activeMap.get(key);
      if(entry){
        if(entry.record===record)counts.retained++;
        else{
          this.adapter.update(entry.marker,record,entry.record);
          if(generation!==this.generation)return counts;
          entry.record=record;counts.updated++;
        }
      }else this.pending.push(record);
    }
    counts.queued=this.pendingCount;
    if(this.pendingCount){if(this.immediate)this.flush(generation);else this.queueFrame(generation);}
    return counts;
  }
  queueFrame(generation){this.frame=this.schedule(()=>this.flush(generation));}
  flush(generation){
    if(generation!==this.generation)return;
    this.frame=null;
    const started=this.now();let created=0;
    while(this.pendingIndex<this.pending.length&&(this.immediate||(created<this.maxPerFrame&&(created===0||this.now()-started<this.budgetMs)))){
      if(generation!==this.generation)return;
      const record=this.pending[this.pendingIndex],marker=this.adapter.create(record);
      if(generation!==this.generation)return;
      try{this.adapter.add(marker,record);}
      catch(error){
        // add() can fail after partially attaching a Leaflet layer. Do not
        // cache that marker as active, and preserve the original exception.
        try{this.adapter.remove(marker,record);}catch{}
        throw error;
      }
      if(generation!==this.generation){this.adapter.remove(marker,record);return;}
      this.activeMap.set(record.key,{marker,record});this.pendingIndex++;created++;
    }
    if(this.pendingIndex<this.pending.length)this.queueFrame(generation);
    else{this.pending=[];this.pendingIndex=0;}
  }
}
