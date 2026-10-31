const levels=new Set(['section','place','zone','city','state']);
export function decodeScatterState(entry,buffer){
 const width=entry.columnCount??8;
 if(![8,9,10].includes(width))throw Error('Formato de dispersão inválido.');
 if(buffer.byteLength!==entry.rows*width*4)throw Error(`Dados de dispersão incompletos: ${entry.uf}.`);
 const view=new DataView(buffer),data=new Uint32Array(entry.rows*width);
 for(let i=0;i<data.length;i++)data[i]=view.getUint32(i*4,true);
 return {uf:entry.uf,cities:entry.cities,rows:entry.rows,columns:Array.from({length:width},(_,i)=>data.subarray(i*entry.rows,(i+1)*entry.rows))};
}
export function aggregateScatter(states,{level='zone',metric='failure',uf='',zone=''}={}){
 if(!levels.has(level)||!['failure','biometry'].includes(metric))throw Error('Agrupamento inválido.');
 const groups=new Map();let sections=0,excluded=0;
 for(const state of states){
  if(uf&&state.uf!==uf)continue;
  const [city,zones,section,logs,failure,biometry,lula,flavio,placeIndexes,indeterminate]=state.columns;
  for(let i=0;i<state.rows;i++){
   if(zone&&`${state.uf}:${zones[i]}`!==zone)continue;
   const c=state.cities[city[i]],valid=lula[i]+flavio[i];
   if(!c||!logs[i]||!valid||failure[i]+biometry[i]+(indeterminate?.[i]??0)>logs[i]){excluded++;continue;}
   const place=level==='place'?state.places?.[placeIndexes?.[i]]:null;
   if(level==='place'&&(!place||place[0]!==c[0]||place[1]!==zones[i])){excluded++;continue;}
   const key=level==='place'?`${state.uf}/${c[0]}/${zones[i]}/${place[2]}`:level==='state'?state.uf:level==='zone'?`${state.uf}/${zones[i]}`:level==='city'?`${state.uf}/${c[0]}`:`${state.uf}/${c[0]}/${zones[i]}/${section[i]}`;
   let point=groups.get(key);
   if(!point){
    const name=level==='place'?`${place[3]} · ${c[1]} / ${state.uf} · Zona ${zones[i]} · Local ${place[2]}`:level==='state'?state.uf:level==='zone'?`${state.uf} · Zona ${zones[i]}`:level==='city'?`${c[1]} / ${state.uf}`:`${c[1]} / ${state.uf} · Zona ${zones[i]} · Seção ${section[i]}`;
    point={key,name,sections:0,logs:0,failures:0,biometry:0,lula:0,flavio:0,indeterminate:0};groups.set(key,point);
   }
   point.indeterminate+=indeterminate?.[i]??0;point.sections++;point.logs+=logs[i];point.failures+=failure[i];point.biometry+=biometry[i];point.lula+=lula[i];point.flavio+=flavio[i];sections++;
  }
 }
 const points=[...groups.values()];
 for(const p of points){p.x=100*(metric==='failure'?p.failures:p.biometry)/p.logs;p.y=100*p.lula/(p.lula+p.flavio);}
 return {points,sections,excluded};
}
