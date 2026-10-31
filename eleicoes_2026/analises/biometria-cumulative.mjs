import {cumulativePoint,cumulativePointAtIndex} from './biometria-cumulative-model.mjs?v=5';
import {chartTooltipOptions,installChartDismissal} from './ui-overlays.mjs';
import {ELECTION_COLORS} from './election-results.mjs';
const fmt=new Intl.NumberFormat('pt-BR'),pct=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}),rate=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4});
export function cumulativeTooltip(p){
 const header=`<strong>${pct.format(p.progress)}% de urnas apuradas</strong>`;
 if(!p.valid)return `<div class="bio-map-detail">${header}<br><small>Nenhuma faixa de urnas apurada até este percentual.</small></div>`;
 return `<div class="bio-map-detail">${header}<div>${p.metric==='biometry'?'Com biometria':'Falha biométrica'}: <b>${rate.format(p.rate)}%</b></div><div class="election-candidates"><span class="lula"><b>Lula</b><br>${pct.format(p.lulaPercent)}% · ${fmt.format(p.lula)} votos</span><span class="flavio"><b>Flávio</b><br>${pct.format(p.flavioPercent)}% · ${fmt.format(p.flavio)} votos</span></div><div class="election-bar" role="img" aria-label="Lula ${pct.format(p.lulaPercent)}%, Flávio ${pct.format(p.flavioPercent)}%"><span class="lula" style="width:${p.lulaPercent}%"></span><span class="flavio" style="width:${p.flavioPercent}%"></span></div><small>Total: ${fmt.format(p.valid)} votos válidos<br>${fmt.format(p.sections)} de ${fmt.format(p.totalSections)} urnas acumuladas · ${pct.format(p.progress)}%</small></div>`;
}
export function createBiometryCumulative({element,status,uf,zone,limit,consult,order,metricSelect,rateLabel,metricLegend,worker}){
 const chart=echarts.init(element);let id=0,current,direction='ascending',metric=metricSelect.value;
 new ResizeObserver(()=>chart.resize()).observe(element);installChartDismissal(()=>[chart]);
 worker.addEventListener('message',({data})=>{
  if(!['cumulative-result','cumulative-error'].includes(data.type)||data.id!==id)return;
  chart.hideLoading();
  if(data.type==='cumulative-error'){current=null;chart.clear();status.textContent=data.message;consult.disabled=true;return;}
  current=data;consult.disabled=!data.totalSections;
  status.textContent=data.totalSections?`${fmt.format(data.totalSections)} urnas com logs e BU no recorte. Ordem: ${data.direction==='ascending'?'menor → maior':'maior → menor'} taxa ${data.metric==='biometry'?'de biometria':'de falha'}. Urnas com a mesma taxa entram juntas.`:'Nenhuma urna com logs e BU neste recorte.';
  element.dataset.totalSections=String(data.totalSections);element.dataset.direction=data.direction;
  if(!data.totalSections){chart.clear();return;}
  const length=data.sections.length,candidates=[new Float64Array(length*2),new Float64Array(length*2)],rateCurve=new Float64Array(length*2);
  for(let i=0;i<length;i++){
   const valid=data.lula[i]+data.flavio[i],x=100*data.sections[i]/data.totalSections;
   candidates[0][2*i]=candidates[1][2*i]=rateCurve[2*i]=x;
   candidates[0][2*i+1]=valid?100*data.lula[i]/valid:NaN;candidates[1][2*i+1]=valid?100*data.flavio[i]/valid:NaN;rateCurve[2*i+1]=i?100*data.rateNumerators[i]/data.rateDenominators[i]:NaN;
  }
  chart.setOption({animation:false,grid:{left:12,right:12,top:15,bottom:55,containLabel:true},
   tooltip:chartTooltipOptions({trigger:'axis',axisPointer:{type:'line',snap:true},formatter:items=>current&&items.length?cumulativeTooltip(cumulativePointAtIndex(current,items[0].dataIndex)):''}),
   xAxis:{type:'value',min:0,max:100,name:'',axisLabel:{formatter:'{value}%',fontSize:11},splitLine:{lineStyle:{color:'#e7ece2'}}},
   yAxis:[{type:'value',min:0,max:100,axisLabel:{formatter:'{value}%',fontSize:11},splitLine:{lineStyle:{color:'#e7ece2'}}},{type:'value',min:0,max:100,position:'right',axisLabel:{formatter:'{value}%',fontSize:11,color:'#648078'},splitLine:{show:false}}],
   series:[{name:data.metric==='biometry'?'Com biometria':'Falha biométrica',type:'line',dimensions:['apuracao','habilitacao'],encode:{x:0,y:1},yAxisIndex:1,step:'end',showSymbol:false,z:1,lineStyle:{width:1,color:'#648078',opacity:.3},itemStyle:{color:'#648078'},areaStyle:{color:'#648078',opacity:.10},emphasis:{disabled:true},data:rateCurve},...[0,1].map((i)=>({name:i?'Flávio':'Lula',type:'line',dimensions:['apuracao','percentual'],encode:{x:0,y:1},step:'end',showSymbol:false,connectNulls:false,z:3,lineStyle:{width:2,color:i?ELECTION_COLORS.flavio:ELECTION_COLORS.lula},itemStyle:{color:i?ELECTION_COLORS.flavio:ELECTION_COLORS.lula},data:candidates[i]}))]
  },true);
 });
 worker.addEventListener('error',()=>{current=null;chart.hideLoading();chart.clear();consult.disabled=true;status.textContent='Não foi possível carregar a apuração por falha biométrica. Recarregue a página para tentar novamente.';});
 function showLimit(){
  if(!current?.totalSections)return;
  const value=limit.valueAsNumber;if(!Number.isFinite(value)){limit.reportValidity();return;}
  const p=cumulativePoint(current,value);limit.value=String(p.requestedProgress);element.dataset.selectedProgress=String(p.progress);chart.dispatchAction({type:'showTip',seriesIndex:0,dataIndex:p.index});
 }
 metricSelect.addEventListener('change',()=>{metric=metricSelect.value;render();});order.addEventListener('click',()=>{direction=direction==='ascending'?'descending':'ascending';render();});consult.addEventListener('click',showLimit);limit.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();showLimit();}});
 function render(){const withBio=metric==='biometry';rateLabel.textContent=withBio?'Habilitados com biometria (%)':'Habilitados após falha biométrica (%)';metricLegend.textContent=withBio?'Com biometria':'Falha biométrica';order.textContent=direction==='ascending'?'Menor → maior ⇄':'Maior → menor ⇄';order.setAttribute('aria-pressed',String(direction==='descending'));order.title=direction==='ascending'?`Inverter: começar pelas urnas com maior percentual ${withBio?'com biometria':'após falha biométrica'}`:`Inverter: começar pelas urnas com menor percentual ${withBio?'com biometria':'após falha biométrica'}`;order.setAttribute('aria-label',order.title);id++;current=null;consult.disabled=true;chart.clear();chart.showLoading({text:'Calculando acumulados…'});status.textContent='Preparando a apuração por falha biométrica…';worker.postMessage({type:'cumulative-render',id,options:{uf:uf.value,zone:zone.value,direction,metric}});}
 return {render};
}
