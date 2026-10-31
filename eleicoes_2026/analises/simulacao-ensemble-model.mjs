import {REGIONS,START_TIME,adjustedClosing,dispatchMinutes,createDispatchSampler,seededRandom} from './simulacao-model.mjs?v=fast-draw-1';
export const ENSEMBLE_COUNT=10000,ENSEMBLE_STEP=120;
export function prepareEnsemble(snapshot,includeExterior=true,includeUntimed=false){
 const regions=Object.values(REGIONS),groups=[],byPlace=new Map();let totalLula=0,totalFlavio=0,maxClosing=START_TIME,urns=0;
 const rows=includeUntimed?[...snapshot.rows,...(snapshot.untimedRows||[])]:snapshot.rows;
 for(let i=0;i<rows.length;i++){
  const row=rows[i],uf=snapshot.states[row[0]];if(!includeExterior&&uf==='ZZ')continue;
  const key=row[9]??`section:${i}`;let g=byPlace.get(key);
  if(!g){g={closing:-Infinity,lula:0,flavio:0,urnCount:0,region:regions.findIndex(r=>r.includes(uf))};if(g.region<0)throw Error('Região desconhecida');byPlace.set(key,g);groups.push(g);}
  if(row[1]!==null)g.closing=Math.max(g.closing,adjustedClosing(row[1],uf));g.lula+=row[2];g.flavio+=row[3];g.urnCount++;totalLula+=row[2];totalFlavio+=row[3];urns++;
 }
 for(const g of groups)maxClosing=Math.max(maxClosing,g.closing);
 const bins=Math.ceil((maxClosing+12*3600-START_TIME)/ENSEMBLE_STEP)+1;
 return {urnCount:Uint32Array.from(groups,g=>g.urnCount),closing:Float64Array.from(groups,g=>g.closing),lula:Float64Array.from(groups,g=>g.lula),flavio:Float64Array.from(groups,g=>g.flavio),region:Uint8Array.from(groups,g=>g.region),bins,totalLula,totalFlavio,urns,places:groups.length};
}
export function ensembleLevels(seed,regional){
 const random=seededRandom((seed^0xa511e9b3)>>>0);
 return Uint8Array.from(Object.keys(REGIONS),()=>regional?1+Math.floor(random()*5):3);
}
export function createEnsembleSampler(prepared){
 const l=new Float64Array(prepared.bins),f=new Float64Array(prepared.bins);
 return (seed,regional,output)=>{
  l.fill(0);f.fill(0);const levels=ensembleLevels(seed,regional),random=seededRandom(seed);let last=0;
  for(let i=0;i<prepared.places;i++){
   const time=prepared.closing[i]+dispatchMinutes(levels[prepared.region[i]],prepared.closing[i],random)*60;
   const bin=Math.max(0,Math.ceil((time-START_TIME)/ENSEMBLE_STEP));
   if(bin>=prepared.bins)throw Error('Um atraso excedeu a janela de cálculo. Gere novamente com outro sorteio.');
   last=Math.max(last,bin);l[bin]+=prepared.lula[i];f[bin]+=prepared.flavio[i];
  }
  let a=0,b=0;
  for(let i=0;i<prepared.bins;i++){a+=l[i];b+=f[i];output[i]=a+b?100*a/(a+b):NaN;}
  return last;
 };
}
export function ensembleSeed(base,index){return ((Number(base)>>>0)+Math.imul(index,0x9e3779b9))>>>0;}
export const PERCENT_PREFIX=32,PERCENT_STEPS=200,PERCENT_POINTS=1+PERCENT_PREFIX+PERCENT_STEPS;
function percentCurve(prepared,order,ready,output){
 let cursor=0,count=0,lula=0,flavio=0,point=0;
 const consume=()=>{const i=order[cursor++];count+=prepared.urnCount[i];lula+=prepared.lula[i];flavio+=prepared.flavio[i];};
 const put=()=>{output[point++]=count/prepared.urns;output[point++]=lula+flavio?100*lula/(lula+flavio):NaN;};
 if(ready)while(cursor<order.length&&ready[order[cursor]]<=START_TIME)consume();
 put();
 for(let i=0;i<PERCENT_PREFIX;i++){if(cursor<order.length)consume();put();}
 for(let i=1;i<=PERCENT_STEPS;i++){
  const target=prepared.urns*i/PERCENT_STEPS;
  while(cursor<order.length&&count+prepared.urnCount[order[cursor]]<=target+1e-7)consume();
  put();
 }
}
export function createPermutationSampler(prepared){
 const order=new Uint32Array(prepared.places);
 return (seed,output)=>{
  const random=seededRandom(seed);for(let i=0;i<order.length;i++)order[i]=i;
  for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1)),t=order[i];order[i]=order[j];order[j]=t;}
  percentCurve(prepared,order,null,output);
 };
}
export function regionalSpeedConfig({speedMode='random',fixedLevels={}}={}){
 if(!['random','fixed'].includes(speedMode))throw Error('Escolha de velocidades inválida.');
 if(speedMode==='random')return {speedMode,fixedLevels:null};
 const levels=Object.fromEntries(Object.keys(REGIONS).map(region=>{
  const level=Number(fixedLevels?.[region]??3);
  if(!Number.isInteger(level)||level<1||level>5)throw Error('Velocidade regional inválida.');
  return [region,level];
 }));
 return {speedMode,fixedLevels:levels};
}
export function regionalSpeedKey(options={}){
 const config=regionalSpeedConfig(options);
 return config.speedMode==='random'?'random':`fixed-${Object.keys(REGIONS).map(r=>config.fixedLevels[r]).join('')}`;
}
export function createFullRegionalSampler(prepared,options={}){
 const config=regionalSpeedConfig(options),fixed=config.fixedLevels?Uint8Array.from(Object.keys(REGIONS),r=>config.fixedLevels[r]):null;
 const dispatch=createDispatchSampler(prepared.closing,fixed?[...fixed]:[1,2,3,4,5]);
 const l=new Float64Array(prepared.bins),f=new Float64Array(prepared.bins),ready=new Float64Array(prepared.places),keys=new Float64Array(prepared.places),digits=new Uint16Array(keys.buffer),counts=new Uint32Array(65536);
 let order=new Uint32Array(prepared.places),scratch=new Uint32Array(prepared.places);
 const little=new Uint8Array(new Uint16Array([1]).buffer)[0]===1,words=new Uint32Array(keys.buffer),high=little?1:0,low=little?0:1;
 return (seed,timeOutput,percentOutput)=>{
  const random=seededRandom(seed),levels=fixed||ensembleLevels(seed,true);l.fill(0);f.fill(0);let last=0;
  for(let i=0;i<prepared.places;i++){
   const time=prepared.closing[i]+dispatch(levels[prepared.region[i]],i,random)*60;
   ready[i]=time;keys[i]=time;order[i]=i;const h=2*i+high,q=2*i+low;if(words[h]>>>31){words[h]=~words[h];words[q]=~words[q];}else words[h]^=0x80000000;
   const bin=Math.max(0,Math.ceil((time-START_TIME)/ENSEMBLE_STEP));if(bin>=prepared.bins)throw Error('Atraso fora da janela de cálculo.');
   last=Math.max(last,bin);l[bin]+=prepared.lula[i];f[bin]+=prepared.flavio[i];
  }
  // Stable radix sort of signed IEEE-754 doubles: exact ordering without
  // rounding dispatch times or sorting objects in each of the 10,000 runs.
  for(let pass=0;pass<4;pass++){
   counts.fill(0);const part=little?pass:3-pass;
   for(let j=0;j<order.length;j++)counts[digits[order[j]*4+part]]++;
   let position=0;for(let j=0;j<counts.length;j++){const n=counts[j];counts[j]=position;position+=n;}
   for(let j=0;j<order.length;j++){const i=order[j];scratch[counts[digits[i*4+part]]++]=i;}
   const swap=order;order=scratch;scratch=swap;
  }
  percentCurve(prepared,order,ready,percentOutput);
  let a=0,b=0;for(let i=0;i<prepared.bins;i++){a+=l[i];b+=f[i];timeOutput[i]=a+b?100*a/(a+b):NaN;}
  return last;
 };
}
export function encodeEnsemble(result){
 const meta={...result,curves:undefined,percentCoords:undefined};const header=new TextEncoder().encode(JSON.stringify(meta));
 const total=4+header.length+(result.curves?.byteLength||0)+result.percentCoords.byteLength,out=new Uint8Array(total),view=new DataView(out.buffer);view.setUint32(0,header.length,true);out.set(header,4);let cursor=4+header.length;
 if(result.curves){out.set(new Uint8Array(result.curves.buffer,result.curves.byteOffset,result.curves.byteLength),cursor);cursor+=result.curves.byteLength;}
 out.set(new Uint8Array(result.percentCoords.buffer,result.percentCoords.byteOffset,result.percentCoords.byteLength),cursor);return out;
}
export function decodeEnsemble(buffer){
 const view=new DataView(buffer),length=view.getUint32(0,true),meta=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,length)));if(meta.version!==2||meta.count!==ENSEMBLE_COUNT)throw Error('Conjunto de cenários incompatível.');
 let cursor=4+length,curves;
 if(meta.points){const size=meta.count*meta.points*4;curves=new Float32Array(buffer.slice(cursor,cursor+size));cursor+=size;}
 const size=meta.count*meta.percentPoints*2*4;if(cursor+size!==buffer.byteLength)throw Error('Conjunto de cenários incompleto.');
 return {...meta,curves,percentCoords:new Float32Array(buffer.slice(cursor))};
}
