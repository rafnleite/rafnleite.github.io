import {addStateBoundaries} from './map-boundaries.mjs';
import {delayReport,closingLabel} from './atraso-model.mjs';
import {createGeographyTree} from './geography-tree.mjs?v=exterior-shortcut-1';
import {electionSummary,ELECTION_SCALE,ELECTION_COLORS} from './election-results.mjs';
import {chartTooltipOptions,installChartDismissal,createMapTooltip} from './ui-overlays.mjs?v=hover-tooltips-1';
import {mapLevelForBounds} from './map-scale.mjs';
const $=id=>document.getElementById(id),fmt=new Intl.NumberFormat('pt-BR'),pct=new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data,tree,result,map,layer,chart,timer,tooltip,popup,level='zones';
installChartDismissal(()=>chart?[chart]:[]);
function render(){
 const geo=tree.getSelection(),minute=Number($('threshold').value);
 $('thresholdLabel').textContent=closingLabel(minute*60);$('thresholdTime').value=closingLabel(minute*60).slice(0,5);
 result=delayReport(data,{minute,ufs:new Set(geo.ufs),paths:geo.paths});
 const [urns,electors,total,lula,flavio]=result.totals,valid=lula+flavio;
 for(const [id,value] of Object.entries({urns,electors,lula,flavio,difference:lula-flavio}))$(id).textContent=fmt.format(value);
 $('urnShare').textContent=`${pct.format(urns/data.totals[0])} das urnas com horário na base`;
 $('lulaShare').textContent=valid?pct.format(lula/valid)+' dos votos válidos':'Sem votos válidos';
 $('flavioShare').textContent=valid?pct.format(flavio/valid)+' dos votos válidos':'Sem votos válidos';
 $('leader').textContent=lula===flavio?'Empate':`Vantagem de ${lula>flavio?'Lula':'Flávio'}`;
 $('coverage').textContent=`${fmt.format(urns)} urnas · ${fmt.format(total)} votos no recorte. Base: ${fmt.format(data.totals[0])} urnas com horário; ${fmt.format(data.missingTime)} BUs sem encerramento utilizável.`;
 $('toggleExterior').textContent=tree.isStateSelected('ZZ')?'Excluir urnas do exterior':'Considerar urnas do exterior';
 $('ufRows').innerHTML=result.byUF.map(([uf,v])=>`<tr><td>${uf}</td>${[...v.slice(0,5),v[3]-v[4],...v.slice(5)].map(n=>`<td>${fmt.format(n)}</td>`).join('')}</tr>`).join('');
 $('empty').hidden=urns>0;
 chart.setOption({animation:false,grid:{left:48,right:22,top:20,bottom:35},tooltip:chartTooltipOptions({trigger:'axis',axisPointer:{type:'shadow'},formatter:items=>`${items[0].name}: <strong>${fmt.format(items[0].value)}</strong> urnas`}),xAxis:{type:'value',min:0,minInterval:1,axisLabel:{fontSize:10}},yAxis:{type:'category',inverse:true,data:result.byUF.map(([uf])=>uf),axisLabel:{fontSize:10}},series:[{type:'bar',data:result.byUF.map(([,v])=>v[0]),itemStyle:{color:'#668c60'},barCategoryGap:'15%'}]},true);
 renderMap();
}
function color(values){const r=electionSummary({lula:values[3],flavio:values[4],bus:values[0],sections:values[0]});return r.colorPosition===null?ELECTION_COLORS.missing:echarts.color.lerp(r.colorPosition,ELECTION_SCALE);}
function hideMapOverlays(){tooltip?.remove();popup?.remove();}
function placeReference(marker){return {contextElement:$('delayMap'),getBoundingClientRect(){const rect=$('delayMap').getBoundingClientRect(),point=map.latLngToContainerPoint(marker.getLatLng());return new DOMRect(rect.left+point.x,rect.top+point.y,1,1);}};}
function placeDetail(g){
 const r=electionSummary({lula:g.values[3],flavio:g.values[4],bus:g.values[0],sections:g.values[0]}),share=value=>pct.format(value/100);
 return `<strong>${esc(g.name)}</strong><br>${fmt.format(g.values[0])} urnas · ${fmt.format(g.values[1])} aptos<br><small>${esc([...g.cities].join(', '))} / ${esc(g.uf)} · Zona ${esc(g.zone)}<br>Último encerramento: ${closingLabel(g.latest)} · Brasília${g.isZone?'<br>Clique na zona para aproximar os locais de votação.':''}</small><div class="place-election"><small>RESULTADO ${g.isZone?'DA ZONA':'DO LOCAL'} NO RECORTE · 2º TURNO<br>Encerramento a partir de ${closingLabel(Number($('threshold').value)*60)} · Brasília</small><div class="election-candidates"><span class="lula"><b>Lula</b><br>${fmt.format(r.lula)} · ${share(r.lulaPercent)}</span><span class="flavio"><b>Flávio</b><br>${fmt.format(r.flavio)} · ${share(r.flavioPercent)}</span></div>${r.valid?`<div class="election-bar" role="img" aria-label="Lula ${share(r.lulaPercent)}, Flávio ${share(r.flavioPercent)}"><span class="lula" style="width:${r.lulaPercent}%"></span><span class="flavio" style="width:${r.flavioPercent}%"></span></div>`:'<small>Sem votos válidos entre os dois candidatos.</small>'}<small>Percentuais sobre votos válidos.<br>Brancos: ${fmt.format(g.values[6])} · Nulos: ${fmt.format(g.values[5])}<br>Total: ${fmt.format(g.values[2])} votos no recorte.</small></div>`;
}
function renderMap(){
 if(!result)return;hideMapOverlays();layer.clearLayers();const view=map.getBounds();level=mapLevelForBounds({north:view.getNorth(),south:view.getSouth(),east:view.getEast(),west:view.getWest()},level);
 const mapped=result.places.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&!(p.lat===0&&p.lng===0)&&!(p.lat===-1&&p.lng===-1));
 $('unmapped').textContent=`${fmt.format(result.totals[0]-mapped.reduce((s,p)=>s+p.values[0],0))} urnas sem coordenadas permanecem nos totais.`;
 const groups=new Map();
 for(const p of mapped){const key=level==='zones'&&p.uf!=='ZZ'?`${p.uf}/${p.zone}`:p.id;
  if(!groups.has(key))groups.set(key,{key,uf:p.uf,cities:new Set(),zone:p.zone,isZone:level==='zones'&&p.uf!=='ZZ',name:level==='zones'&&p.uf!=='ZZ'?`Zona ${p.zone} / ${p.uf}`:p.name,lat:0,lng:0,weight:0,values:Array(7).fill(0),latest:0});
  const g=groups.get(key),weight=p.values[0];g.cities.add(p.city);g.lat+=p.lat*weight;g.lng+=p.lng*weight;g.weight+=weight;g.latest=Math.max(g.latest,p.latest);for(let i=0;i<7;i++)g.values[i]+=p.values[i];
 }
 const bounds=map.getBounds().pad(.15),reference=[...groups.values()].reduce((max,g)=>Math.max(max,g.values[0]),1);
 const legend=$('delayBubbleLegend');legend.replaceChildren();
 for(const value of [...new Set([Math.max(1,Math.round(reference/16)),Math.max(1,Math.round(reference/4)),reference])]){
  const item=document.createElement('span');item.className='legend-bubble';const circle=document.createElement('i');
  circle.style.width=circle.style.height=Math.max(5,Math.sqrt(value/reference)*24)*2+'px';
  const label=document.createElement('span');label.textContent=fmt.format(value);item.append(circle,label);legend.append(item);
 }
 $('delayMapScope').textContent=level==='zones'?'urnas das zonas no recorte':'urnas dos locais no recorte';
 for(const g of groups.values()){const pos=[g.lat/g.weight,g.lng/g.weight];if(!bounds.contains(pos))continue;
  const marker=L.circleMarker(pos,{radius:Math.max(5,Math.sqrt(g.values[0]/reference)*24),color:color(g.values),fillColor:color(g.values),fillOpacity:.88,weight:1}).addTo(layer);
  marker.on('mouseover',event=>{if(event.originalEvent?.pointerType!=='touch'&&!popup.isOpen())tooltip.show(placeReference(marker),placeDetail(g));});
  marker.on('mouseout',()=>tooltip.remove());
  marker.on('click',()=>{
   hideMapOverlays();
   if(g.isZone){const points=mapped.filter(p=>p.uf===g.uf&&Number(p.zone)===Number(g.zone)).map(p=>[p.lat,p.lng]);map.fitBounds(L.latLngBounds(points),{padding:[45,45],maxZoom:points.length===1?15:13,animate:false});}
   else popup.show(placeReference(marker),placeDetail(g));
  });
 }
}
function fit(){if(!result)return;const points=result.places.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&!(p.lat===0&&p.lng===0)&&!(p.lat===-1&&p.lng===-1)).map(p=>[p.lat,p.lng]);if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[25,25],maxZoom:11});}
async function load(){try{
 const response=await fetch('./atraso-data.json.gz',{cache:'no-cache'});if(!response.ok)throw Error(`HTTP ${response.status}`);data=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();if(data.schemaVersion!==1||data.turn!==2)throw Error('Base incompatível');
 const catalog=new Map();for(const p of data.places){if(!catalog.has(p.uf))catalog.set(p.uf,new Map());const cities=catalog.get(p.uf);if(!cities.has(p.municipality))cities.set(p.municipality,{code:p.municipality,name:p.city,zones:new Set()});cities.get(p.municipality).zones.add(p.zone);}
 tree=createGeographyTree($('geographyTree'),{states:[...catalog].map(([uf,cities])=>({uf,label:uf==='ZZ'?'Exterior':uf,municipalities:[...cities.values()].map(c=>({...c,zones:[...c.zones]}))})),onChange:()=>{clearTimeout(timer);timer=setTimeout(render,80);}});
 $('loadingPanel').hidden=true;$('content').hidden=false;
 const max=data.rows.reduce((max,r)=>Math.max(max,r[1]/60),1439); // computed below without a large function argument list
 $('threshold').max=String(Math.floor(max));$('rangeEnd').textContent=closingLabel(Math.floor(max)*60);
 map=L.map('delayMap',{preferCanvas:true,scrollWheelZoom:true}).setView([-14.5,-52.5],4);
 tooltip=createMapTooltip();popup=createMapTooltip({interactive:true});map.on('movestart zoomstart',hideMapOverlays);
 layer=L.layerGroup().addTo(map);
 addStateBoundaries(map);
 chart=echarts.init($('ufChart'));map.on('moveend zoomend',renderMap);window.addEventListener('resize',()=>{chart.resize();map.invalidateSize({pan:false});});
 $('snapshot').textContent='Base gerada em '+new Date(data.generatedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' · Brasília';render();
 }catch(e){$('content').hidden=true;$('loadingPanel').hidden=false;$('loadingPanel').textContent='Não foi possível carregar o relatório: '+e.message;}}
$('threshold').addEventListener('input',()=>{clearTimeout(timer);$('thresholdLabel').textContent=closingLabel(Number($('threshold').value)*60);timer=setTimeout(render,120);});
$('thresholdTime').addEventListener('change',()=>{const [h,m]=$('thresholdTime').value.split(':').map(Number);if(!Number.isFinite(h+m))return;$('threshold').value=String(Math.max(1020,h*60+m));render();});
document.querySelectorAll('[data-minute]').forEach(b=>b.onclick=()=>{$('threshold').value=b.dataset.minute;render();});
$('toggleExterior').onclick=()=>tree?.setStateSelected('ZZ',!tree.isStateSelected('ZZ'));$('resetGeography').onclick=()=>tree?.selectAll();$('fitMap').onclick=fit;
document.addEventListener('site:filterschange',()=>{hideMapOverlays();chart?.dispatchAction({type:'hideTip'});});
$('exportDelay').onclick=()=>{if(!result)return;const lines=[['uf','urnas','eleitores_aptos','votos_totais','lula','flavio','diferenca_lula_flavio','nulos','brancos','encerramento_a_partir_brasilia'],...result.byUF.map(([uf,v])=>[uf,...v.slice(0,5),v[3]-v[4],...v.slice(5),closingLabel(Number($('threshold').value)*60)])];const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.map(r=>r.join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='urnas-apos-17h-2026.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
load();
