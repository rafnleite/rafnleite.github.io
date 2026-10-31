export const METHODS = Object.freeze({all:'Todas as formas',biometria:'Biometria',sem:'Sem biometria',falha:'Falha na biometria',indeterminado:'Indeterminado'});
export const HISTOGRAM_METHODS = Object.freeze([
  Object.freeze({key:'biometria',label:'Biometria',color:'#4c8061'}),
  Object.freeze({key:'sem',label:'Sem biometria',color:'#4f7da0'}),
  Object.freeze({key:'falha',label:'Falha na biometria',color:'#bf914a'}),
  Object.freeze({key:'indeterminado',label:'Indeterminado',color:'#929b99'}),
]);
const methodKey=method=>method===1?'biometria':method===3?'sem':method===2?'falha':'indeterminado';
const methodCodes=Object.freeze({biometria:[1],sem:[3],falha:[2],indeterminado:[0,4],all:[0,1,2,3,4]});
function selectedMethodCodes(filter){
  const filters=Array.isArray(filter)?filter:[filter];
  return new Set(filters.flatMap(key=>methodCodes[key]||[]));
}
export function coveragePercent(sections,expected) {
  if(!Number.isFinite(sections)||!Number.isFinite(expected)||expected<=0)return 0;
  return sections<expected?Math.min(99.99,100*sections/expected):100;
}
export function loadStateEntry(cache,entry,fetcher) {
  if(cache.loaded.has(entry.uf))return Promise.resolve(cache.loaded.get(entry.uf));
  if(cache.pending.has(entry.uf))return cache.pending.get(entry.uf);
  const manifest=cache.manifest;
  const request=Promise.resolve().then(()=>fetcher(entry)).then(data=>{
    if(cache.manifest===manifest)cache.loaded.set(entry.uf,data);
    return data;
  }).finally(()=>{
    if(cache.manifest===manifest&&cache.pending.get(entry.uf)===request)cache.pending.delete(entry.uf);
  });
  cache.pending.set(entry.uf,request);
  return request;
}
export function methodMatches(method, filter='all') {
  return filter==='all'||selectedMethodCodes(filter).has(method);
}
export function timeLabel(minute) {
  const day=Math.floor(minute/1440), m=((Math.round(minute)%1440)+1440)%1440;
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}${day?` (${day>0?'+':''}${day}d)`:''}`;
}
export function histogramTimePosition(bins,minute) {
  if(!Array.isArray(bins)||!bins.length||!Number.isFinite(minute))return null;
  if(minute<bins[0].start||minute>bins.at(-1).end)return null;
  if(minute===bins.at(-1).end)return 1;
  for(let index=0;index<bins.length;index++){
    const {start,end}=bins[index];
    if(minute>=start&&minute<end&&end>start)return (index+(minute-start)/(end-start))/bins.length;
  }
  return null;
}
export function radiusForVotes(votes, reference, maxRadius=27) {
  return votes>0&&reference>0?Math.max(8,Math.sqrt(votes/reference)*maxRadius):0;
}
export const PACKED_ROW_ENCODING='u32-minute4096-method3-count16';
export function compactVotingAreas(data,inheritedEncoding){
  const rowEncoding=data.rowEncoding||inheritedEncoding;
  const areas=data.locations||data.zones||[];
  for(const area of areas){
    area.rowEncoding=area.rowEncoding||rowEncoding;
    if(area.rowEncoding&&area.rowEncoding!==PACKED_ROW_ENCODING)throw new Error('Codificação dos horários incompatível.');
    if(area.rowEncoding===PACKED_ROW_ENCODING){
      if(!(area.rows instanceof Uint32Array))area.rows=Uint32Array.from(area.rows||[]);
    }else if(!(area.rows instanceof Int32Array)){
      const rows=area.rows||[],nested=Array.isArray(rows[0]),compact=new Int32Array(nested?rows.length*3:rows.length);
      if(nested){for(let i=0;i<rows.length;i++)compact.set(rows[i],i*3);}else compact.set(rows);
      area.rows=compact;
    }
  }
  return data;
}
export async function hydrateVotingAreas(data,inheritedEncoding){
  if(data.rowData){
    if(data.rowData.encoding!=='gzip-base64-u32le'||typeof data.rowData.data!=='string')throw new Error('Formato dos horários compactados incompatível.');
    let bytes;
    try{
      const binary=atob(data.rowData.data),compressed=new Uint8Array(binary.length);
      for(let index=0;index<binary.length;index++)compressed[index]=binary.charCodeAt(index);
      delete data.rowData;
      bytes=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    }catch{throw new Error('Não foi possível descompactar os horários de votação.');}
    if(bytes.byteLength%4)throw new Error('Tamanho dos horários compactados inválido.');
    let words=new Uint32Array(bytes);
    if(new Uint8Array(new Uint32Array([1]).buffer)[0]!==1){const view=new DataView(bytes);words=new Uint32Array(bytes.byteLength/4);for(let index=0;index<words.length;index++)words[index]=view.getUint32(index*4,true);}
    for(const area of data.locations||[]){
      const {rowOffset:offset,rowLength:length}=area;
      if(!Number.isInteger(offset)||!Number.isInteger(length)||offset<0||length<0||offset>words.length||length>words.length-offset)throw new Error('Índice dos horários compactados inválido.');
      area.rows=words.subarray(offset,offset+length);area.rowEncoding=area.rowEncoding||data.rowEncoding||inheritedEncoding||PACKED_ROW_ENCODING;
    }
  }
  return compactVotingAreas(data,inheritedEncoding);
}
export async function loadVotingDocument(uf,data,readPart){
  if(![1,2].includes(data.schemaVersion)||data.uf!==uf||!Array.isArray(data.municipalities))throw new Error(`Os dados de ${uf} não têm o formato esperado.`);
  if(Array.isArray(data.parts)){
    const groups=new Array(data.parts.length);let position=0;
    await Promise.all(Array.from({length:Math.min(2,data.parts.length)},async()=>{
      while(position<data.parts.length){
        const index=position++,part=await readPart(data.parts[index].url);
        if(part.schemaVersion!==2||part.uf!==uf||!Array.isArray(part.locations))throw new Error(`Uma parte dos dados de ${uf} está incompatível.`);
        groups[index]=(await hydrateVotingAreas(part,data.rowEncoding)).locations;
      }
    }));
    return {...data,locations:groups.flat()};
  }
  if(!Array.isArray(data.locations)&&!Array.isArray(data.zones))throw new Error(`Os dados de ${uf} não têm o formato esperado.`);
  return hydrateVotingAreas(data);
}
export function aggregate(states, {uf='ALL',municipality='ALL',zone='ALL',geographyPaths=null,method='all',start=0,end=1440,bin=5}={}) {
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!Number.isInteger(bin)||bin<1)throw new Error('Intervalo inválido.');
  if(geographyPaths!==null&&!(geographyPaths instanceof Set))throw new Error('Seleção geográfica inválida.');
  const bins=Array.from({length:Math.ceil((end-start)/bin)},(_,i)=>({start:start+i*bin,end:Math.min(end,start+(i+1)*bin),count:0,methods:{biometria:0,sem:0,falha:0,indeterminado:0}}));
  const allMethods=method==='all',allowedMethods=selectedMethodCodes(method);
  const allowedUFs=uf==='ALL'?null:new Set(Array.isArray(uf)?uf:[uf]);
  let total=0,selected=0,sections=0,indeterminate=0;
  const groups=new Map(),centers=new Map(),places=new Map();
  for(const state of states) {
    if(allowedUFs&&!allowedUFs.has(state.uf))continue;
    const municipalities=new Map(state.municipalities.map(m=>[String(m.code),m]));
    const isPlaces=Array.isArray(state.locations),areas=isPlaces?state.locations:state.zones;
    for(const area of areas) {
      const cityKey=`${state.uf}/${area.municipality}`, zoneKey=`${state.uf}/${area.zone}`;
      if(municipality!=='ALL'&&cityKey!==municipality||zone!=='ALL'&&zoneKey!==zone)continue;
      if(geographyPaths&&!geographyPaths.has(`${state.uf}/${Number(area.municipality)}/${Number(area.zone)}`))continue;
      const city=municipalities.get(String(area.municipality));
      sections+=area.sections||0;
      const lat=Number.isFinite(area.lat)?area.lat:city?.lat,lng=Number.isFinite(area.lng)?area.lng:city?.lng;
      if(Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&!(lat===-1&&lng===-1)&&!(lat===0&&lng===0)){
        const weight=area.sections>0?area.sections:1,center=centers.get(zoneKey)||{lat:0,lng:0,weight:0};
        center.lat+=lat*weight;center.lng+=lng*weight;center.weight+=weight;centers.set(zoneKey,center);
      }
      let local=0;
      const rows=area.rows,packed=(area.rowEncoding||state.rowEncoding)===PACKED_ROW_ENCODING,nested=!packed&&Array.isArray(rows[0]),stride=packed||nested?1:3;
      for(let index=0;index<rows.length;index+=stride) {
        const row=rows[index],minute=packed?(row>>>19)-4096:nested?row[0]:row,type=packed?(row>>>16)&7:nested?row[1]:rows[index+1],count=packed?row&65535:nested?row[2]:rows[index+2];
        if(!allMethods&&!allowedMethods.has(type))continue;
        total+=count;
        if(minute<start||minute>=end)continue;
        selected+=count;local+=count;
        if(type===0||type===4)indeterminate+=count;
        const interval=bins[Math.floor((minute-start)/bin)];
        interval.count+=count;
        interval.methods[methodKey(type)]+=count;
      }
      if(!local)continue;
      let group=groups.get(zoneKey);
      if(!group){group={key:zoneKey,uf:state.uf,zone:area.zone,count:0,sections:0,cities:new Set()};groups.set(zoneKey,group);}
      group.count+=local;group.sections+=area.sections||0;group.cities.add(city?.name||String(area.municipality));
      if(isPlaces){
        const located=Number.isFinite(area.lat)&&Number.isFinite(area.lng)&&Math.abs(area.lat)<=90&&Math.abs(area.lng)<=180&&!(area.lat===-1&&area.lng===-1)&&!(area.lat===0&&area.lng===0);
        const key=String(area.id),place=places.get(key)||{key,uf:state.uf,municipality:String(area.municipality),city:city?.name||String(area.municipality),zone:area.zone,number:area.number,name:area.name||'Local não identificado',address:area.address||'',coordinateSource:area.coordinateSource||'',coordinateBasis:area.coordinateBasis||'',coordinatePrecision:area.coordinatePrecision||'',coordinateAttribution:area.coordinateAttribution||'',count:0,sections:0,lat:located?area.lat:null,lng:located?area.lng:null};
        if(place.lat===null||place.lng===null)place.lat=place.lng=null;
        place.election=state.results?.[key]||null;
        place.count+=local;place.sections+=area.sections||0;places.set(key,place);
      }
    }
  }
  const zones=[...groups.values()].map(g=>{const c=centers.get(g.key);return {...g,cities:[...g.cities].sort(),lat:c?c.lat/c.weight:null,lng:c?c.lng/c.weight:null};}).sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));
  const locations=[...places.values()].sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));
  const unmappedVotes=states.some(s=>Array.isArray(s.locations))?selected-locations.filter(p=>p.lat!==null).reduce((sum,p)=>sum+p.count,0):zones.filter(z=>z.lat===null).reduce((sum,z)=>sum+z.count,0);
  return {bins,total,selected,outside:total-selected,sections,indeterminate,zones,locations,unmappedVotes};
}
