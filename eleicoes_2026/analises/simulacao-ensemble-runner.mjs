import {ENSEMBLE_COUNT,PERCENT_POINTS,ENSEMBLE_STEP,regionalSpeedConfig} from './simulacao-ensemble-model.mjs?v=fast-draw-1';
import {TIMING_MODEL} from './simulacao-model.mjs?v=fast-draw-1';
const preparedCache=new Map();
export function ensembleWorkerCount(cores=2,memory=8){return Math.min(4,memory<=4?2:4,Math.max(1,Math.floor(cores||2)-1));}
export function partitionEnsemble(total,workers){
 const parts=[];let start=0;for(let i=0;i<Math.min(total,workers);i++){const count=Math.ceil((total-start)/(workers-i));parts.push({start,count});start+=count;}return parts;
}
export function mergeEnsembleChunks(chunks,metadata,total=ENSEMBLE_COUNT){
 const ordered=[...chunks].sort((a,b)=>a.start-b.start);let count=0,points=0;
 for(const c of ordered){if(c.start!==count||c.count<1||c.percentCoords.length!==c.count*PERCENT_POINTS*2||(metadata.regional&&c.curves?.length!==c.count*c.points))throw Error('Conjunto de simulações incompleto.');count+=c.count;points=Math.max(points,c.points);}
 if(count!==total)throw Error('Conjunto de simulações incompleto.');
 const curves=metadata.regional?new Float32Array(count*points):undefined,percentCoords=new Float32Array(count*PERCENT_POINTS*2);
 for(const c of ordered){
  percentCoords.set(c.percentCoords,c.start*PERCENT_POINTS*2);
  if(curves)for(let i=0;i<c.count;i++){const start=(c.start+i)*points;curves.set(c.curves.subarray(i*c.points,(i+1)*c.points),start);curves.fill(metadata.finalPercent,start+c.points,start+points);}
 }
 return {version:2,...metadata,count,points,step:ENSEMBLE_STEP,percentPoints:PERCENT_POINTS,curves,percentCoords};
}
export function createEnsembleRunner(){
 let cancelled=false,started;const workers=new Set();
 const api={onmessage:null,onerror:null,terminate(){cancelled=true;for(const w of workers)w.terminate();workers.clear();},postMessage(options){const total=options.total??ENSEMBLE_COUNT;if(!Number.isInteger(total)||total<1||total>ENSEMBLE_COUNT){send({type:'error',message:'Escolha entre 1 e 10.000 simulações.'});return;}started=performance.now();prepare({...options,total});}};
 const send=data=>{if(!cancelled)api.onmessage?.({data});};
 const fail=message=>{if(cancelled)return;for(const w of workers)w.terminate();workers.clear();send({type:'error',message});};
 function makeWorker(){const worker=new Worker(new URL('./simulacao-ensemble-worker.mjs?v=fast-draw-1',import.meta.url),{type:'module'});workers.add(worker);worker.onerror=()=>fail('Não foi possível concluir. Tente gerar novamente.');return worker;}
 function prepare(options){
  const key=`${Number(options.regional)}-${Number(options.regional?options.includeExterior:true)}`,saved=preparedCache.get(key);
  send({type:'progress',done:0,total:options.total,loading:!saved});
  if(saved){compute(options,saved);return;}
  const loader=makeWorker();loader.onmessage=({data})=>{
   if(cancelled)return;if(data.type==='error'){fail(data.message);return;}
   if(data.type!=='prepared')return;loader.terminate();workers.delete(loader);preparedCache.set(key,data);compute(options,data);
  };
  loader.postMessage({type:'prepare',...options});
 }
 function compute(options,{prepared,generatedAt}){
  if(cancelled)return;
  const count=ensembleWorkerCount(navigator.hardwareConcurrency,navigator.deviceMemory),parts=partitionEnsemble(options.total,count),progress=parts.map(()=>0),chunks=[];
  const config=regionalSpeedConfig(options),metadata={...(options.regional?{timingModel:TIMING_MODEL,...config}:{}),seed:options.seed,includeExterior:options.regional?options.includeExterior:true,regional:options.regional,urns:prepared.urns,places:prepared.places,generatedAt,finalPercent:100*prepared.totalLula/(prepared.totalLula+prepared.totalFlavio)};
  parts.forEach((part,index)=>{
   const worker=makeWorker();worker.onmessage=({data})=>{
    if(cancelled)return;if(data.type==='error'){fail(data.message);return;}
    if(data.type==='progress'){progress[index]=data.done;send({type:'progress',done:progress.reduce((a,b)=>a+b,0),total:options.total});}
    if(data.type!=='chunk')return;worker.terminate();workers.delete(worker);chunks.push(data);
    if(chunks.length===parts.length){try{const result=mergeEnsembleChunks(chunks,metadata,options.total);result.elapsedMs=performance.now()-started;result.workers=parts.length;send({type:'result',...result});}catch(error){fail(error.message);}}
   };
   worker.postMessage({type:'compute',...options,...part,prepared});
  });
 }
 return api;
}
