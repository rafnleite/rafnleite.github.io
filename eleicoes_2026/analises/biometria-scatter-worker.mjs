import {aggregateScatter,decodeScatterState} from './biometria-scatter-model.mjs?v=result-1';
import {accumulateByBiometry} from './biometria-cumulative-model.mjs?v=5';
let manifest,manifestPromise,generation=0,cumulativeGeneration=0,current;
const cache=new Map(),placeCache=new Map();
async function loadPlaces(entry){
 if(!placeCache.has(entry.uf))placeCache.set(entry.uf,fetch(entry.placesUrl).then(r=>{if(!r.ok)throw Error(`Locais de ${entry.uf} indisponíveis.`);return r.json();}).catch(e=>{placeCache.delete(entry.uf);throw e;}));
 return placeCache.get(entry.uf);
}
async function load(entry){
 if(!cache.has(entry.uf))cache.set(entry.uf,(async()=>{
  const r=await fetch(entry.url);if(!r.ok)throw Error(`Falha ao carregar a dispersão de ${entry.uf}.`);
  return decodeScatterState(entry,await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 })().catch(e=>{cache.delete(entry.uf);throw e;}));
 return cache.get(entry.uf);
}
async function loadSelected(options,isCurrent){
 manifestPromise??=fetch('./biometria/scatter-manifest.json?v=3').then(r=>{if(!r.ok)throw Error('Dados de biometria indisponíveis.');return r.json();}).catch(e=>{manifestPromise=null;throw e;});
 manifest??=await manifestPromise;if(!isCurrent())return null;
 const target=options.uf||options.zone?.split(':')[0],entries=manifest.states.filter(e=>!target||e.uf===target),states=new Array(entries.length);let position=0;
 await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{while(position<entries.length&&isCurrent()){const i=position++;states[i]=await load(entries[i]);if(options.level==='place')states[i].places=await loadPlaces(entries[i]);}}));
 return isCurrent()?states:null;
}
function sectionPoints(states,options){
 const capacity=states.reduce((sum,s)=>sum+s.rows,0),coords=new Float32Array(capacity*2),refs=new Uint32Array(capacity*2),votes=new Uint32Array(capacity);let count=0,excluded=0;
 states.forEach((s,si)=>{
  const [city,zones,,logs,failure,biometry,lula,flavio,,indeterminate]=s.columns;
  for(let i=0;i<s.rows;i++){
   if(options.zone&&`${s.uf}:${zones[i]}`!==options.zone)continue;
   const valid=lula[i]+flavio[i];if(!s.cities[city[i]]||!logs[i]||!valid||failure[i]+biometry[i]+(indeterminate?.[i]??0)>logs[i]){excluded++;continue;}
   coords[2*count]=100*(options.metric==='failure'?failure[i]:biometry[i])/logs[i];coords[2*count+1]=100*lula[i]/valid;
   votes[count]=valid;refs[2*count]=si;refs[2*count+1]=i;count++;
  }
 });
 return {coords:coords.slice(0,count*2),votes:votes.slice(0,count),refs:refs.slice(0,count*2),sections:count,excluded,states};
}
function makeIndex(coords){
 const heads=new Int32Array(101*101).fill(-1),next=new Int32Array(coords.length/2);
 for(let i=0;i<next.length;i++){const key=Math.floor(coords[2*i])*101+Math.floor(coords[2*i+1]);next[i]=heads[key];heads[key]=i;}
 return {heads,next};
}
async function detail(index){
 const snapshot=current;
 if(snapshot.points)return snapshot.points[index];
 const s=snapshot.states[snapshot.refs[2*index]],i=snapshot.refs[2*index+1],[city,zones,sections,logs,failures,biometry,lula,flavio,placeIndexes,indeterminate]=s.columns;
 let subtitle='Local de votação indisponível.';
 try{
  s.places??=await loadPlaces(manifest.states.find(entry=>entry.uf===s.uf));
  const place=s.places[placeIndexes[i]];
  if(place&&place[0]===s.cities[city[i]][0]&&place[1]===zones[i])subtitle=`Local de votação: ${place[3]} · Nº ${place[2]}`;
 }catch{/* Keep the section and election details available if place metadata fails. */}
 return {name:`${s.cities[city[i]][1]} / ${s.uf} · Zona ${zones[i]} · Seção ${sections[i]}`,subtitle,sections:1,logs:logs[i],failures:failures[i],biometry:biometry[i],indeterminate:indeterminate?.[i]??0,lula:lula[i],flavio:flavio[i],x:snapshot.coords[2*index],y:snapshot.coords[2*index+1]};
}
self.onmessage=async({data})=>{
 if(data.type==='nearest'){
  if(!current||data.id!==current.id)return;
  const {x,y,dx,dy}=data;let best=-1,distance=1;
  const {heads,next}=current.index;
  for(let a=Math.max(0,Math.floor(x-dx));a<=Math.min(100,Math.floor(x+dx));a++)for(let b=Math.max(0,Math.floor(y-dy));b<=Math.min(100,Math.floor(y+dy));b++){
   for(let i=heads[a*101+b];i!==-1;i=next[i]){
    const d=((current.coords[2*i]-x)/dx)**2+((current.coords[2*i+1]-y)/dy)**2;
    if(d<distance){distance=d;best=i;}
   }
  }
  const point=best===-1?null:await detail(best);
  if(current?.id===data.id)self.postMessage({type:'nearest',id:data.id,hover:data.hover,point});return;
 }
 if(data.type==='cumulative-render'){
  const ticket=++cumulativeGeneration;
  try{
   const states=await loadSelected(data.options,()=>ticket===cumulativeGeneration);if(!states)return;
   const result=accumulateByBiometry(states,data.options);
   self.postMessage({type:'cumulative-result',id:data.id,...result},[result.lula.buffer,result.flavio.buffer,result.sections.buffer,result.rateNumerators.buffer,result.rateDenominators.buffer]);
  }catch(e){if(ticket===cumulativeGeneration)self.postMessage({type:'cumulative-error',id:data.id,message:e.message});}
  return;
 }
 if(data.type!=='render')return;
 const ticket=++generation;current=null;
 try{
  const options=data.options,states=await loadSelected(options,()=>ticket===generation);if(!states)return;
  let result;
  if(options.level==='section')result=sectionPoints(states,options);
  else{result=aggregateScatter(states,options);result.coords=new Float32Array(result.points.length*2);result.votes=new Uint32Array(result.points.length);result.points.forEach((p,i)=>{result.coords[2*i]=p.x;result.coords[2*i+1]=p.y;result.votes[i]=p.lula+p.flavio;});}
  result.id=data.id;result.index=makeIndex(result.coords);current=result;
  let minVotes=Infinity,maxVotes=0;for(const n of result.votes){minVotes=Math.min(minVotes,n);maxVotes=Math.max(maxVotes,n);}
  const coords=result.coords.slice(),votes=result.votes;self.postMessage({type:'result',id:data.id,coords,votes,minVotes,maxVotes,count:coords.length/2,sections:result.sections,excluded:result.excluded},[coords.buffer,votes.buffer]);
 }catch(e){if(ticket===generation)self.postMessage({type:'error',id:data.id,message:e.message});}
};
