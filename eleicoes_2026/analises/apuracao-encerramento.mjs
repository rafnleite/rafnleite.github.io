import {accumulate,clock,reachesFinalFlavio} from './apuracao-encerramento-model.mjs?v=3';
import {formatCoveragePercent} from './histogram.mjs';
const $=id=>document.getElementById(id),fmt=new Intl.NumberFormat('pt-BR'),pf=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
let data,current,charts=[];const colors=['#d73027','#2166ac'];
function render(){
 current=accumulate(data,{uf:$('tallyUf').value,territory:$('tallyTerritory').value});
 const {points,coverage:c,base}=current;
 const validBase=base.lula+base.flavio,initial={...base,t:points.length?points[0].t-1:0,isBaseline:true,lulaPct:validBase?100*base.lula/validBase:null,flavioPct:validBase?100*base.flavio/validBase:null};
 const visible=base.sections?(points.length?[initial,...points]:[initial,{...initial,t:86400}]):points,last=visible.at(-1);
 const threshold=reachesFinalFlavio(points,base);current.threshold=threshold;
 $('tallyExterior').textContent=base.sections?`Saldo do exterior: ${fmt.format(base.sections)} urnas · Lula ${fmt.format(base.lula)} · Flávio ${fmt.format(base.flavio)}. Inclui ${fmt.format(base.withoutTime||0)} urnas sem horário.`:'Sem saldo do exterior neste recorte.';
 const hit=threshold.point,before=threshold.before;
 $('tallyLead').textContent=threshold.target<=0?'Flávio não tem votos neste recorte; o marco não se aplica.':threshold.inInitialBalance?`Lula já alcança os ${fmt.format(threshold.target)} votos finais de Flávio no saldo inicial do exterior.`:hit?`Às ${clock(hit.t)}, Lula passa de ${fmt.format(before.lula)} para ${fmt.format(hit.lula)} votos e alcança os ${fmt.format(threshold.target)} votos finais de Flávio.`:`Lula não alcança os ${fmt.format(threshold.target)} votos finais de Flávio neste recorte.`;
 $('tallyCoverage').textContent=`${fmt.format(c.included)} de ${fmt.format(c.expected)} urnas na curva (${formatCoveragePercent(c.included,c.expected)}). Fora da curva: ${fmt.format(c.withoutTime)} sem horário e ${fmt.format(c.expected-c.bus)} sem BU.`;
 $('tallySummary').textContent=last?`Resultado do recorte: Lula ${fmt.format(last.lula)} (${last.lulaPct==null?'—':pf.format(last.lulaPct)+'%'}) · Flávio ${fmt.format(last.flavio)} (${last.flavioPct==null?'—':pf.format(last.flavioPct)+'%'}). ${fmt.format(last.white)} brancos e ${fmt.format(last.invalid)} nulos.`:'Não há BUs neste recorte.';
 $('tallyCsv').disabled=!visible.length;
 const map=new Map(visible.map(p=>[p.t,p]));
 charts.forEach((chart,index)=>{
  const pct=index===0,keys=pct?['lulaPct','flavioPct']:['lula','flavio'];
  chart.setOption({animation:false,color:colors,aria:{enabled:true},textStyle:{fontFamily:'Segoe UI, Arial, sans-serif'},legend:{top:5},grid:{left:70,right:65,top:65,bottom:85},
   tooltip:{trigger:'axis',confine:true,formatter:items=>{const p=map.get(items[0]?.value?.[0]);if(!p)return '';return `<b>${p.isBaseline?'Saldo inicial do exterior':clock(p.t)+' · Brasília'}</b><br>${fmt.format(p.sections)} seções contabilizadas · ${c.expected?pf.format(100*p.sections/c.expected)+'%':'—'} das urnas do recorte<br><span style="color:${colors[0]}">Lula: ${fmt.format(p.lula)} · ${p.lulaPct==null?'—':pf.format(p.lulaPct)+'%'}</span><br><span style="color:${colors[1]}">Flávio: ${fmt.format(p.flavio)} · ${p.flavioPct==null?'—':pf.format(p.flavioPct)+'%'}</span><br>${fmt.format(p.total)} votos, incluindo brancos e nulos`; }},
   xAxis:{type:'value',min:points.length?points[0].t-1:0,max:points.at(-1)?.t??86400,axisLabel:{formatter:v=>clock(Math.round(v)),hideOverlap:true},name:'Encerramento · Brasília',nameLocation:'middle',nameGap:31},
   yAxis:[{type:'value',min:0,...(pct?{max:100}:{}),axisLabel:{formatter:v=>pct?v+'%':fmt.format(v)},splitLine:{lineStyle:{color:'#e3e9df'}}},{type:'value',position:'right',min:0,max:100,name:'Urnas apuradas',nameTextStyle:{color:'#648078'},axisLabel:{formatter:v=>v+'%',color:'#648078'},splitLine:{show:false}}],
   dataZoom:[{type:'inside',filterMode:'none'},{type:'slider',bottom:5,filterMode:'none',labelFormatter:v=>clock(Math.round(v))}],
   series:[{name:'Urnas apuradas',type:'line',yAxisIndex:1,step:'end',showSymbol:false,z:1,lineStyle:{width:1,color:'#648078',opacity:0.35},itemStyle:{color:'#648078'},areaStyle:{color:'#648078',opacity:0.12},emphasis:{disabled:true},data:visible.length?[...(!base.sections?[[visible[0].t-1,0]]:[]),...visible.map(p=>[p.t,c.expected?100*p.sections/c.expected:null])]:[]},...keys.map((key,i)=>({name:i?'Flávio · 22':'Lula · 13',type:'line',step:'end',showSymbol:false,connectNulls:false,z:3,lineStyle:{width:2},markLine:i===0?{silent:true,symbol:'none',lineStyle:{type:'dashed',color:'#596a54'},label:{formatter:'{b}',position:'insideEndTop'},data:[...(!pct&&last?[{yAxis:last.lula,name:'Lula final: '+fmt.format(last.lula),lineStyle:{color:colors[0],type:'dotted',width:2.5},label:{color:colors[0],position:'insideEndTop'}},{yAxis:last.flavio,name:'Flávio final: '+fmt.format(last.flavio),lineStyle:{color:colors[1],type:'dotted',width:2},label:{color:colors[1],position:'insideEndTop'}}]:[])]}:undefined,data:visible.length?[...(!base.sections&&!pct?[[visible[0].t-1,0]]:[]),...visible.map(p=>[p.t,p[key]])]:[]}))]},true);
 });
}
function csv(){
 const rows=[['horario_brasilia','segundo_relativo','secoes_contabilizadas','lula','flavio','lula_pct_validos','flavio_pct_validos','total_incluindo_brancos_nulos','brancos','nulos'],...(current.base.sections?[['Saldo inicial exterior','',current.base.sections,current.base.lula,current.base.flavio,100*current.base.lula/(current.base.lula+current.base.flavio),100*current.base.flavio/(current.base.lula+current.base.flavio),current.base.total,current.base.white,current.base.invalid]]:[]),...current.points.map(p=>[clock(p.t),p.t,p.sections,p.lula,p.flavio,p.lulaPct,p.flavioPct,p.total,p.white,p.invalid])];
 const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='apuracao-por-encerramento.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
try{
 const r=await fetch('./apuracao-encerramento.json?v=2');if(!r.ok)throw Error('Não foi possível carregar os BUs');data=await r.json();
 $('tallyUf').append(...data.coverage.map(c=>new Option(c.uf,c.uf)));
 charts=['tallyPercent','tallyVotes'].map(id=>echarts.init($(id)));charts.forEach(c=>c.group='tally');echarts.connect('tally');
 new ResizeObserver(()=>charts.forEach(c=>c.resize())).observe($('tallyCharts'));
 $('tallyUf').onchange=render;$('tallyTerritory').onchange=render;$('tallyCsv').onclick=csv;
 $('tallyReset').onclick=()=>charts.forEach(c=>c.dispatchAction({type:'dataZoom',start:0,end:100}));
 $('tallyDate').textContent='Base gerada em '+new Date(data.generatedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' (Brasília).';render();
}catch(e){$('tallyCoverage').textContent=e.message;}
