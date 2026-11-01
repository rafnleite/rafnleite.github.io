import {addStateBoundaries} from '../analises/map-boundaries.mjs';
import {createBiometryMap,localElectionHTML} from '../analises/biometria-map.mjs?v=tooltip-2';
import {createMapTooltip} from '../analises/ui-overlays.mjs';

const $=id=>document.getElementById(id);
const integer=new Intl.NumberFormat('pt-BR');
const red='#bf3438',blue='#24568c';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
let contextBySection=new Map(),researchBySection={};
const sectionKey=row=>`${row.uf}:${row.municipio_codigo}:${row.zona}:${row.secao}`;
function contextLabels(row){
 const key=`${row.uf}:${row.municipio_codigo}:${row.zona}:${row.secao}`;
 const official=contextBySection.get(key);
 if(official)return official;
 const name=normalize(row.local),labels=[];
 if(Number(row.eleitores_aptos)<100)labels.push('Menos de 100 eleitores aptos (BU)');
 if(/INDIG|ALDEIA/.test(name))labels.push('Referência indígena/aldeia no nome do local (TSE)');
 if(/PRESID|CADEIA|DETENCAO|PRISION|PENITENCI/.test(name))labels.push('Unidade prisional no nome do local (TSE)');
 if(/QUILOMB/.test(name))labels.push('Referência quilombola no nome do local (TSE)');
 if(/ASSENTAMENTO/.test(name))labels.push('Assentamento no nome do local; vínculo ao MST não confirmado');
 if(/POVOADO|ZONA RURAL/.test(name))labels.push('Povoado/zona rural no nome do local (TSE)');
 return labels;
}
const labelClass=label=>{const value=normalize(label);return /TERRA INDIGENA|INDIGENA|ALDEIA/.test(value)?'ti':/PRISION|PRESID|CADEIA|DETENCAO|PENITENCI/.test(value)?'prisional':/QUILOMBOLA/.test(value)?'quilombola':/ASSENTAMENTO/.test(value)?'assentamento':/POVOADO|ZONA RURAL/.test(value)?'rural':'pouco';};
function shortLabel(label,row){
 const type=labelClass(label);
 if(type==='ti')return label.startsWith('Coordenada do local dentro da Terra Indígena ')?label.replace('Coordenada do local dentro da Terra Indígena ','TI ').replace(/ \(FUNAI\)$/,''):'Aldeia / referência indígena';
 if(type==='pouco')return `Apenas ${integer.format(row.eleitores_aptos)} eleitores`;
 return {prisional:'Unidade prisional',quilombola:'Quilombola',assentamento:'Assentamento',rural:'Povoado rural'}[type];
}
function displayLabels(row){
 const labels=contextLabels(row);
 const hasTerritory=labels.some(label=>label.startsWith('Coordenada do local dentro da Terra Indígena '));
 return labels.filter(label=>!hasTerritory||!label.startsWith('Referência indígena/aldeia no nome do local'));
}
const contextHTML=row=>{
 const research=researchBySection[sectionKey(row)];
 const labels=displayLabels(row).filter(label=>!research||labelClass(label)!==research.tipo).map(label=>`<span class="unanimity-context-label ${labelClass(label)}" title="${esc(label)}">${esc(shortLabel(label,row))}</span>`).join('');
 const added=research?`<a href="${esc(research.fonte)}" target="_blank" rel="noopener noreferrer" title="Fonte da pesquisa"><span class="unanimity-context-label ${esc(research.tipo)}">${esc(research.texto)}</span></a>`:'';
 return labels+added||'<span class="context-none">Sem indicação textual</span>';
};

function initializeUnanimityMap(rows){
 const map=L.map('unanimity-map',{preferCanvas:true,scrollWheelZoom:false}).setView([-14,-53],4);
 L.control.scale({imperial:false}).addTo(map);
 addStateBoundaries(map);
 map.createPane('indigenous');map.getPane('indigenous').style.zIndex=350;
 fetch('dados/terras-indigenas-contornos.geojson?v=poligonos-2',{cache:'force-cache'}).then(response=>{if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();}).then(data=>L.geoJSON(data,{pane:'indigenous',interactive:false,style:{stroke:false,fill:true,fillColor:'#3a9b5b',fillOpacity:.5}}).addTo(map)).catch(error=>{ $('unanimity-map-status').textContent='Não foi possível carregar os contornos das terras indígenas.';console.error(error); });
 map.attributionControl.addAttribution('Resultados e coordenadas eleitorais: TSE · Polígonos de Terras Indígenas: FUNAI');
 const groups=L.layerGroup().addTo(map);
 const tooltip=createMapTooltip(),popup=createMapTooltip({interactive:true});
 const reference=point=>({contextElement:map.getContainer(),getBoundingClientRect(){const rect=map.getContainer().getBoundingClientRect(),p=map.latLngToContainerPoint(point.getLatLng());return new DOMRect(rect.left+p.x,rect.top+p.y,1,1);}});
 const hideOverlays=()=>{tooltip.remove();popup.remove();};
 function update(){
    const filtered=rows;
  hideOverlays();groups.clearLayers();let located=0;
  for(const row of filtered){
   if(!Number.isFinite(row.latitude)||!Number.isFinite(row.longitude)||row.latitude===-1&&row.longitude===-1)continue;
     located++;const valid=row.lula+row.flavio,color=row.lula>0?red:blue,labels=contextLabels(row);
     const context=labels.length||researchBySection[sectionKey(row)]?`<hr><strong>Contexto indicado no cadastro</strong><br>${contextHTML(row)}`:'';
     const marker=L.circleMarker([row.latitude,row.longitude],{radius:3+Math.sqrt(valid)/2.8,color:'#fff',weight:.7,fillColor:color,fillOpacity:.8}).addTo(groups);
     const content=`<strong>${esc(row.local)}</strong><br><small>${esc(row.municipio)} / ${esc(row.uf)} · Zona ${esc(row.zona)} · Seção ${esc(row.secao)}</small>${localElectionHTML({lula:row.lula,flavio:row.flavio,bus:1,sections:1})}<small>Brancos: ${integer.format(row.brancos)} · Nulos: ${integer.format(row.nulos)}<br>Comparecimento: ${integer.format(row.comparecimento)}</small>${context}<br><a href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">Consultar BU de origem</a>`;
     marker.on('mouseover',event=>{if(event.originalEvent?.pointerType!=='touch'&&!popup.isOpen())tooltip.show(reference(marker),content);});
     marker.on('mouseout',()=>tooltip.remove());
     marker.on('click',()=>{tooltip.remove();popup.show(reference(marker),content);});
  }
    const labelled=filtered.filter(row=>contextLabels(row).length||researchBySection[sectionKey(row)]).length;
    $('unanimity-count').textContent=`${integer.format(filtered.length)} seções · ${integer.format(located)} com coordenadas · ${integer.format(labelled)} com rótulo contextual. A área dos círculos varia com os votos válidos; pontos no mesmo local podem se sobrepor.`;
    $('unanimity-rows').innerHTML=[...filtered].sort((a,b)=>(b.lula+b.flavio)-(a.lula+a.flavio)).map(row=>`<tr><td>${esc(row.uf)}<br>${esc(row.municipio)}</td><td>Z ${row.zona}<br>S ${row.secao}</td><td><a href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${esc(row.local)}</a><br>${contextHTML(row)}</td><td class="num vote-lula">${integer.format(row.lula)}</td><td class="num vote-flavio">${integer.format(row.flavio)}</td><td class="num">${row.brancos} / ${row.nulos}</td></tr>`).join('');
 }
 update();
 map.on('movestart zoomstart',hideOverlays);
 new ResizeObserver(()=>map.invalidateSize({pan:false})).observe($('unanimity-map'));
}

async function initializeBiometryMap(){
 const status=$('mapStatus');
 try{
  const response=await fetch('analises/biometria/manifest.json',{cache:'force-cache'});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const data=await response.json(),map=L.map('map',{preferCanvas:true}).setView([-14,-52],4),layer=L.layerGroup().addTo(map),method=$('reportBioMethod');
  L.control.scale({imperial:false}).addTo(map);addStateBoundaries(map);
  const json=async path=>{const url=new URL(path.replace(/^\.\//,''),new URL('analises/',document.baseURI)),result=await fetch(url);if(!result.ok)throw new Error(`HTTP ${result.status}`);return result.json();};
  const choose=zone=>{const points=data.zones.filter(item=>item.uf===zone.uf&&item.zone===zone.zone&&Number.isFinite(item.lat)&&Number.isFinite(item.lon)).map(item=>[item.lat,item.lon]);if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[24,24],maxZoom:10,animate:false});};
  const view=createBiometryMap({map,layer,data,selectedZones:()=>data.zones,method:()=>Number(method.value),choose,json});
  method.addEventListener('change',()=>view.render());
  map.attributionControl.addAttribution('Dados de habilitação: logs eleitorais · Resultados eleitorais: TSE');
  new ResizeObserver(()=>map.invalidateSize({pan:false})).observe(map.getContainer());view.render();
 }catch(error){status.textContent='Não foi possível carregar as zonas biométricas.';console.error(error);}
}

try{
 const [reportResponse,contextResponse,researchResponse]=await Promise.all([fetch('dados/resumo-dados.json',{cache:'force-cache'}),fetch('dados/unanimidades-contexto.json',{cache:'force-cache'}),fetch('dados/unanimidades-pesquisa.json?v=2')]);
 if(!reportResponse.ok||!contextResponse.ok||!researchResponse.ok)throw new Error(`Dados: ${reportResponse.status}/${contextResponse.status}`);
 const [report,context,research]=await Promise.all([reportResponse.json(),contextResponse.json(),researchResponse.json()]);
 researchBySection=research;
 contextBySection=new Map(context.secoes_rotuladas.map(row=>[row.key,row.labels]));
 initializeUnanimityMap(report.unanimidades);
}catch(error){$('unanimity-count').textContent='Não foi possível carregar os dados do mapa de unanimidades.';console.error(error);}
initializeBiometryMap();