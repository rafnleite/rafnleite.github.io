import {createMapTooltip} from './ui-overlays.mjs';
import {scatterDetailHTML} from './biometria-details.mjs?v=tooltip-2';
import {createScatterCanvas} from './biometria-scatter-canvas.mjs?v=gray-2';
import {ELECTION_COLORS} from './election-results.mjs';
const fmt=new Intl.NumberFormat('pt-BR');
export function createBiometryScatter({element,status,level,metric,uf,zone,worker}){
 const chart=echarts.init(element),tooltip=createMapTooltip(),canvas=createScatterCanvas(element,chart);let id=0,ready=false,hover=0,hoverFrame,pointer,drawLevel='zone',current;
 element.dataset.chartZoom='disabled';
 new ResizeObserver(()=>{hide();chart.resize();if(current)canvas.draw(current);}).observe(element);
 const hide=()=>{hover++;cancelAnimationFrame(hoverFrame);pointer=null;tooltip.remove();};
 element.addEventListener('mouseleave',hide);
 function locate(event){
  if(!ready)return;
  const box=element.getBoundingClientRect(),pixel=[(event.clientX-box.left)*chart.getWidth()/box.width,(event.clientY-box.top)*chart.getHeight()/box.height],axes={xAxisIndex:0,yAxisIndex:1};
  if(!chart.containPixel({gridIndex:0},pixel)){hide();return;}
  pointer={clientX:event.clientX,clientY:event.clientY,pixel,hover:++hover};cancelAnimationFrame(hoverFrame);
  hoverFrame=requestAnimationFrame(()=>{
   if(!pointer)return;const [x,y]=chart.convertFromPixel(axes,pointer.pixel),other=chart.convertFromPixel(axes,[pointer.pixel[0]+8,pointer.pixel[1]+8]);
   worker.postMessage({type:'nearest',id,hover:pointer.hover,x,y,dx:Math.abs(other[0]-x)||.01,dy:Math.abs(other[1]-y)||.01});
  });
 }
 element.addEventListener('mousemove',locate);element.addEventListener('pointerdown',event=>{hide();if(event.pointerType==='touch')locate(event);});
 worker.addEventListener('message',({data})=>{
  if(!['nearest','result','error'].includes(data.type)||data.id!==id)return;
  if(data.type==='nearest'){
   if(!pointer||data.hover!==pointer.hover)return;
   if(!data.point){tooltip.remove();return;}
   const {clientX,clientY}=pointer,reference={contextElement:element,getBoundingClientRect:()=>new DOMRect(clientX,clientY,1,1)};
   tooltip.show(reference,scatterDetailHTML(data.point,drawLevel));return;
  }
  chart.hideLoading();
  if(data.type==='error'){ready=false;current=null;canvas.clear();chart.clear();status.textContent=data.message+' Tente novamente alterando o filtro de UF.';return;}
  if(data.type!=='result')return;
  const unit={section:'urnas',place:'locais de votação',zone:'zonas',city:'cidades',state:'estados'}[level.value];
  status.textContent=data.count?`${fmt.format(data.count)} ${unit}${level.value==='section'?' com logs e BU no recorte':` · ${fmt.format(data.sections)} urnas com logs e BU no recorte`}. Percentuais calculados pela soma dos eleitores e votos de cada grupo.`:'Nenhum par de dados disponível neste recorte.';
  drawLevel=level.value;const xLabel=metric.value==='failure'?'Eleitores habilitados após falha biométrica (%)':'Eleitores habilitados com biometria (%)';
  element.setAttribute('aria-label',`Biometria e resultado das eleições. ${xLabel}. Eixo esquerdo azul: votos em Flávio; eixo direito vermelho: votos em Lula, sobre os votos válidos. ${status.textContent}`);
  element.dataset.pointCount=String(data.count);
  chart.setOption({animation:false,grid:{left:12,right:12,top:16,bottom:50,containLabel:true},tooltip:{show:false},
   xAxis:{type:'value',min:0,max:100,name:xLabel,nameLocation:'middle',nameGap:30,nameTextStyle:{fontSize:11},axisLabel:{formatter:'{value}%',fontSize:11},splitLine:{lineStyle:{color:'#e7ece2'}}},
   yAxis:[{type:'value',min:0,max:100,inverse:true,position:'left',axisLabel:{formatter:'{value}%',fontSize:11,color:ELECTION_COLORS.flavio},axisLine:{show:true,lineStyle:{color:ELECTION_COLORS.flavio}},splitLine:{lineStyle:{color:'#e7ece2'}}},{type:'value',min:0,max:100,position:'right',axisLabel:{formatter:'{value}%',fontSize:11,color:ELECTION_COLORS.lula},axisLine:{show:true,lineStyle:{color:ELECTION_COLORS.lula}},splitLine:{show:false}}],series:[]
  },true);current=data;canvas.draw(data);ready=true;
 });
 worker.addEventListener('error',()=>{ready=false;current=null;canvas.clear();chart.hideLoading();chart.clear();status.textContent='Não foi possível carregar o gráfico. Recarregue a página para tentar novamente.';});
 function render(){id++;ready=false;current=null;hide();canvas.clear();chart.clear();chart.showLoading({text:'Carregando…'});status.textContent='Preparando os pontos da dispersão…';worker.postMessage({type:'render',id,options:{level:level.value,metric:metric.value,uf:uf.value,zone:zone.value}});}
 level.addEventListener('change',render);metric.addEventListener('change',render);
 return {render};
}
