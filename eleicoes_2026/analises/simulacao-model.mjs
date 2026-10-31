import {boundedGammaMinutes,createBoundedGammaSampler,END_TIME} from './simulacao-timing.mjs?v=fast-draw-1';
export {END_TIME,TIMING_MODEL} from './simulacao-timing.mjs?v=fast-draw-1';
export const LEVELS = Object.freeze({1:{mean:165,sd:55},2:{mean:130,sd:45},3:{mean:90,sd:40},4:{mean:70,sd:25},5:{mean:45,sd:20}});
export const REGIONS = Object.freeze({Norte:['AC','AP','AM','PA','RO','RR','TO'],Nordeste:['AL','BA','CE','MA','PB','PE','PI','RN','SE'],'Centro-Oeste':['DF','GO','MT','MS'],Sudeste:['ES','MG','RJ','SP'],Sul:['PR','RS','SC'],Exterior:['ZZ']});
export const STATE_NAMES = {AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins',ZZ:'Exterior'};
export function seededRandom(seed=1){
  let value=Number(seed)>>>0;
  return ()=>{value=(value+0x6D2B79F5)>>>0;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
// Marsaglia–Tsang gamma sampler. Every configured shape is greater than 1.
// k=(mean/sd)^2 and theta=sd^2/mean preserve the requested moments.
export function gammaMinutes(level,random){
  const spec=LEVELS[level];if(!spec)throw Error('Velocidade inválida');
  const shape=(spec.mean/spec.sd)**2,scale=spec.sd**2/spec.mean,d=shape-1/3,c=1/Math.sqrt(9*d);
  for(;;){
    const x=Math.sqrt(-2*Math.log(1-random()))*Math.cos(2*Math.PI*random());
    const root=1+c*x;if(root<=0)continue;
    const v=root**3,u=1-random();
    if(u<1-0.0331*x**4||Math.log(u)<0.5*x*x+d*(1-v+Math.log(v)))return d*v*scale;
  }
}
// Inputs closing after the scenario deadline are retained in diagnostic recuts;
// the published base has no such location. Never dispatch before a real closure.
export function dispatchMinutes(level,closing,random){
 if(!LEVELS[level])throw Error('Velocidade inválida');
 return closing<END_TIME?boundedGammaMinutes(level,LEVELS[level],closing,random,LEVELS[level].mean/LEVELS[1].mean):gammaMinutes(level,random);
}
export function createDispatchSampler(closings,levels){return createBoundedGammaSampler(LEVELS,closings,gammaMinutes,levels);}
export function setRegionLevel(levels,region,level){
  if(!REGIONS[region]||!LEVELS[level])throw Error('Região ou velocidade inválida');
  return {...levels,...Object.fromEntries(REGIONS[region].map(uf=>[uf,Number(level)]))};
}
export function regionLevel(levels,region){
  const values=REGIONS[region].map(uf=>levels[uf]??3);
  return values.every(v=>v===values[0])?values[0]:'';
}
export function clock(seconds){
  const n=Math.floor(seconds),day=Math.floor(n/86400),s=((n%86400)+86400)%86400;
  return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}${day?` (${day>0?'+':''}${day}d)`:''}`;
}

function candidateOrder(rows,mode){
  const candidate=mode==='lula'?2:3;
  return Array.from({length:rows.length},(_,i)=>i).sort((a,b)=>{
    const totalA=rows[a][2]+rows[a][3],totalB=rows[b][2]+rows[b][3];
    // No candidate share exists without valid votes: place those locations
    // last in either mode. Equal shares retain their baseline time order.
    if(!totalA||!totalB)return Number(!totalA)-Number(!totalB)||a-b;
    return rows[b][candidate]/totalB-rows[a][candidate]/totalA||a-b;
  });
}

function zigzagSchedule(groups,chronological,initialBalance){
  // Collect locations that became ready in each five-minute window, then
  // release them individually throughout the next window. Every location is
  // ready before its slot; a late one cannot hold up already-ready locations.
  const window=5*60,order=[],times=new Float64Array(groups.length);
  const margin=i=>groups[i].lula-groups[i].flavio;
  const target=Math.max(1,chronological.reduce((n,i)=>n+groups[i].lula+groups[i].flavio,0)*0.01);
  let cursor=0,balance=initialBalance,direction=balance>0?-1:1;
  while(cursor<chronological.length){
    const start=cursor;
    const windowEnd=START_TIME+(Math.floor((groups[chronological[cursor]].ready-START_TIME)/window)+1)*window;
    while(cursor<chronological.length&&groups[chronological[cursor]].ready<windowEnd)cursor++;
    const available=chronological.slice(start,cursor).sort((a,b)=>margin(b)-margin(a)||groups[a].ready-groups[b].ready||a-b);
    let left=0,right=available.length-1,slot=0;
    const latest=groups[chronological[cursor-1]].ready;
    const bounded=windowEnd>=END_TIME&&latest<END_TIME;
    const releaseStart=bounded?Math.max(latest,order.length?times[order.at(-1)]:START_TIME):windowEnd;
    const releaseEnd=bounded?END_TIME:windowEnd+window;
    if(Math.abs(balance)>=target)direction=balance>0?-1:1;
    while(left<=right){
      const i=direction>0?available[left++]:available[right--];
      times[i]=releaseStart+(slot+0.5)/available.length*(releaseEnd-releaseStart);slot++;
      order.push(i);balance+=margin(i);
      if(direction*balance>=target)direction*=-1;
      else if(left<=right&&direction*margin(direction>0?available[left]:available[right])<=0)direction*=-1;
    }
  }
  return {order,times};
}

export const START_TIME=19*3600;
// The scenario's extension applies only to Brazil. Keep the recorded BU time
// intact and use this effective closing time for the simulated local dispatch.
export function adjustedClosing(seconds,uf){return uf==='ZZ'?seconds:Math.max(START_TIME,seconds);}
export function simulate(snapshot,{levels={},mode='random',seed=1,includeExterior=true}={}){
  if(!['random','lula','flavio','zigzag'].includes(mode))throw Error('Modo inválido');
  const shareOrdered=mode==='lula'||mode==='flavio';
  const rows=includeExterior?snapshot.rows:snapshot.rows.filter(r=>snapshot.states[r[0]]!=='ZZ');
  const n=rows.length,random=seededRandom(seed),groups=[],byPlace=new Map();
  const placeClosing=new Float64Array(n),delays=new Float64Array(n);
  for(let i=0;i<n;i++){
    const row=rows[i],key=row[9]??`section:${i}`;
    let group=byPlace.get(key);
    if(!group){group={id:key,uf:row[0],closing:-Infinity,members:[],lula:0,flavio:0};byPlace.set(key,group);groups.push(group);}
    if(group.uf!==row[0])throw Error('Local de votação associado a estados diferentes.');
    group.members.push(i);group.closing=Math.max(group.closing,adjustedClosing(row[1],snapshot.states[row[0]]));group.lula+=row[2];group.flavio+=row[3];
  }
  for(const group of groups){
    group.delay=dispatchMinutes(levels[snapshot.states[group.uf]]??3,group.closing,random)*60;
    group.ready=group.closing+group.delay;
    for(const i of group.members){delays[i]=group.delay;placeClosing[i]=group.closing;}
  }
  const chronological=Array.from({length:groups.length},(_,i)=>i).sort((a,b)=>groups[a].ready-groups[b].ready||a-b);
  // Candidate-priority modes sort every location, including early exterior
  // results. A chronological opening balance would break the descending share.
  const early=shareOrdered?[]:chronological.filter(i=>groups[i].ready<=START_TIME);
  const remaining=shareOrdered?chronological:chronological.filter(i=>groups[i].ready>START_TIME);
  const initialBalance=early.reduce((n,i)=>n+groups[i].lula-groups[i].flavio,0);
  const zigzag=mode==='zigzag'?zigzagSchedule(groups,remaining,initialBalance):null;
  const directed=mode==='random'?remaining:zigzag?zigzag.order:candidateOrder(remaining.map(i=>{const g=groups[i];return [g.uf,g.closing,g.lula,g.flavio];}),mode).map(i=>remaining[i]);
  const groupOrder=[...early,...directed];
  const times=new Float64Array(n),lula=new Float64Array(n+1),flavio=new Float64Array(n+1),white=new Float64Array(n+1),invalid=new Float64Array(n+1),changes=new Uint32Array(n+1);
  const stats=Object.fromEntries(snapshot.states.filter(uf=>includeExterior||uf!=='ZZ').map(uf=>[uf,{uf,count:0,places:0,delay:0,squaredDelay:0,actualDelay:0,extra:0,first:Infinity,last:-Infinity,lula:0,flavio:0}]));
  const order=[],groupEnds=[];let previous=-Infinity,lastLeader=0,k=0;
  for(let position=0;position<groupOrder.length;position++){
    const group=groups[groupOrder[position]];
    // All urns at the same location enter in one event, after the last known
    // closure plus ONE gamma draw. Directed queues may add explicit waiting.
    const t=mode==='random'||position<early.length?group.ready:zigzag?zigzag.times[groupOrder[position]]:Math.max(group.ready,groups[chronological[position]].ready,previous+0.000001,shareOrdered?START_TIME+0.000001:-Infinity);
    previous=t;
    for(const i of group.members){
      const r=rows[i];order.push(i);times[k]=t;
      lula[k+1]=lula[k]+r[2];flavio[k+1]=flavio[k]+r[3];white[k+1]=white[k]+r[4];invalid[k+1]=invalid[k]+r[5];changes[k+1]=changes[k];k++;
    }
    const leader=Math.sign(lula[k]-flavio[k]);
    if(leader&&lastLeader&&leader!==lastLeader)changes[k]++;
    if(leader)lastLeader=leader;
    groupEnds.push(k);
    const state=stats[snapshot.states[group.uf]];
    state.count+=group.members.length;state.places++;state.delay+=group.delay;state.squaredDelay+=group.delay**2;state.actualDelay+=t-group.closing;state.extra+=t-group.ready;state.first=Math.min(state.first,t);state.last=t;state.lula+=group.lula;state.flavio+=group.flavio;
  }
  const initialCount=countAtTime(times,START_TIME);
  const earlyChanges=changes[initialCount];
  for(let i=initialCount+1;i<changes.length;i++)changes[i]-=earlyChanges;
  changes.fill(0,0,initialCount+1);
  return {n,rows,order,times,lula,flavio,white,invalid,changes,stats,delays,placeClosing,groupEnds,groupCount:groups.length,initialCount,mode,seed,levels:{...levels},start:START_TIME,end:Math.max(START_TIME,n?times[n-1]:START_TIME)};
}
export function countAtTime(times,time){
  let lo=0,hi=times.length;while(lo<hi){const mid=(lo+hi)>>>1;if(times[mid]<=time)lo=mid+1;else hi=mid;}return lo;
}
// Preserve local extremes and crossings when reducing half a million BUs for
// the chart. Accumulators, playback and CSV always retain every single urn.
export function chartIndices(result,limit=1800){
  if(!result.n)return [];
  const eligible=result.groupEnds.filter(k=>k>result.initialCount),stride=Math.max(1,Math.ceil(eligible.length/limit));
  const indexes=new Set([result.initialCount,result.n]);
  for(let start=0;start<eligible.length;start+=stride){
    let min=eligible[start],max=min,minValue=Infinity,maxValue=-Infinity;
    for(let j=start;j<Math.min(start+stride,eligible.length);j++){
      const k=eligible[j],valid=result.lula[k]+result.flavio[k],v=valid?result.lula[k]/valid:0.5;
      if(v<minValue){minValue=v;min=k;}if(v>maxValue){maxValue=v;max=k;}
    }
    indexes.add(eligible[start]);indexes.add(min);indexes.add(max);indexes.add(eligible[Math.min(eligible.length-1,start+stride-1)]);
  }
  return [...indexes].sort((a,b)=>a-b);
}
