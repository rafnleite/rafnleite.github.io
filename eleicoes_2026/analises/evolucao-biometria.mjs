import {comparisonShares,comparisonCounts,comparisonTooltip} from './biometria-comparison.mjs?v=counts-2';
import {chartTooltipOptions,installChartDismissal} from './ui-overlays.mjs';
const fmt=new Intl.NumberFormat('pt-BR'),pf=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2,minimumFractionDigits:2});
const section=document.getElementById('evolucaoBiometria');
const keys=['biometria','falha_biometria','sem_biometria','indeterminado'];
let data,chart;
const methodNames=['Biometria','Mesário após falha','Sem biometria','Indeterminado'];
installChartDismissal(()=>[chart]);
const percent=(n,d)=>n==null||!d?'—':pf.format(100*n/d)+'%';
const count=n=>n==null?'—':fmt.format(n);
const coverage=(n,d)=>!d?'—':pf.format(n<d?Math.min(99.99,100*n/d):100)+'%';
function selected(p){
 const uf=document.getElementById('uf')?.value;
 if(!uf)return p.total;
 return p.ufs.find(s=>s.uf===uf)||{esperadas:0,bus:0,com_detalhamento:0,comparecimento:null};
}
function render(){
 if(!data||!section)return;
 const partial=data.coleta_concluida!==true&&data.state!=='completo';
 section.querySelector('[data-evolution-status]').textContent=`${partial?'Coleta parcial':'Coleta concluída'} · atualizado em ${new Date(data.updatedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} (Brasília)`;
 section.querySelector('tbody').innerHTML=data.periods.map(p=>{
  const s=selected(p),total=s.comparecimento_total??s.comparecimento,unknown=comparisonCounts(s)?.[3];return `<tr><th scope="row">${p.ano} · ${p.turno}º turno</th><td>${count(s.biometria)}<small>${percent(s.biometria,total)}</small></td><td>${count(s.falha_biometria)}<small>${percent(s.falha_biometria,total)}</small></td><td>${count(s.sem_biometria)}<small>${percent(s.sem_biometria,total)}</small></td><td>${count(unknown)}<small>${percent(unknown,total)}</small></td><td>${count(total)}</td><td>${count(s.com_detalhamento)} / ${count(s.esperadas)}<small>${coverage(s.com_detalhamento,s.esperadas)}</small></td></tr>`;
 }).join('');
 renderChart();
}
function renderChart(){
 const node=document.getElementById('evolutionChart');
 if(!chart){
  chart=echarts.init(node);
  new ResizeObserver(()=>chart.resize()).observe(node);
 }
 const rows=data.periods.map(selected),labels=data.periods.map(p=>`${p.ano} · ${p.turno}º turno`);
 const only=document.getElementById('evolution-biometric-only').checked;
 const shares=rows.map(row=>{if(!only)return comparisonShares(row);const counts=comparisonCounts(row);if(!counts||!counts[0]&&!counts[1])return null;const total=counts[0]+counts[1];return [100*counts[0]/total,100*counts[1]/total];}),values=keys.map((_,j)=>shares.map(row=>row?.[j]??null));
 const active=only?[0,1]:[0,1,2,3];
 document.getElementById('evolutionIndeterminateLegend').hidden=only;
 document.getElementById('evolutionNoBiometricLegend').hidden=only;
 node.setAttribute('aria-label',`Formas de habilitação em percentual ${only?'dos eleitores com biometria cadastrada':'do comparecimento conhecido dos BUs'}. `+labels.map((label,i)=>`${label}: `+active.map(j=>`${methodNames[j]} ${shares[i]?pf.format(shares[i][j])+'%':'—'}`).join(', ')).join('. '));
 document.getElementById('evolutionChartEmpty').hidden=values.some(series=>series.some(value=>value!==null));
 chart.setOption({animation:false,color:['#4c8061','#bf914a','#4f7da0','#6d7775'],
  grid:{left:12,right:16,top:12,bottom:16,containLabel:true},
  tooltip:chartTooltipOptions({trigger:'axis',axisPointer:{type:'shadow'},formatter:items=>{
   if(!items.length)return '';
   const i=items[0].dataIndex,row=rows[i];
   if(only){const counts=comparisonCounts(row);return `<strong>${labels[i]}</strong><br>`+active.map((j,seriesIndex)=>`${items.find(item=>item.seriesIndex===seriesIndex)?.marker||''} ${methodNames[j]}: <strong>${shares[i]?pf.format(shares[i][j])+'%':'—'}</strong> · ${counts?fmt.format(counts[j]):'—'} votos`).join('<br>')+(counts?`<br><small>Total: ${fmt.format(counts[0]+counts[1])} votos</small>`:'');}
   return comparisonTooltip(labels[i],row,active.map((j,seriesIndex)=>items.find(item=>item.seriesIndex===seriesIndex)?.marker||''));
  }}),
  xAxis:{type:'value',min:0,max:100,interval:20,axisLabel:{formatter:value=>`${value}%`,fontSize:11,color:'#65766b'},splitLine:{lineStyle:{color:'#e7ece2'}}},
  yAxis:{type:'category',inverse:true,data:labels,axisTick:{show:false},axisLine:{show:false},axisLabel:{interval:0,fontSize:11,color:'#65766b',formatter:label=>label.replace(' · ','\n')}},
  series:active.map(j=>({name:methodNames[j],type:'bar',stack:'habilitacao',data:values[j],barMaxWidth:42,label:{show:true,position:'inside',fontSize:11,color:j===1?'#283c2b':'#fff',formatter:item=>item.value==null||item.value<3||(node.clientWidth<600&&item.value<12)?'':pf.format(item.value)+'%'},labelLayout:{hideOverlap:true},emphasis:{focus:'series'}}))
 },true);
}

async function refresh(){
 try{const r=await fetch('./evolucao-biometria.json');if(!r.ok)throw Error('Arquivo local do comparativo indisponível');const next=await r.json();data=next;render();}
 catch(e){section.querySelector('[data-evolution-status]').textContent=data?'Não foi possível atualizar. Exibindo os últimos dados recebidos.':'Aguardando dados dos boletins de urna.';}
}
if(section){document.getElementById('uf')?.addEventListener('change',render);document.getElementById('evolution-biometric-only').addEventListener('change',renderChart);refresh();}
