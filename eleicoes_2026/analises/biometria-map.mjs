import {createMapTooltip} from './ui-overlays.mjs';
import {mapLevelForBounds} from './map-scale.mjs';
import {biometryDetailHTML,electionHTML} from './biometria-details.mjs?v=tooltip-2';
export {proportions} from './biometria-details.mjs?v=tooltip-2';
const labels=['Biometria','Sem biometria','Falha na biometria','Indeterminado / motivo não definido'];
const fmt=new Intl.NumberFormat('pt-BR'),pf=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
export const localElectionHTML=electionHTML;
export function distributionHTML(item,local=false){
 return biometryDetailHTML({title:local?`${item.name||'Local de votação'} · Local ${item.number??'—'}`:`${item.uf} · Zona ${item.zone}`,subtitle:local?`${item.city} / ${item.uf} · Zona ${item.zone}`:item.municipalities.join(', '),address:local?item.address:'',counts:item.counts,covered:item.covered,expected:item.expected,election:item.election,scope:local?'DO LOCAL':'DA ZONA'});
}
export function createBiometryMap({map,layer,data,selectedZones,method,choose,json}){
 let level='zones',generation=0,index,cache=new Map();
 const tooltip=createMapTooltip(),popup=createMapTooltip({interactive:true});
 const reference=point=>({contextElement:document.getElementById('map'),getBoundingClientRect(){const rect=map.getContainer().getBoundingClientRect(),p=map.latLngToContainerPoint(point.getLatLng());return new DOMRect(rect.left+p.x,rect.top+p.y,1,1);}});
 const $=id=>document.getElementById(id);
 const positions=z=>Number.isFinite(z.lat)&&Number.isFinite(z.lon);
 const load=uf=>{if(!cache.has(uf))cache.set(uf,json(`./biometria/locais-${uf}.json`).catch(e=>{cache.delete(uf);throw e;}));return cache.get(uf);};
 function marker(item,local,scale,m){
  const n=item.counts.reduce((a,b)=>a+b,0);if(!positions(item)||!n)return false;
  const rate=Math.min(1,item.counts[m]*100/n/scale),rgb=[255+(177-255)*rate,244+(62-244)*rate,219+(35-219)*rate].map(Math.round);
  const point=L.circleMarker([item.lat,item.lon],{radius:local?5:7,color:'#775d40',weight:1,fillColor:`rgb(${rgb})`,fillOpacity:.9}).addTo(layer);
  const content=distributionHTML(item,local);
  point.on('mouseover',e=>{if(e.originalEvent?.pointerType!=='touch'&&!popup.isOpen())tooltip.show(reference(point),content+(local?'':'<small>Clique para aproximar esta zona.</small>'));});
  point.on('mouseout',()=>tooltip.remove());
  point.on('click',()=>{tooltip.remove();if(local)popup.show(reference(point),content);else{popup.remove();choose(item);}});
  return true;
 }
 async function render(){
  const ticket=++generation,zones=selectedZones(),b=map.getBounds(),m=method(),scale=m===0?100:m===3?1:20;
  tooltip.remove();popup.remove();
  level=mapLevelForBounds({north:b.getNorth(),south:b.getSouth(),east:b.getEast(),west:b.getWest()},level);
  const local=level==='locations';layer.clearLayers();
  $('mapTitle').textContent=labels[m]+(local?' por local de votação':' por zona');
  $('map').setAttribute('aria-label',local?'Mapa de biometria por local de votação':'Mapa de biometria por zona eleitoral');
  document.querySelectorAll('#bioScaleLabels strong').forEach((label,i)=>{label.textContent=pf.format(scale*i/4).replace(',00','')+'%'+(i===4?' ou mais':'');});
  $('bioScaleScope').textContent=labels[m]+' · percentual dos votos nos logs';
  document.querySelector('.bio-color-bar').setAttribute('aria-label',`${labels[m]}: de 0% a ${scale}% ou mais`);
  let plotted=0;
  if(!local)for(const z of zones)if(z.uf!=='ZZ'&&marker(z,false,scale,m))plotted++;
  try{
   const states=[...new Set(zones.filter(z=>local||z.uf==='ZZ').map(z=>z.uf))];
   if(states.length){
    $('mapStatus').textContent='Carregando locais de votação…';
    index??=await json('./biometria/locais-index.json');
    if(ticket!==generation)return;
    const visibleStates=states.filter(uf=>{const box=index[uf];return box&&b.intersects([[box.south,box.west],[box.north,box.east]]);});
    const groups=await Promise.all(visibleStates.map(load));if(ticket!==generation)return;
    const keys=new Set(zones.map(z=>`${z.uf}:${z.zone}`));
    for(const p of groups.flat())if(keys.has(`${p.uf}:${p.zone}`)&&positions(p)&&b.contains([p.lat,p.lon])&&marker(p,true,scale,m))plotted++;
   }
   if(ticket!==generation)return;
   $('mapStatus').textContent=`${fmt.format(plotted)} pontos no mapa. ${local?'Locais de votação: afaste para agrupar por zona.':'Zonas: aproxime para ver os locais de votação. Exterior por local em qualquer escala.'} Escala de 0% a ${scale}%; valores acima usam a cor máxima.`;
  }catch(e){if(ticket===generation)$('mapStatus').textContent='Não foi possível carregar os locais. '+e.message;}
 }
 map.on('movestart zoomstart',()=>{tooltip.remove();popup.remove();});
 map.on('moveend zoomend resize',render);
 return {render};
}
