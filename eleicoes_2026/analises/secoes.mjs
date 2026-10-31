import {combineStates,modes,percentageLabel} from './secoes-model.mjs';
import {sectionDistributions,complementaryPercentageLabel} from './secoes-domains.mjs';
import {electionSummary,ELECTION_COLORS,ELECTION_SCALE} from './election-results.mjs';
import {chartTooltipOptions,installChartDismissal,enhanceStateSelect} from './ui-overlays.mjs';

const $=id=>document.getElementById(id),fmt=new Intl.NumberFormat('pt-BR'),pct=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
let data,selector,charts=[];
const chartIds=['winners','margins','percentages','weighted'];
let chartResizeFrame=null;
function scheduleChartResize(){
  if(chartResizeFrame!==null)return;
  chartResizeFrame=requestAnimationFrame(()=>{chartResizeFrame=null;charts.forEach(chart=>chart.resize());});
}
const chartWidths=new WeakMap();
const chartObserver=new ResizeObserver(entries=>{
  let changed=false;
  for(const {target,contentRect} of entries){
    const width=contentRect.width;
    if(width>0&&chartWidths.get(target)!==width){chartWidths.set(target,width);changed=true;}
  }
  if(changed)scheduleChartResize();
});
for(const id of chartIds)chartObserver.observe($(id));
installChartDismissal(()=>charts);
const selected=()=>[...$('uf').selectedOptions].map(o=>o.value);
const compact=n=>Math.abs(n)>=1e6?`${pct.format(n/1e6)} mi`:Math.abs(n)>=1000?`${pct.format(n/1000)} mil`:fmt.format(n);
const marginLabel=n=>n<0?`+${fmt.format(-n)} Flávio`:n>0?`+${fmt.format(n)} Lula`:'Empate';
const colorForMargin=n=>n<0?ELECTION_COLORS.flavio:n>0?ELECTION_COLORS.lula:ELECTION_COLORS.tie;
function summary(){
  const n=selected().length,total=data.states.length;
  $('ufSummary').textContent=`${n} de ${total} estados selecionados.`;
  const label=n===total?'Todos os estados':!n?'Selecione os estados':n<=2?selected().join(', '):`${n} estados selecionados`;
  const el=selector?.control.querySelector('.state-selection-label');if(el){el.textContent=label;el.title=label;}
}
function setupFilter(){
  $('uf').replaceChildren(...data.states.map(s=>new Option(s.label,s.uf,true,true)));
  selector=new TomSelect($('uf'),{dropdownParent:$('siteFilters')?'#siteFilters':'body',plugins:['dropdown_input','checkbox_options','no_active_items','no_backspace_delete'],hideSelected:false,closeAfterSelect:false,maxItems:null,maxOptions:null,searchField:['text'],placeholder:'Selecione os estados',onChange(){summary();render();},onDropdownClose(){this.setTextboxValue('');this.refreshOptions(false);}});
  enhanceStateSelect(selector,{onAll:()=>{selector.setValue(data.states.map(s=>s.uf),true);summary();render();},onNone:()=>{selector.clear(true);summary();render();}});
  selector.control_input.placeholder='Buscar estado…';selector.control_input.setAttribute('aria-label','Buscar estado');
  selector.control.setAttribute('aria-label','Estados');const label=document.createElement('span');label.className='state-selection-label';selector.control.append(label);summary();
}
function modeText(values,describe){return values.slice(0,4).map(describe).join('; ')+(values.length>4?` e mais ${fmt.format(values.length-4)} faixas`:'');}
function base(){return {animation:false,aria:{enabled:true},textStyle:{fontFamily:'Inter, Segoe UI, Arial, sans-serif',color:'#63765e'},grid:{left:35,right:25,top:48,bottom:100,containLabel:true},tooltip:chartTooltipOptions({trigger:'axis',backgroundColor:'#fffefb',borderColor:'#d7dfd0',textStyle:{fontSize:12,color:'#3e5e43'}}),xAxis:{type:'category',axisTick:{show:false},axisLabel:{fontSize:9,color:'#7c8b73'},axisLine:{lineStyle:{color:'#cdd8c5'}}},yAxis:{type:'value',minInterval:1,nameTextStyle:{align:'left',fontSize:10},axisLabel:{formatter:compact,fontSize:10},splitLine:{lineStyle:{color:'#e8eee3'}}}};}
function syncZoomButtons(){
  document.querySelectorAll('[data-reset-chart]').forEach(button=>{
    const chart=charts[chartIds.indexOf(button.dataset.resetChart)];
    const zoom=chart?.getOption().dataZoom||[];
    button.disabled=!zoom.some(item=>Number(item.start??0)>0||Number(item.end??100)<100);
  });
}
function render(){
  if(!data||charts.length!==4)return;
  const r=combineStates(data.states,selected());
  charts.forEach(chart=>chart.dispatchAction({type:'hideTip'}));
  $('sectionsCount').textContent=fmt.format(r.eligible);$('validCount').textContent=fmt.format(r.lula+r.flavio);
  $('lulaCount').textContent=fmt.format(r.lula);$('flavioCount').textContent=fmt.format(r.flavio);
  $('coverage').textContent=selected().length?`${fmt.format(r.bus)} BUs disponíveis em ${fmt.format(r.expected)} seções cadastradas. ${fmt.format(r.expected-r.bus)} sem BU nesta base; ${fmt.format(r.noValid)} BUs sem votos em Lula ou Flávio, excluídos dos gráficos.`:'Nenhum estado selecionado. Use “Marcar todos” ou selecione os estados no filtro.';
  const [lulaWins,flavioWins,ties]=r.winners;
  $('winnerText').textContent=r.eligible?`${lulaWins===flavioWins?'Os candidatos venceram o mesmo número de seções.':`${lulaWins>flavioWins?'Lula':'Flávio'} venceu mais seções neste recorte.`} Lula: ${fmt.format(lulaWins)} · Flávio: ${fmt.format(flavioWins)} · Empates: ${fmt.format(ties)}.`:'Não há seções com votos válidos neste recorte.';
  const marginModes=modes(r.margins),percentageModes=modes(r.percentages.map((n,i)=>[i,n]));
  $('marginText').textContent=marginModes.length?`Diferença mais frequente${marginModes.length>1?' (empate na frequência)':''}: ${modeText(marginModes,marginLabel)}.`:'Sem diferenças para exibir.';
  $('percentText').textContent=percentageModes.length?`Faixa mais frequente${percentageModes.length>1?' (empate na frequência)':''}: ${modeText(percentageModes,i=>`${percentageLabel(i)} para Lula`)}. A escala superior mostra a parcela complementar de Flávio.`:'Sem percentuais para exibir.';
  $('netText').textContent=r.eligible?`Saldo do recorte: ${r.net?`${fmt.format(Math.abs(r.net))} votos a favor de ${r.net>0?'Lula':'Flávio'}`:'empate em votos'}. Barras vermelhas somam vantagens de Lula; barras azuis, vantagens de Flávio.`:'Sem contribuições para exibir.';
  if(!r.eligible){for(const chart of charts){chart.clear();chart.setOption({title:{text:'Sem seções no recorte',left:'center',top:'middle',textStyle:{fontSize:15,fontWeight:400,color:'#89937f'}}});}syncZoomButtons();return;}
  charts[0].setOption({animation:false,aria:{enabled:true},tooltip:chartTooltipOptions({trigger:'item',formatter:p=>`${p.name}<br><b>${fmt.format(p.value)} seções</b> · ${pct.format(100*p.value/r.eligible)}%`}),legend:{bottom:20,textStyle:{color:'#687e61'}},series:[{type:'pie',radius:'61%',center:['50%','44%'],minShowLabelAngle:2,avoidLabelOverlap:true,label:{formatter:p=>`${p.name}\n${pct.format(100*p.value/r.eligible)}%`,fontSize:12,lineHeight:20},itemStyle:{borderColor:'#fffefb',borderWidth:2},data:[{name:'Lula',value:lulaWins,itemStyle:{color:ELECTION_COLORS.lula}},{name:'Flávio',value:flavioWins,itemStyle:{color:ELECTION_COLORS.flavio}},{name:'Empate',value:ties,itemStyle:{color:ELECTION_COLORS.tie}}]}]},true);
  const plot=sectionDistributions(r),{differences,countValues,contributions,percentageBins:bins,percentageValues}=plot;
  const differenceAxis={...base().xAxis,data:differences,axisLabel:{fontSize:9,hideOverlap:true,formatter:v=>v<0?`${fmt.format(-v)} F`:v>0?`${fmt.format(v)} L`:'0'},name:'Diferença em votos (Lula − Flávio)',nameLocation:'middle',nameGap:32,nameTextStyle:{fontSize:10}};
  const zoom=()=>[{type:'slider',start:0,end:100,bottom:18,height:20,brushSelect:false,showDetail:false,filterMode:'none'},{type:'inside',start:0,end:100,zoomOnMouseWheel:true,moveOnMouseWheel:false,filterMode:'none'}];
  const marginData=differences.map((n,index)=>({value:countValues[index],itemStyle:{color:colorForMargin(n)}}));
  charts[1].setOption({...base(),xAxis:differenceAxis,yAxis:{...base().yAxis,...plot.countDomain,name:'Número de seções'},dataZoom:zoom(),tooltip:{...base().tooltip,formatter:items=>{const p=items[0];return `${marginLabel(differences[p.dataIndex])}<br><b>${fmt.format(p.value)} seções</b>`;}},series:[{type:'bar',barCategoryGap:0,large:false,data:marginData}]},true);
  charts[2].setOption({...base(),grid:{left:35,right:25,top:75,bottom:72,containLabel:true},xAxis:[{...base().xAxis,data:bins,name:'Percentual de Lula',nameLocation:'middle',nameGap:38,axisLabel:{fontSize:10,interval:'auto',hideOverlap:true,formatter:v=>`${v}%`}},{...base().xAxis,data:bins,position:'top',name:'Flávio (percentual complementar)',nameLocation:'middle',nameGap:38,axisLabel:{fontSize:10,interval:'auto',hideOverlap:true,formatter:v=>`${100-Number(v)}%`}}],dataZoom:[{type:'inside',start:0,end:100,xAxisIndex:[0,1],zoomOnMouseWheel:true,moveOnMouseWheel:false,filterMode:'none'}],yAxis:{...base().yAxis,...plot.percentageDomain,name:'Número de seções'},tooltip:{...base().tooltip,formatter:items=>{const i=bins[items[0].dataIndex];return `Lula: ${percentageLabel(i)}<br>Flávio: ${complementaryPercentageLabel(i)}<br><b>${fmt.format(items[0].value)} seções</b>`;}},series:[{type:'bar',barCategoryGap:0,data:percentageValues.map((value,index)=>{const i=bins[index];return {value,itemStyle:{color:echarts.color.lerp(electionSummary({lula:2*i+1,flavio:199-2*i,bus:1,sections:1}).colorPosition,ELECTION_SCALE)}};})}]},true);
  charts[3].setOption({...base(),xAxis:differenceAxis,yAxis:{...base().yAxis,...plot.contributionDomain,name:'Saldo em votos · Lula − Flávio'},dataZoom:zoom(),tooltip:{...base().tooltip,formatter:items=>{const p=items[0],n=differences[p.dataIndex];return `${marginLabel(n)}<br>${fmt.format(countValues[p.dataIndex])} seções × ${fmt.format(n)} votos<br><b>Contribuição: ${fmt.format(p.value)} votos</b>`;}},series:[{type:'bar',barCategoryGap:0,data:differences.map((n,index)=>({value:contributions[index],itemStyle:{color:colorForMargin(n)}}))}]},true);
  syncZoomButtons();
}
async function load(){
  $('content').hidden=true;$('loadingPanel').hidden=false;$('spinner').hidden=false;$('retry').hidden=true;$('loadingTitle').textContent='Carregando os dados';
  try{
    const response=await fetch('./section-results.json',{cache:'no-cache'});if(!response.ok)throw Error(`HTTP ${response.status}`);
    data=await response.json();if(data.schemaVersion!==1||data.year!==2026||data.turn!==2||!Array.isArray(data.states))throw Error('Formato de dados incompatível');
    selector?.destroy();setupFilter();$('content').hidden=false;$('loadingPanel').hidden=true;
    if(!charts.length)charts=chartIds.map(id=>{const chart=echarts.init($(id),null,{renderer:'canvas'});chart.on('datazoom',syncZoomButtons);return chart;});
    const date=new Date(data.sourceSnapshot||data.generatedAt);$('snapshot').textContent='Base de '+date.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'})+' · Brasília';
    render();charts.forEach(c=>c.resize());
  }catch(error){$('content').hidden=true;$('loadingPanel').hidden=false;$('spinner').hidden=true;$('retry').hidden=false;$('loadingTitle').textContent='Não foi possível carregar os dados';$('loadingText').textContent=`${error.message}. Use o botão abaixo para tentar novamente.`;}
}
$('selectAll').onclick=()=>{selector.close();selector.setValue(data.states.map(s=>s.uf),true);summary();render();};$('clearAll').onclick=()=>{selector.close();selector.clear(true);summary();render();};$('retry').onclick=load;
document.querySelectorAll('[data-reset-chart]').forEach(button=>button.addEventListener('click',()=>{
  const chart=charts[chartIds.indexOf(button.dataset.resetChart)];
  if(chart){chart.dispatchAction({type:'dataZoom',start:0,end:100});chart.dispatchAction({type:'hideTip'});syncZoomButtons();}
}));
document.addEventListener('site:filterschange',()=>{selector?.close();charts.forEach(chart=>chart.dispatchAction({type:'hideTip'}));scheduleChartResize();});
window.addEventListener('resize',scheduleChartResize);load();
