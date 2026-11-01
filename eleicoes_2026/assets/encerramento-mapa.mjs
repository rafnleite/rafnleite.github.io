import {addStateBoundaries} from '../analises/map-boundaries.mjs';
import {delayReport,closingLabel} from '../analises/atraso-model.mjs';
import {electionSummary,ELECTION_SCALE,ELECTION_COLORS} from '../analises/election-results.mjs';
import {mapLevelForBounds} from '../analises/map-scale.mjs';
import {createMapTooltip} from '../analises/ui-overlays.mjs';
import {electionHTML} from '../analises/biometria-details.mjs?v=tooltip-2';

const $=id=>document.getElementById(id),fmt=new Intl.NumberFormat('pt-BR');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const container=$('closing-map'),slider=$('closing-map-threshold'),time=$('closing-map-time'),status=$('closing-map-status');
let data,result,map,layer,tooltip,popup,level='zones',timer;
const hide=()=>{tooltip?.remove();popup?.remove();};
const color=values=>{const r=electionSummary({lula:values[3],flavio:values[4],bus:values[0],sections:values[0]});return r.colorPosition===null?ELECTION_COLORS.missing:echarts.color.lerp(r.colorPosition,ELECTION_SCALE);};
const reference=marker=>({contextElement:container,getBoundingClientRect(){const rect=container.getBoundingClientRect(),p=map.latLngToContainerPoint(marker.getLatLng());return new DOMRect(rect.left+p.x,rect.top+p.y,1,1);}});
function detail(g){
 const election={lula:g.values[3],flavio:g.values[4],bus:g.values[0],sections:g.values[0]};
 const scope=g.isZone?'DA ZONA NO RECORTE':'DO LOCAL NO RECORTE';
 return `<strong>${escape(g.name)}</strong><br><small>${escape([...g.cities].join(', '))} / ${escape(g.uf)} · Zona ${escape(g.zone)}<br>Encerramento a partir de ${closingLabel(Number(slider.value)*60)} · Brasília<br>Último encerramento: ${closingLabel(g.latest)}${g.isZone?'<br>Clique para aproximar os locais de votação.':''}</small>${electionHTML(election,scope)}<small>Brancos: ${fmt.format(g.values[6])} · Nulos: ${fmt.format(g.values[5])}</small>`;
}
function renderMap(){
 if(!result)return;hide();layer.clearLayers();const b=map.getBounds();level=mapLevelForBounds({north:b.getNorth(),south:b.getSouth(),east:b.getEast(),west:b.getWest()},level);
 const mapped=result.places.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&!(p.lat===0&&p.lng===0)&&!(p.lat===-1&&p.lng===-1));
 const groups=new Map();for(const p of mapped){const isZone=level==='zones',key=isZone?`${p.uf}/${p.zone}`:p.id;
  if(!groups.has(key))groups.set(key,{uf:p.uf,zone:p.zone,isZone,name:isZone?`Zona ${p.zone} / ${p.uf}`:p.name,cities:new Set(),lat:0,lng:0,weight:0,values:Array(7).fill(0),latest:0});
  const g=groups.get(key),weight=p.values[0];g.cities.add(p.city);g.lat+=p.lat*weight;g.lng+=p.lng*weight;g.weight+=weight;g.latest=Math.max(g.latest,p.latest);for(let i=0;i<7;i++)g.values[i]+=p.values[i];
 }
 const bounds=b.pad(.15),largest=[...groups.values()].reduce((max,g)=>Math.max(max,g.values[0]),1);
 for(const g of groups.values()){
  const pos=[g.lat/g.weight,g.lng/g.weight];if(!bounds.contains(pos))continue;
  const c=color(g.values),marker=L.circleMarker(pos,{radius:Math.max(5,Math.sqrt(g.values[0]/largest)*24),color:c,fillColor:c,fillOpacity:.88,weight:1}).addTo(layer);
  marker.on('mouseover',event=>{if(event.originalEvent?.pointerType!=='touch'&&!popup.isOpen())tooltip.show(reference(marker),detail(g));});marker.on('mouseout',()=>tooltip.remove());
  marker.on('click',()=>{hide();if(g.isZone){const points=mapped.filter(p=>p.uf===g.uf&&Number(p.zone)===Number(g.zone)).map(p=>[p.lat,p.lng]);if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[35,35],maxZoom:points.length===1?15:13});}else popup.show(reference(marker),detail(g));});
 }
 const missing=result.totals[0]-mapped.reduce((sum,p)=>sum+p.values[0],0);
 status.textContent=`${fmt.format(result.totals[0])} urnas no recorte · visão por ${level==='zones'?'zona eleitoral':'local de votação'} · ${fmt.format(missing)} sem coordenadas no mapa.`;
}
function update(){
 const minute=Number(slider.value);time.value=closingLabel(minute*60).slice(0,5);$('closing-map-label').textContent=closingLabel(minute*60);
 result=delayReport(data,{minute,ufs:new Set(data.places.map(p=>p.uf).filter(uf=>uf!=='ZZ'))});renderMap();
}
async function load(){
 try{
  const response=await fetch('analises/atraso-data.json.gz');if(!response.ok)throw Error(`HTTP ${response.status}`);
  data=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();if(data.schemaVersion!==1||data.turn!==2)throw Error('Base incompatível');
  map=L.map(container,{preferCanvas:true,scrollWheelZoom:false}).setView([-14.5,-52.5],4);addStateBoundaries(map);layer=L.layerGroup().addTo(map);tooltip=createMapTooltip();popup=createMapTooltip({interactive:true});
  map.on('movestart zoomstart',hide);map.on('moveend zoomend',renderMap);new ResizeObserver(()=>map.invalidateSize({pan:false})).observe(container);
  slider.addEventListener('input',()=>{const minute=Number(slider.value);time.value=closingLabel(minute*60).slice(0,5);$('closing-map-label').textContent=closingLabel(minute*60);clearTimeout(timer);timer=setTimeout(update,150);});
  time.addEventListener('change',()=>{if(!time.value)return;const [h,m]=time.value.split(':').map(Number);slider.value=String(Math.max(1020,Math.min(1439,h*60+m)));update();});
  update();
 }catch(error){status.textContent='Não foi possível carregar o mapa de encerramentos.';console.error(error);}
}
const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();load();}},{rootMargin:'500px'});observer.observe(container);
