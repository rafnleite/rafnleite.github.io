import {addStateBoundaries} from './map-boundaries.mjs';
import {aggregate,timeLabel,radiusForVotes,coveragePercent,loadStateEntry,loadVotingDocument,HISTOGRAM_METHODS,histogramTimePosition} from './votacao-model.mjs?v=geography-tree-1';
import {electionSummary,ELECTION_COLORS,ELECTION_SCALE} from './election-results.mjs';
import {chartTooltipOptions,installChartDismissal,createMapTooltip} from './ui-overlays.mjs?v=hover-tooltips-1';
import {zoneElectionResults} from './map-zones.mjs?v=geography-tree-1';
import {createGeographyTree} from './geography-tree.mjs?v=exterior-shortcut-1';
import {mapLevelForBounds} from './map-scale.mjs';
import {binsForVotingChart,visibleVotingMaximum} from './voting-chart-domain.mjs';
import {prepareMapGroups,hasMapPosition} from './map-groups.mjs';
import {ViewportMarkers} from './map-markers.mjs?v=20261027-completo';

const $=id=>document.getElementById(id),number=new Intl.NumberFormat('pt-BR'),percent=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2,minimumFractionDigits:0});
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const controls={method:$('method'),bin:$('bin')};
const state={bin:1,manifest:null,loaded:new Map(),pending:new Map(),start:480,end:1440,domain:[480,1440],chart:null,map:null,layer:null,tooltip:null,popup:null,result:null,ticket:0,renderTimer:null,fitOnRender:true,geographyTree:null,geographyLimited:false,loading:true,mapLevel:'zones',mapFrame:null,mapViewKey:null,mapRenderResult:null,zoneResults:new Map(),zoneResultKey:null,zoneResultInputs:[],markers:null,mapPreparedResult:null,mapPrepared:new Map(),mapQuery:null,mapNeedsReconcile:false,mapLegendPrepared:null,mapColorCache:new WeakMap(),tooltipMarker:null,popupMarker:null};
const placeMarkerEvents={mouseover:showPlaceTooltip,mouseout:hidePlaceTooltip,click:showPlacePopup};
installChartDismissal(()=>[state.chart]);
function selectedGeography(){return state.geographyTree?.getSelection()||{ufs:state.manifest?.states.map(entry=>entry.uf)||[],paths:null,limited:false};}
function selectedUFs(){return selectedGeography().ufs;}
function updateExteriorShortcut(){
  const checkbox=$('toggleExteriorChart');
  checkbox.disabled=state.loading||!state.geographyTree;
  checkbox.checked=state.geographyTree?.isStateSelected('ZZ')||false;
}
function initializeGeographyTree(){
  state.geographyTree?.destroy();
  $('geographyTree').replaceChildren();
  const catalog=state.manifest.states.map(entry=>{
    const data=state.loaded.get(entry.uf),municipalities=new Map((data.municipalities||[]).map(city=>[Number(city.code),{code:Number(city.code),name:city.name,zones:new Set()}]));
    const add=(municipality,zone)=>{const code=Number(municipality),number=Number(zone);if(!Number.isInteger(code)||!Number.isInteger(number))return;let city=municipalities.get(code);if(!city){city={code,name:`Município ${code}`,zones:new Set()};municipalities.set(code,city);}city.zones.add(number);};
    for(const place of data.locations||data.zones||[])add(place.municipality,place.zone);
    // BU-only places are still geographic leaves, even without a usable log.
    for(const key of Object.keys(data.results||{})){const [,municipality,zone]=key.split('/');add(municipality,zone);}
    return {uf:entry.uf,label:entry.label||entry.uf,municipalities:[...municipalities.values()].map(city=>({...city,zones:[...city.zones].sort((a,b)=>a-b)}))};
  });
  state.geographyTree=createGeographyTree($('geographyTree'),{states:catalog,onChange:()=>{updateExteriorShortcut();state.fitOnRender=true;scheduleRender();showCoverageMessage();}});
  state.geographyTree.setStateSelected('ZZ',false);
  updateExteriorShortcut();
}
function selectedMethods(){return [...controls.method.querySelectorAll('input:checked')].map(input=>input.value);}
function updateMethodSummary(){const count=selectedMethods().length;$('methodSummary').textContent=count?`${count} ${count===1?'forma selecionada':'formas selecionadas'}`:'Selecione ao menos uma forma para exibir os votos.';}

function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);$('message').hidden=!text;if(state.loading)$('loadingProgress').textContent=text;}
function setLoading(active,error=false){state.loading=active;updateExteriorShortcut();if(active)cancelMapWork();$('loadedContent').hidden=active;$('loadingPanel').hidden=!active;$('loadingSpinner').hidden=error;$('retryLoad').hidden=!error;$('loadingTitle').textContent=error?'Não foi possível carregar os dados':'Carregando os dados';$('loadingPanel').classList.toggle('error',error);}
function dateLabel(value){const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'})+' · Brasília':'Data não informada';}
function selectedStates(){const selected=new Set(selectedUFs());return [...state.loaded.values()].filter(s=>selected.has(s.uf));}
async function getState(entry){
  return loadStateEntry(state,entry,async()=>{
    const base=new URL(entry.url,document.baseURI);
    const readJson=async url=>{const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw new Error(`Não foi possível carregar ${entry.uf} (HTTP ${response.status}).`);return response.json();};
    const resultEntry=state.resultsManifest.states.find(item=>item.uf===entry.uf);
    if(!resultEntry)throw new Error(`Resultado eleitoral de ${entry.uf} não disponível.`);
    const [data,result]=await Promise.all([readJson(base),readJson(new URL(resultEntry.url,document.baseURI))]);
    if(result.turn!==2||result.uf!==entry.uf||!result.places)throw new Error('Resultado eleitoral incompatível.');
    const loaded=await loadVotingDocument(entry.uf,data,path=>readJson(new URL(path,base)));
    return {...loaded,results:result.places};
  });
}
async function loadSelection(){
  setLoading(true);
  const ticket=++state.ticket,entries=state.manifest.states,queue=entries.filter(e=>!state.loaded.has(e.uf));
  let received=entries.length-queue.length,position=0;
  if(queue.length)message(`Carregando ${received} de ${entries.length} estados… Os dados são agregados, sem votos individuais.`);
  try{
    await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{while(ticket===state.ticket&&position<queue.length){const entry=queue[position++];await getState(entry);received++;if(ticket===state.ticket)message(`Carregando ${received} de ${entries.length} estados…`);}}));
    if(ticket!==state.ticket)return;
    initializeGeographyTree();setLoading(false);state.fitOnRender=true;state.chart.resize();state.map.invalidateSize({pan:false});render();showCoverageMessage();
  }catch(error){if(ticket===state.ticket){setLoading(true,true);message(error.message+' Tente novamente.',true);}}
}
function showCoverageMessage(){
  if(!selectedUFs().length){message('Nenhum estado selecionado. Selecione um ou mais estados ou use “Marcar todos”.');return;}
  const coverage=state.manifest.coverage||{},expected=coverage.expectedSections||499248,sections=coverage.sections??state.manifest.states.reduce((sum,s)=>sum+(s.sections||0),0);
  const detail=`${number.format(sections)} de ${number.format(expected)} seções na fotografia publicada (${percent.format(coveragePercent(sections,expected))}%).`;
  message((sections<expected?'Base parcial. ':'Fotografia da base. ')+detail+' Ausência de logs não significa ausência de votação.');
}
function rangeLabels(){
  $('rangeLabel').textContent=`${timeLabel(state.start)} → ${timeLabel(state.end)}`;
  $('startTime').value=plainTime(state.start);$('endTime').value=plainTime(state.end);
}
function plainTime(minute){const m=((minute%1440)+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
function setRange(start,end){start=Math.max(state.domain[0],start);end=Math.min(state.domain[1],end);if(end<=start){message('O horário final precisa ser posterior ao inicial.',true);return;}$('timeSlider').noUiSlider.set([start,end]);}
function scheduleRender(){clearTimeout(state.renderTimer);state.renderTimer=setTimeout(render,90);}
function initializeSlider(){
  const [minimum,maximum]=state.manifest.minuteRange||[480,1440];
  state.domain=[Math.min(480,Math.floor(minimum)),Math.max(1440,Math.ceil(maximum))];state.start=state.domain[0];state.end=state.domain[1];
  if($('timeSlider').noUiSlider)$('timeSlider').noUiSlider.destroy();
  noUiSlider.create($('timeSlider'),{start:[state.start,state.end],connect:true,step:1,margin:1,range:{min:state.domain[0],max:state.domain[1]},behaviour:'tap-drag',handleAttributes:[{'aria-label':'Horário inicial'},{'aria-label':'Horário final'}],format:{to:value=>String(Math.round(value)),from:value=>Number(value)}});
  $('timeSlider').noUiSlider.on('update',values=>{[state.start,state.end]=values.map(Number);rangeLabels();scheduleRender();});
  $('domainStart').textContent=timeLabel(state.domain[0]);$('domainEnd').textContent=timeLabel(state.domain[1]);
}
function initializeVisuals(){
  if(!globalThis.echarts||!globalThis.L||!globalThis.noUiSlider)throw new Error('As bibliotecas de visualização não foram carregadas. Atualize a página.');
  state.chart=echarts.init($('histogram'),null,{renderer:'canvas'});
  state.chartZoom={start:0,end:100};
  state.chart.on('datazoom',()=>{const zoom=state.chart.getOption().dataZoom?.[0];if(zoom)state.chartZoom={start:zoom.start,end:zoom.end};if(state.result)updateHistogramAxes();updateTimeGuides();updateHistogramZoomButton();});
  state.map=L.map('map',{preferCanvas:true,scrollWheelZoom:true,zoomSnap:.5,wheelPxPerZoomLevel:80}).setView([-14.5,-52.5],4);
  const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(state.map);
  tiles.on('tileerror',()=>{$('unmapped').textContent='O mapa-base pode estar indisponível; os pontos de votação continuam visíveis.';});
  addStateBoundaries(state.map);
  state.layer=L.layerGroup().addTo(state.map);
  state.tooltip=createMapTooltip();state.popup=createMapTooltip({interactive:true});
  state.markers=new ViewportMarkers({
    create:record=>{
      ensureMarkerStyle(record);
      const marker=L.circleMarker([record.lat,record.lng],{radius:record.radius,color:record.color,weight:1,fillColor:record.color,fillOpacity:.9});
      marker.votingPlace=record.place;marker.votingLevel=record.level;marker.on(placeMarkerEvents);return marker;
    },
    add:marker=>state.layer.addLayer(marker),
    remove:marker=>{
      if(state.tooltipMarker===marker){state.tooltip.remove();state.tooltipMarker=null;}
      if(state.popupMarker===marker){state.popup.remove();state.popupMarker=null;}
      state.layer.removeLayer(marker);marker.off(placeMarkerEvents);
    },
    update:(marker,record,previous)=>{
      if(record.place.election===previous.place.election)record.color=previous.color;
      if(record.place.count===previous.place.count&&record.reference===previous.reference)record.radius=previous.radius;
      ensureMarkerStyle(record);
      marker.votingPlace=record.place;marker.votingLevel=record.level;
      if(record.lat!==previous.lat||record.lng!==previous.lng)marker.setLatLng([record.lat,record.lng]);
      if(record.radius!==previous.radius)marker.setRadius(record.radius);
      if(record.color!==previous.color)marker.setStyle({color:record.color,fillColor:record.color});
    },immediate:true,
  });
  state.map.on('movestart zoomstart',cancelMapWork);
  state.map.on('moveend zoomend resize',scheduleMapRender);
  const chartObserver=new ResizeObserver(()=>{state.tooltip.remove();state.chart.resize();if(state.result)renderChart(state.result);});
  const mapObserver=new ResizeObserver(()=>{cancelMapWork();state.map.invalidateSize({pan:false});scheduleMapRender();});
  chartObserver.observe($('histogram'));mapObserver.observe($('map'));
}
function histogramGrid(){
  return {left:58,right:23,top:20,bottom:39};
}
function updateHistogramZoomButton(){if($('resetHistogramZoom'))$('resetHistogramZoom').disabled=state.chartZoom.start<=0&&state.chartZoom.end>=100;}
function histogramLabelInterval(){const visible=Math.max(1,Math.ceil((state.chartBins?.length||0)*(state.chartZoom.end-state.chartZoom.start)/100)),labels=window.innerWidth<600?6:12;return Math.max(0,Math.ceil(visible/labels)-1);}
function histogramMaximum(){
  const maximum=visibleVotingMaximum(state.chartBins||[],state.chartZoom);
  const step=10**Math.floor(Math.log10(maximum/5));
  return Math.ceil(maximum/step)*step;
}
function updateHistogramAxes(){state.chart.setOption({xAxis:{axisLabel:{interval:histogramLabelInterval()}},yAxis:{min:0,max:histogramMaximum()}},{silent:true});}
function updateTimeGuides(result=state.result){
  if(!state.chart||!result)return;
  const bins=state.chartBins||[],grid=histogramGrid(),plotWidth=state.chart.getWidth()-grid.left-grid.right;
  const bottom=state.chart.getHeight()-grid.bottom,children=[];
  if(bins.length&&plotWidth>0&&bottom>grid.top){
    for(const guide of [{minute:1020,label:'17:00',dashed:false},{minute:1140,label:'19:00',dashed:true}]){
      // The shared helper interpolates within categorical bins, including a
      // partial final bin, and rejects references outside the visible range.
      const position=histogramTimePosition(bins,guide.minute);
      if(position===null)continue;
      const ordinal=position*bins.length,index=Math.min(bins.length-1,Math.floor(ordinal));
      const center=state.chart.convertToPixel({xAxisIndex:0},timeLabel(bins[index].start));
      const neighbor=bins.length>1?(index+1<bins.length?index+1:index-1):null;
      const step=neighbor===null?plotWidth:Math.abs(state.chart.convertToPixel({xAxisIndex:0},timeLabel(bins[neighbor].start))-center);
      const x=center+(ordinal-index-.5)*step;
      if(!Number.isFinite(x)||x<grid.left-.1||x>state.chart.getWidth()-grid.right+.1)continue;
      let align=guide.dashed?'left':'right';
      if(align==='right'&&x-grid.left<38)align='left';
      else if(align==='left'&&state.chart.getWidth()-grid.right-x<38)align='right';
      children.push({type:'line',silent:true,z:100,shape:{x1:x,y1:grid.top,x2:x,y2:bottom},style:{stroke:'#c34e49',lineWidth:1.2,...(guide.dashed?{lineDash:[5,4]}:{})}},
        {type:'text',silent:true,z:101,style:{text:guide.label,x:x+(align==='left'?5:-5),y:grid.top+3,align,verticalAlign:'top',font:'600 10px sans-serif',fill:'#b74340',backgroundColor:'rgba(255,254,249,.92)',padding:[2,3]}});
    }
  }
  state.chart.setOption({graphic:[{id:'vote-time-guides',$action:'replace',type:'group',silent:true,z:100,children}]},{silent:true});
}
function renderChart(result){
  const bins=binsForVotingChart(result.bins,{preserveRange:state.start!==state.domain[0]||state.end!==state.domain[1]});
  state.chartBins=bins;
  const separated=$('histogramMode').value==='methods';
  const selected=selectedMethods();
  const methods=HISTOGRAM_METHODS.filter(m=>selected.includes(m.key));
  const series=(separated?methods:[{key:'total',label:'Votos confirmados',color:'#7b9e70'}]).map(method=>({
    name:method.label,type:'bar',stack:separated?'votes':undefined,
    data:bins.map(bin=>separated?bin.methods[method.key]:bin.count),
    barCategoryGap:'0%',barGap:'0%',itemStyle:{color:method.color,borderWidth:0},
    emphasis:{focus:'series'},
  }));
  state.chart.setOption({animation:false,aria:{enabled:true},
    legend:{show:false},
    grid:histogramGrid(),
    tooltip:chartTooltipOptions({trigger:'axis',axisPointer:{type:'shadow'},formatter:items=>{
        if(!items.length)return '';
        const bin=bins[items[0].dataIndex];
        const detail=separated?items.map(item=>`${item.marker} ${escape(item.seriesName)}: <strong>${number.format(item.value)}</strong>`).join('<br>')+'<br>':'';
        return `<strong>${escape(timeLabel(bin.start))} – ${escape(timeLabel(bin.end))}</strong><br>${detail}Total: <strong>${number.format(bin.count)}</strong> votos presidenciais`;
      }}),
    dataZoom:[{id:'vote-inside-zoom',type:'inside',xAxisIndex:0,filterMode:'none',zoomOnMouseWheel:true,moveOnMouseMove:true,moveOnMouseWheel:false,...state.chartZoom}],
    xAxis:{type:'category',data:bins.map(b=>timeLabel(b.start)),axisLine:{lineStyle:{color:'#d4dec9'}},axisTick:{show:false},axisLabel:{color:'#91a080',fontSize:9,interval:histogramLabelInterval()}},
    yAxis:{type:'value',min:0,max:histogramMaximum(),minInterval:1,axisLabel:{color:'#95a489',fontSize:9,formatter:value=>value>=1e6?`${percent.format(value/1e6)} mi`:value>=1000?`${percent.format(value/1000)} mil`:number.format(value)},splitLine:{lineStyle:{color:'#eaf0e1',type:'dashed'}}},series},true);
  updateTimeGuides(result);
  updateHistogramZoomButton();
  $('histEmpty').hidden=result.selected>0;
  $('histScope').textContent=bins.length?`${timeLabel(bins[0].start)} – ${timeLabel(bins.at(-1).end)} · Brasília · 2º turno`:'Sem votos no recorte · Brasília · 2º turno';
}
function updateZoneElectionCache(states,geography){
  const key=JSON.stringify([geography.uf.slice().sort(),geography.geographyPaths?[...geography.geographyPaths].sort():null]);
  if(key!==state.zoneResultKey||states.length!==state.zoneResultInputs.length||states.some((data,index)=>data!==state.zoneResultInputs[index])){
    state.zoneResults=zoneElectionResults(states,geography);state.zoneResultKey=key;state.zoneResultInputs=states.slice();
  }
}
function scheduleMapRender(){
  if(state.loading||!state.result||state.mapFrame!==null)return;
  state.mapFrame=requestAnimationFrame(()=>{state.mapFrame=null;if(!state.loading&&state.result)renderMap(state.result);});
}
function hideMapOverlays(){state.tooltip?.remove();state.popup?.remove();state.tooltipMarker=null;state.popupMarker=null;}
function cancelMapWork(){
  if(state.mapFrame!==null){cancelAnimationFrame(state.mapFrame);state.mapFrame=null;}
  if(state.markers){state.mapNeedsReconcile=state.mapNeedsReconcile||state.markers.pendingCount>0;state.markers.cancel();}
  state.mapViewKey=null;hideMapOverlays();
}
const hasPosition=hasMapPosition;
function ensureMarkerStyle(record){
  if(record.color===undefined)record.color=mapElectionColor(record.place.election);
  if(record.radius===undefined)record.radius=radiusForVotes(record.place.count,record.reference);
  return record;
}
function mapElectionColor(election){
  if(!election||typeof election!=='object')return ELECTION_COLORS.missing;
  if(state.mapColorCache.has(election))return state.mapColorCache.get(election);
  const summary=electionSummary(election),color=summary.colorPosition===null?ELECTION_COLORS.missing:echarts.color.lerp(summary.colorPosition,ELECTION_SCALE);
  state.mapColorCache.set(election,color);return color;
}
function prepareMap(result,level){
  if(state.mapPreparedResult!==result){state.mapPreparedResult=result;state.mapPrepared=new Map();}
  if(state.mapPrepared.has(level))return state.mapPrepared.get(level);
  const prepared=prepareMapGroups(result,level,state.zoneResults);
  state.mapPrepared.set(level,prepared);return prepared;
}
function updateMapLegend(prepared,level){
  if(state.mapLegendPrepared===prepared)return;
  state.mapLegendPrepared=prepared;
  const legend=$('bubbleLegend');legend.replaceChildren();
  if(prepared.records.length)for(const value of [Math.max(1,Math.round(prepared.reference/4)),prepared.reference]){
    const item=document.createElement('span');item.className='legend-bubble';const circle=document.createElement('i'),diameter=radiusForVotes(value,prepared.reference)*2;
    circle.style.width=circle.style.height=diameter+'px';const label=document.createElement('span');label.textContent=number.format(value);item.append(circle,label);legend.append(item);
  }else legend.textContent=level==='zones'?'Sem zonas no recorte':'Sem locais no recorte';
}
function renderMap(result){
  if(state.mapFrame!==null){cancelAnimationFrame(state.mapFrame);state.mapFrame=null;}
  const bounds=state.map.getBounds(),box={north:bounds.getNorth(),south:bounds.getSouth(),east:bounds.getEast(),west:bounds.getWest()},size=state.map.getSize(),zoom=state.map.getZoom();
  const level=mapLevelForBounds(box,state.mapLevel),sizeKey=`${size.x}/${size.y}`,viewKey=JSON.stringify([level,box,sizeKey,zoom]);
  if(state.mapRenderResult===result&&state.mapViewKey===viewKey&&!state.mapNeedsReconcile)return;
  state.tooltip.remove();
  if(state.mapRenderResult!==result||state.mapLevel!==level)hideMapOverlays();
  state.mapLevel=level;state.mapViewKey=viewKey;state.mapRenderResult=result;
  const prepared=prepareMap(result,level),buffered=bounds.pad(.18),records=[];
  for(const record of prepared.records)if(buffered.contains([record.lat,record.lng]))records.push(record);
  // Finish the visible set before reporting its count. Retained markers and
  // cached styles still avoid recreating every point during a pan.
  state.mapNeedsReconcile=true;
  state.markers.reconcile(records.reverse());
  state.mapNeedsReconcile=false;
  state.mapQuery={prepared,level,zoom,sizeKey,bounds:buffered,records};
  let inView=0;
  for(const record of state.mapQuery.records)if(bounds.contains([record.lat,record.lng]))inView++;
  updateMapLegend(prepared,level);
  $('locationCountLabel').textContent=level==='zones'?(prepared.hasForeign?'Zonas e locais':'Zonas com votos'):'Locais com votos';
  $('locationCount').textContent=number.format(prepared.groupsCount);
  $('mapCount').textContent=`${number.format(inView)} ${level==='zones'&&!prepared.hasForeign?'zonas':'pontos'} com coordenadas nesta vista`;
  $('mapLevelNotice').textContent=level==='zones'?'Brasil por zona · aproxime para ver os locais. Exterior por local.':'Locais de votação · afaste para agrupar por zona no Brasil.';
  $('mapResultScope').textContent=level==='zones'?(state.geographyLimited?'Resultado da zona no recorte geográfico · todos os horários':prepared.hasForeign?'Resultado completo de cada zona / local do exterior':'Resultado completo da zona'):'Resultado completo do local';
  $('map').setAttribute('aria-label',level==='zones'?'Mapa por zona no Brasil e por local de votação no exterior':'Mapa de votos por local de votação');
  $('unmapped').textContent=prepared.unmappedVotes?`${number.format(prepared.unmappedVotes)} votos sem ponto com coordenadas permanecem no histograma.`:'';
}
function placeDetail(place,level='locations'){
  const r=electionSummary(place.election),fmt=value=>percent.format(value)+'%';
  const zone=level==='zones';
  const otherVotes=[['brancos','Brancos'],['nulos','Nulos']].filter(([key])=>Number.isSafeInteger(place.election?.[key])).map(([key,label])=>`${label}: ${number.format(place.election[key])}`).join(' · ');
  const result=r.available?`<div class="place-election"><small>RESULTADO ${zone&&state.geographyLimited?'DA ZONA NO RECORTE':`COMPLETO ${zone?'DA ZONA':'DO LOCAL'}`} · 2º TURNO · TODOS OS HORÁRIOS</small><div class="election-candidates"><span class="lula"><b>Lula</b><br>${number.format(r.lula)} · ${fmt(r.lulaPercent)}</span><span class="flavio"><b>Flávio</b><br>${number.format(r.flavio)} · ${fmt(r.flavioPercent)}</span></div>${r.valid?`<div class="election-bar" role="img" aria-label="Lula ${fmt(r.lulaPercent)}, Flávio ${fmt(r.flavioPercent)}"><span class="lula" style="width:${r.lulaPercent}%"></span><span class="flavio" style="width:${r.flavioPercent}%"></span></div>`:'<small>Sem votos válidos entre os dois candidatos.</small>'}<small>Percentuais sobre votos válidos.${r.partial?` BUs parciais: ${r.bus}/${r.sections} seções.`:''}${otherVotes?`<br>${otherVotes}`:''}${zone&&state.geographyLimited?'<br>Resultado limitado ao recorte geográfico selecionado.':''}</small></div>`:`<p class="place-election">Resultado ${zone?'da zona':'do local'} ainda sem BU disponível.</p>`;
  const title=zone?`Zona ${escape(place.zone)} / ${escape(place.uf)}`:escape(place.name);
  const geography=zone?escape(place.cities.join(', ')):`${escape(place.city)} / ${escape(place.uf)} · Zona ${escape(place.zone)}${place.number?` · Local ${escape(place.number)}`:''}${place.address?`<br>${escape(place.address)}`:''}`;
  const coordinateNote=!zone&&place.coordinatePrecision==='representative'?'<br>Ponto representativo em Sydney · 10 Spring Street':'';
  return `<strong>${title}</strong><br>${number.format(place.count)} ${place.count===1?'voto':'votos'} no intervalo<br><small>${geography}${coordinateNote}${zone?'<br>Clique na zona para aproximar os locais de votação.':''}</small>${result}`;
}
function placeReference(marker){return {contextElement:$('map'),getBoundingClientRect(){const rect=$('map').getBoundingClientRect(),point=state.map.latLngToContainerPoint(marker.getLatLng());return new DOMRect(rect.left+point.x,rect.top+point.y,1,1);}};}
function showPlaceTooltip(event){
  if(event.originalEvent?.pointerType==='touch'||state.popup.isOpen())return;
  const marker=event.target;state.tooltipMarker=marker;state.tooltip.show(placeReference(marker),placeDetail(marker.votingPlace,marker.votingLevel));
}
function hidePlaceTooltip(){state.tooltip.remove();state.tooltipMarker=null;}
function showPlacePopup(event){
  const marker=event.target;hidePlaceTooltip();
  if(marker.votingLevel==='zones'){
    state.popup.remove();state.popupMarker=null;
    const area=marker.votingPlace,positions=state.result.locations.filter(place=>place.uf===area.uf&&Number(place.zone)===Number(area.zone)&&hasPosition(place)).map(place=>[place.lat,place.lng]);
    if(positions.length)state.map.fitBounds(L.latLngBounds(positions),{padding:[45,45],maxZoom:positions.length===1?15:13,animate:false});
    else state.map.setView(marker.getLatLng(),Math.max(7,state.map.getZoom()+2),{animate:false});
    scheduleMapRender();return;
  }
  state.popupMarker=marker;state.popup.show(placeReference(marker),placeDetail(marker.votingPlace,marker.votingLevel));
}

function fitMap(result=state.result){const positions=result?.locations.filter(place=>place.lat!==null).map(place=>[place.lat,place.lng])||[];if(positions.length){state.map.fitBounds(L.latLngBounds(positions),{padding:[40,40],maxZoom:positions.length===1?15:12,animate:false});}else state.map.setView([-14.5,-52.5],4,{animate:false});}
function render(){
  if(state.loading)return;
  if(!state.manifest||!state.chart)return;
  const selection=selectedGeography(),states=selectedStates(),geography={uf:selection.ufs,geographyPaths:selection.paths};
  state.geographyLimited=selection.limited;
  updateZoneElectionCache(states,geography);
  const result=aggregate(states,{...geography,method:selectedMethods(),start:state.start,end:state.end,bin:state.bin});state.result=result;
  state.chartZoom={start:0,end:100};
  state.chart.dispatchAction({type:'hideTip'});
  $('selectedVotes').textContent=number.format(result.selected);$('selectedShare').textContent=`${result.total?percent.format(result.selected/result.total*100):'0'}% dos votos do recorte`;
  $('outsideVotes').textContent=number.format(result.outside);$('contextVotes').textContent=`De ${number.format(result.total)} votos no mesmo recorte`;
  $('sectionCount').textContent=number.format(result.sections);$('coverage').textContent='Seções disponíveis no recorte geográfico';
  $('sectionExteriorNotice').hidden=state.geographyTree?.isStateSelected('ZZ')||false;
  renderChart(result);
  if(state.fitOnRender){state.fitOnRender=false;fitMap(result);}
  renderMap(result);
  renderRanking();
}
function renderRanking(){
  if(!state.result)return;
  const places=state.result.locations,limit=$('rankingLimit').value;
  const visible=limit==='all'?places:places.slice(0,Number(limit));
  $('rankingBody').innerHTML=visible.length?visible.map(place=>`<tr><td>${escape(place.name)}${place.number?` <small>· Local ${escape(place.number)}</small>`:''}${place.address?`<span class="place-address">${escape(place.address)}</span>`:''}</td><td>${escape(place.city)} / ${escape(place.uf)}<br><small>Zona ${escape(place.zone)}</small></td><td>${number.format(place.count)}</td></tr>`).join(''):'<tr><td colspan="3">Nenhum local de votação disponível neste intervalo e recorte.</td></tr>';
  $('rankingNote').textContent=`${number.format(visible.length)} de ${number.format(places.length)} locais, em ordem de votos. O CSV inclui a seleção completa.`;
}
async function refresh(){
  setLoading(true);
  $('refresh').disabled=true;
  try{
    message('Consultando a fotografia da base…');
    const responses=await Promise.all([fetch('./voting/manifest.json',{cache:'no-store'}),fetch('./results/manifest.json',{cache:'no-store'})]);
    if(responses.some(response=>!response.ok))throw new Error('Não foi possível carregar as bases de horários e resultados.');
    const [manifest,results]=await Promise.all(responses.map(response=>response.json()));
    if(![1,2].includes(manifest.schemaVersion)||manifest.turn!==2||!Array.isArray(manifest.states)||results.turn!==2||!Array.isArray(results.states))throw new Error('Formato de dados incompatível.');
    state.resultsManifest=results;
    state.ticket++;state.manifest=manifest;state.loaded.clear();state.pending.clear();
    state.geographyTree?.destroy();state.geographyTree=null;$('geographyTree').textContent='Carregando estados, municípios e zonas…';
    $('snapshotDate').textContent='Base de '+dateLabel(manifest.generatedAt);
    $('dataNotes').textContent=(manifest.notes||[]).join(' ')||'A cobertura se refere aos logs já disponíveis. Ausência de dados não significa ausência de votação.';
    initializeSlider();await loadSelection();
  }catch(error){setLoading(true,true);message(error.message,true);}finally{$('refresh').disabled=false;}
}
function exportCsv(){if(!state.result)return;const quote=s=>'"'+String(s).replaceAll('"','""')+'"';const selected=selectedMethods(),methodLabel=HISTOGRAM_METHODS.filter(m=>selected.includes(m.key)).map(m=>m.label).join(' + ');const lines=[['uf','municipio','codigo_municipio_tse','zona','numero_local','id_local','local_votacao','endereco','latitude','longitude','votos','inicio_brasilia','fim_exclusivo_brasilia','forma_habilitacao'],...state.result.locations.map(place=>[place.uf,place.city,place.municipality,place.zone,place.number||'',place.key,place.name,place.address,place.lat??'',place.lng??'',place.count,timeLabel(state.start),timeLabel(state.end),methodLabel])];const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.map(row=>row.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='votos-presidenciais-por-local.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

controls.method.addEventListener('change',()=>{updateMethodSummary();scheduleRender();});controls.bin.addEventListener('input',()=>{
  const value=Number(controls.bin.value);
  controls.bin.setCustomValidity(controls.bin.value!==''&&!Number.isSafeInteger(value)?'Digite um número inteiro de minutos.':'');
  if(controls.bin.checkValidity()){state.bin=value;scheduleRender();}
});
controls.bin.addEventListener('change',()=>{if(!controls.bin.checkValidity())controls.bin.reportValidity();});
$('selectAllMethods').addEventListener('click',()=>{controls.method.querySelectorAll('input').forEach(input=>input.checked=true);updateMethodSummary();scheduleRender();});
$('histogramMode').addEventListener('change',()=>{if(state.result)renderChart(state.result);});
$('rankingLimit').addEventListener('change',renderRanking);
$('startTime').addEventListener('change',event=>{const [h,m]=event.target.value.split(':').map(Number);if(Number.isFinite(h)&&Number.isFinite(m))setRange(h*60+m,state.end);});
$('endTime').addEventListener('change',event=>{const [h,m]=event.target.value.split(':').map(Number);if(Number.isFinite(h)&&Number.isFinite(m)){let end=h*60+m;if(end<=state.start)end+=1440;setRange(state.start,end);}});
$('wholeDay').addEventListener('click',()=>setRange(...state.domain));$('after17').addEventListener('click',()=>setRange(1020,1140));
$('reset').addEventListener('click',()=>{controls.method.querySelectorAll('input').forEach(input=>input.checked=true);updateMethodSummary();state.fitOnRender=true;state.geographyTree?.selectAll();state.geographyTree?.setStateSelected('ZZ',false);setRange(...state.domain);scheduleRender();});
$('resetHistogramZoom').addEventListener('click',()=>{state.chartZoom={start:0,end:100};state.chart.dispatchAction({type:'dataZoom',dataZoomId:'vote-inside-zoom',start:0,end:100});updateTimeGuides();updateHistogramZoomButton();});
$('toggleExteriorChart').addEventListener('change',event=>{state.geographyTree?.setStateSelected('ZZ',event.target.checked);});
$('refresh').addEventListener('click',refresh);$('fitMap').addEventListener('click',()=>fitMap());$('export').addEventListener('click',exportCsv);
$('retryLoad').addEventListener('click',refresh);
document.addEventListener('site:filterschange',()=>{hideMapOverlays();state.chart?.dispatchAction({type:'hideTip'});});
try{initializeVisuals();await refresh();}catch(error){setLoading(true,true);message(error.message,true);}
