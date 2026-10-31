import {ENSEMBLE_COUNT,ENSEMBLE_STEP,PERCENT_POINTS,prepareEnsemble,createFullRegionalSampler,createPermutationSampler,ensembleSeed} from './simulacao-ensemble-model.mjs?v=fast-draw-1';
self.onmessage=async({data})=>{
 try{
  if(data.type==='prepare'){
   const response=await fetch('./simulacao-urnas.json.gz');if(!response.ok)throw Error('Não foi possível carregar os boletins de urna.');
   const snapshot=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();if(snapshot.schemaVersion!==2)throw Error('Base de urnas incompatível');
   if(!data.regional){const extra=await fetch('./simulacao-sem-horario.json').then(r=>{if(!r.ok)throw Error('Não foi possível carregar as urnas sem horário.');return r.json();});if(extra.baseGeneratedAt!==snapshot.generatedAt)throw Error('Bases de simulação incompatíveis.');snapshot.untimedRows=extra.rows;}
   const prepared=prepareEnsemble(snapshot,data.regional?data.includeExterior:true,!data.regional),buffers=Object.values(prepared).filter(ArrayBuffer.isView).map(value=>value.buffer);
   self.postMessage({type:'prepared',prepared,generatedAt:snapshot.generatedAt},buffers);return;
  }
  if(data.type!=='compute')throw Error('Pedido de simulação inválido.');
  const p=data.prepared,count=data.count,start=data.start;if(!Number.isInteger(count)||count<1||!Number.isInteger(start)||start<0||start+count>ENSEMBLE_COUNT)throw Error('Intervalo de simulações inválido.');
  const sample=data.regional?createFullRegionalSampler(p,data):createPermutationSampler(p),values=data.regional?new Float32Array(count*p.bins):null,percentCoords=new Float32Array(count*PERCENT_POINTS*2);let last=0;
  for(let i=0;i<count;i++){
   const seed=ensembleSeed(data.seed,start+i),coords=percentCoords.subarray(i*PERCENT_POINTS*2,(i+1)*PERCENT_POINTS*2);
   if(data.regional)last=Math.max(last,sample(seed,values.subarray(i*p.bins,(i+1)*p.bins),coords));else sample(seed,coords);
   if((i+1)%50===0||i+1===count)self.postMessage({type:'progress',done:i+1,total:count});
  }
  let curves,points=0;if(data.regional){points=last+1;curves=new Float32Array(count*points);for(let i=0;i<count;i++)curves.set(values.subarray(i*p.bins,i*p.bins+points),i*points);}
  const buffers=[percentCoords.buffer];if(curves)buffers.push(curves.buffer);
  self.postMessage({type:'chunk',start,count,step:ENSEMBLE_STEP,points,percentPoints:PERCENT_POINTS,curves,percentCoords},buffers);
 }catch(error){self.postMessage({type:'error',message:error.message});}
};
