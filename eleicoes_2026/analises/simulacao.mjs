import {bindCandidateLegend,candidateOpacity,candidateColor} from './simulacao-legend.mjs?v=legend-highlight-2';
import {createAxisControl} from './simulacao-axis-control.mjs?v=axis-label-2';
import {attachSimulationNavigation,fitSeriesY,formatSimulationPercent} from './simulacao-chart-navigation.mjs?v=completion-area-2';
import {LEVELS,REGIONS,STATE_NAMES,setRegionLevel,regionLevel,clock} from './simulacao-model.mjs?v=fast-draw-1';
import {PLAYBACK_RATES,playbackBounds,playbackPoint} from './simulacao-playback.mjs?v=percent-playback-1';
const $=id=>document.getElementById(id),fmt=new Intl.NumberFormat('pt-BR'),pct=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}),decimal=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
const modeNames={region:'Escolher velocidade por região',random:'Aleatório',lula:'Lula primeiro',flavio:'Flávio primeiro',zigzag:'Zig zag'};
const defaultLevels=()=>Object.fromEntries(Object.keys(STATE_NAMES).map(uf=>[uf,3]));
let highlightedCandidate=null;
let levels=defaultLevels(),metadata,result,worker,requestId=0,busy=false,activeRequest,pendingRequest,seedTimer,charts=[],axisControls=[],selectedAxis='time',playing=false,frame,playbackAxis='time',playbackPosition=0,lastFrame=0,lastRender=0;
const mode=()=>document.querySelector('input[name=mode]:checked').value;
const modeCopy={random:'Nível 3 em todas as regiões, com um atraso sorteado por local.',lula:'Locais selecionados do maior para o menor percentual de Lula.',flavio:'Locais selecionados do maior para o menor percentual de Flávio.',zigzag:'Alterna locais já prontos para buscar trocas de liderança.'};
function settings(){
  $('speedControls').replaceChildren();
  for(const key of Object.keys(REGIONS)){
    const row=document.createElement('div');row.className='speed-row';
    const heading=document.createElement('div');heading.className='speed-row-heading';
    const name=document.createElement('span');name.textContent=key;name.title=key;
    const group=document.createElement('div');group.className='speed-button-group';group.setAttribute('role','radiogroup');group.setAttribute('aria-label',`Velocidade: ${key}`);
    const buttons=[];
    function showLevel(value){
      buttons.forEach((button,index)=>{const active=Number(value)===index+1;button.setAttribute('aria-checked',String(active));button.tabIndex=active||(!value&&index===0)?0:-1;});
    }
    function choose(value){levels=setRegionLevel(levels,key,value);showLevel(value);run();}
    for(const [level,{mean,sd}] of Object.entries(LEVELS)){
      const button=document.createElement('button');button.type='button';button.className='speed-level';button.dataset.level=level;button.setAttribute('role','radio');
      button.setAttribute('aria-label',`Nível ${level}: média ${decimal.format(mean)} min, desvio padrão ${decimal.format(sd)} min`);button.title=`Média ${decimal.format(mean)} min · desvio padrão ${decimal.format(sd)} min`;
      button.textContent=level;button.onclick=()=>choose(Number(level));buttons.push(button);group.append(button);
    }
    group.onkeydown=event=>{
      const current=buttons.indexOf(document.activeElement);if(current<0)return;
      const next=event.key==='Home'?0:event.key==='End'?4:['ArrowRight','ArrowDown'].includes(event.key)?(current+1)%5:['ArrowLeft','ArrowUp'].includes(event.key)?(current+4)%5:null;
      if(next===null)return;event.preventDefault();choose(next+1);buttons[next].focus();
    };
    showLevel(regionLevel(levels,key));
    const draw=document.createElement('button');draw.type='button';draw.className='region-speed-draw';
    draw.setAttribute('aria-label',`Sortear velocidade: ${key}`);draw.title=`Sortear velocidade: ${key}`;
    draw.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><g fill="currentColor"><circle cx="8" cy="8" r="1.5"/><circle cx="16" cy="8" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="8" cy="16" r="1.5"/><circle cx="16" cy="16" r="1.5"/></g></svg>';
    draw.onclick=()=>choose(1+Math.floor(Math.random()*5));
    heading.append(name);row.append(heading,group,draw);$('speedControls').append(row);
  }
}
function updateMode(){
  const regional=mode()==='region';
  $('regionalSettings').hidden=!regional;$('simLayout').classList.toggle('regional-mode',regional);
  $('modeDescription').textContent=regional?'Escolha o ritmo das regiões. Cada local recebe um atraso sorteado após o encerramento.':modeCopy[mode()];
}
function setBusy(value){busy=value;$('newDraw').disabled=value||!metadata;$('export').disabled=value||!result;$('play').disabled=value||!result;$('timeline').disabled=value||!result;$('resultArea').setAttribute('aria-busy',String(value));}
function randomSeed(){const buffer=new Uint32Array(1);crypto.getRandomValues(buffer);$('seed').value=buffer[0];}
function run(){
  clearTimeout(seedTimer);updateMode();pause();
  if(!metadata)return;
  if(!$('seed').reportValidity())return;
  const viewMode=mode(),request={viewMode,options:{levels:viewMode==='region'?{...levels}:defaultLevels(),mode:viewMode==='region'?'random':viewMode,seed:Number($('seed').value),includeExterior:$('includeExterior').checked}};
  if(busy){pendingRequest=request;$('status').textContent='Atualizando o cenário selecionado…';return;}
  startRequest(request);
}
function startRequest(request){
  activeRequest=request;setBusy(true);$('status').classList.remove('error');$('status').textContent=`Simulando: ${modeNames[request.viewMode]}…`;
  worker.postMessage({type:'simulate',id:++requestId,options:request.options});
}
function fail(message){pendingRequest=null;setBusy(false);$('status').textContent=message;$('status').classList.add('error');$('retry').hidden=false;}
function load(){
  worker?.terminate();metadata=null;pendingRequest=null;activeRequest=null;$('retry').hidden=true;$('status').textContent='Carregando os boletins de urna…';setBusy(true);
  worker=new Worker(new URL('./simulacao-worker.mjs?v=fixed-regions-2',import.meta.url),{type:'module'});
  worker.onerror=()=>fail('Não foi possível iniciar a simulação. Tente carregar a página novamente.');
  worker.onmessage=({data})=>{
    if(data.type==='error'){fail(data.message);return;}
    if(data.type==='loaded'){metadata=data.metadata;setBusy(false);run();return;}
    if(data.type==='csv'){
      const url=URL.createObjectURL(data.blob),link=document.createElement('a');link.href=url;link.download=`simulacao-${result.viewMode}-sorteio-${result.seed}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('export').disabled=busy;$('export').textContent='Baixar urnas em CSV';return;
    }
    if(data.type!=='result'||data.id!==requestId)return;
    // Coalesce fast clicks and render only the latest requested scenario.
    if(pendingRequest){const next=pendingRequest;pendingRequest=null;startRequest(next);return;}
    result=data.result;result.viewMode=activeRequest.viewMode;setBusy(false);$('retry').hidden=true;$('resultArea').hidden=!result.n;
    if(!result.n){$('status').textContent='Não há urnas com encerramento conhecido neste recorte.';return;}
    $('status').textContent=`${fmt.format(result.n)} urnas em ${fmt.format(result.groupCount)} locais de votação.`;
    const included=metadata.coverage.filter(c=>activeRequest.options.includeExterior||c.uf!=='ZZ'),sum=k=>included.reduce((n,c)=>n+c[k],0);
    $('coverage').textContent=`${fmt.format(sum('included'))} urnas com horário · ${fmt.format(sum('withoutTime'))} sem horário · ${fmt.format(sum('expected')-sum('bus'))} sem BU. Cadastro: ${fmt.format(sum('expected'))} seções.`;
    $('snapshotDate').textContent=`Base gerada em ${new Date(metadata.generatedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} (Brasília). Eleição: 25/10/2026.`;
    const shareOrdered=result.mode==='lula'||result.mode==='flavio';
    $('initialBalance').textContent=shareOrdered?`Locais ordenados pelo percentual do candidato, ${activeRequest.options.includeExterior?'incluindo o exterior':'sem o exterior'}. Sem saldo inicial separado.`:`Às 19h: ${fmt.format(result.initialCount)} urnas do exterior já apuradas, com ${fmt.format(result.lula[result.initialCount])} votos de Lula e ${fmt.format(result.flavio[result.initialCount])} de Flávio.`;
    $('scenarioLabel').textContent=`${modeNames[result.viewMode]} · sorteio ${result.seed} · ${fmt.format(result.changes[result.n])} trocas de liderança no cenário.`;
    if(shareOrdered)selectedAxis='count';
    playbackAxis=selectedAxis;playbackPosition=playbackBounds(result,playbackAxis).max;
    initCharts();configurePlayback();configureCharts();render();
  };
  worker.postMessage({type:'load'});
}
function initCharts(){
  if(charts.length)return;
  axisControls=[...document.querySelectorAll('[data-main-axis-control]')].map(node=>createAxisControl(node,changeMainAxis));
  charts=['percentChart','votesChart'].map(id=>{const chart=echarts.init($(id));chart.resetSimulationZoom=attachSimulationNavigation(chart);return chart;});charts.forEach(chart=>chart.group='simulation');echarts.connect('simulation');
  bindCandidateLegend(document.querySelector('.chart-panel .candidate-legend'),candidate=>{
   highlightedCandidate=candidate;
   charts.forEach(chart=>{chart.getDom().dataset.highlightedCandidate=candidate===null?'':String(candidate);chart.setOption({series:[0,1].map(i=>({lineStyle:{opacity:candidateOpacity(i,candidate),color:candidateColor(i,candidate)}}))});});
  });
  let resizeFrame;const observer=new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>charts.forEach(chart=>chart.resize()));});charts.forEach(chart=>observer.observe(chart.getDom()));
}
function xValue(k){return selectedAxis==='time'?(k===result.initialCount?result.start:result.times[k-1]):k/result.n*100;}
function tooltip(items){
  const value=items.find(item=>item.value?.length>2)?.value;if(!value)return '';
  const k=value[2],valid=result.lula[k]+result.flavio[k];
  return `<b>${k===result.initialCount?(result.initialCount?'19:00:00 · saldo inicial':'19:00:00 · início'):clock(result.times[k-1])} · Brasília</b><br>${fmt.format(k)} urnas · ${pct.format(k/result.n*100)}%<br><span style="color:#d73027">Lula: ${fmt.format(result.lula[k])} · ${valid?pct.format(result.lula[k]/valid*100)+'%':'—'}</span><br><span style="color:#2166ac">Flávio: ${fmt.format(result.flavio[k])} · ${valid?pct.format(result.flavio[k]/valid*100)+'%':'—'}</span><br>${fmt.format(result.white[k])} brancos · ${fmt.format(result.invalid[k])} nulos`;
}
function completionSeries(data=[]){
 return {id:'completion',name:'Urnas apuradas',type:'line',yAxisIndex:1,step:'end',showSymbol:false,z:1,lineStyle:{width:1,color:'#648078',opacity:.35},itemStyle:{color:'#648078'},areaStyle:{color:'#648078',opacity:.12},emphasis:{disabled:true},data};
}
function configureCharts(){
 const time=selectedAxis==='time',locked=['lula','flavio'].includes(result.mode);
 axisControls.forEach(control=>control.update(selectedAxis,locked));
 document.querySelectorAll('[data-progress-legend]').forEach(node=>{node.hidden=!time;});
 charts.forEach((chart,index)=>{
  const max=index?Math.max(1,result.lula[result.n],result.flavio[result.n]):100,node=chart.getDom();
  node.dataset.yFit=index?'full':'auto';node.dataset.yFit1='full';node.dataset.axis=selectedAxis;node.dataset.yBounds=JSON.stringify([0,max]);node.dataset.yRange=JSON.stringify([0,max]);node.dataset.completionArea=String(time);
  if(time)node.dataset.yRange1='[0,100]';else delete node.dataset.yRange1;
  node.parentElement.style.setProperty('--axis-right',time?'64px':'20px');
  const primary={type:'value',min:0,max,axisLabel:{fontSize:10,formatter:v=>index?(v>=1e6?`${decimal.format(v/1e6)} mi`:fmt.format(v)):formatSimulationPercent(v)},splitLine:{lineStyle:{color:'#e7ece2'}}};
  const candidates=[0,1].map(candidate=>({id:candidate?'flavio':'lula',name:candidate?'Flávio · 22':'Lula · 13',type:'line',yAxisIndex:0,step:'end',showSymbol:false,connectNulls:false,z:3,lineStyle:{width:2,opacity:candidateOpacity(candidate,highlightedCandidate),color:candidateColor(candidate,highlightedCandidate)},data:[],...(!index&&!candidate?{markLine:{silent:true,symbol:'none',label:{show:false},lineStyle:{type:'dashed',color:'#abb8a3',width:1},data:[{yAxis:50}]}}:{})}));
  chart.setOption({animation:false,color:['#d73027','#2166ac'],aria:{enabled:true,label:{description:(index?'Evolução dos votos acumulados de Lula e Flávio.':'Evolução dos percentuais acumulados de Lula e Flávio.')+(time?' A área mostra o percentual de urnas apuradas no eixo da direita.':'')}},textStyle:{fontFamily:'Segoe UI, Arial, sans-serif',color:'#76876f'},grid:{left:index?68:45,right:time?64:20,top:time?34:20,bottom:64,containLabel:false},tooltip:{trigger:'axis',confine:true,formatter:tooltip,backgroundColor:'#fffefb',borderColor:'#d8e1d1',textStyle:{fontSize:11,color:'#35523e'}},
   xAxis:{type:'value',min:time?result.start:0,max:time?Math.max(result.end,result.start+1):100,name:'',axisLabel:{fontSize:10,hideOverlap:true,formatter:v=>time?clock(v):`${decimal.format(v)}%`},axisLine:{lineStyle:{color:'#cfd9c9'}},splitLine:{show:false}},
   yAxis:[primary,...(time?[{type:'value',position:'right',min:0,max:100,name:'Urnas apuradas',nameGap:12,nameTextStyle:{fontSize:10,color:'#648078'},axisLabel:{fontSize:10,formatter:formatSimulationPercent,color:'#648078'},splitLine:{show:false}}]:[])],dataZoom:[],series:[...candidates,...(time?[completionSeries()]:[])]},true);
 });
}
function configurePlayback(){
  const time=playbackAxis==='time',{min,max}=playbackBounds(result,playbackAxis);
  $('startClock').textContent=time?clock(min):`${pct.format(min)}%`;
  $('endClock').textContent=time?clock(max):'100%';
  $('timelineLabel').textContent=time?'Instante da apuração simulada':'Percentual de urnas apuradas';
  for(const [i,rate] of PLAYBACK_RATES[playbackAxis].entries()){
    const option=$('playbackSpeed').options[i];option.value=rate;option.textContent=time?`${rate}×`:`${decimal.format(rate)}%/s`;
  }
}
function render(){
  if(!result?.n)return;
  const point=playbackPoint(result,playbackAxis,playbackPosition),k=point.count,valid=result.lula[k]+result.flavio[k];
  $('lulaPct').textContent=valid?`${pct.format(100*result.lula[k]/valid)}%`:'—';$('flavioPct').textContent=valid?`${pct.format(100*result.flavio[k]/valid)}%`:'—';
  $('lulaVotes').textContent=`${fmt.format(result.lula[k])} votos`;$('flavioVotes').textContent=`${fmt.format(result.flavio[k])} votos`;
  $('countPct').textContent=`${pct.format(100*k/result.n)}%`;$('count').textContent=`${fmt.format(k)} de ${fmt.format(result.n)} urnas`;
  $('leadChanges').textContent=fmt.format(result.changes[k]);const margin=result.lula[k]-result.flavio[k];$('leader').textContent=!k?'Apuração não iniciada':margin===0?'Empate':`${margin>0?'Lula':'Flávio'} na liderança`;
  const percent=`${pct.format(100*k/result.n)}%`,time=playbackAxis==='time',{min,max}=playbackBounds(result,playbackAxis);
  $('currentClock').textContent=time?clock(point.time):`${percent} das urnas`;
  $('timeline').value=max>min?(playbackPosition-min)/(max-min)*10000:10000;
  $('timeline').setAttribute('aria-valuetext',time?`${clock(point.time)} de Brasília, ${fmt.format(k)} urnas apuradas`:`${percent}, ${fmt.format(k)} de ${fmt.format(result.n)} urnas apuradas`);
  $('instantSummary').textContent=`${margin?`${fmt.format(Math.abs(margin))} votos de vantagem para ${margin>0?'Lula':'Flávio'}.`:'Sem vantagem.'} ${fmt.format(result.white[k])} brancos e ${fmt.format(result.invalid[k])} nulos.`;
  const indexes=[...result.chartIndices.filter(i=>i<=k)];if(k&&indexes.at(-1)!==k)indexes.push(k);
  charts.forEach((chart,index)=>{
    const series=[result.lula,result.flavio].map((values,candidate)=>({id:candidate?'flavio':'lula',yAxisIndex:0,data:indexes.map(i=>{const total=result.lula[i]+result.flavio[i];return [xValue(i),index?values[i]:total?values[i]/total*100:null,i];})}));
    if(time)series.push({id:'completion',yAxisIndex:1,data:indexes.map(i=>[xValue(i),100*i/result.n,i])});
    const node=chart.getDom(),options={series};node.dataset.completionPercent=time?String(100*k/result.n):'';
    const axes=chart.getOption().yAxis,patches=axes.map(()=>({}));let fitted=false;
    for(let axis=0;axis<axes.length;axis++){
      const suffix=axis?String(axis):'';
      if(node.dataset['yFit'+suffix]!=='auto')continue;
      const range=fitSeriesY(series,axis?[0,100]:JSON.parse(node.dataset.yBounds),axis);
      node.dataset['yRange'+suffix]=JSON.stringify(range);patches[axis]={min:range[0],max:range[1]};fitted=true;
    }
    if(fitted)options.yAxis=patches;
    chart.setOption(options);
  });
}
function pause(){playing=false;cancelAnimationFrame(frame);$('play').textContent='Reproduzir';}
function tick(now){
  if(!playing||!result)return;
  const {max}=playbackBounds(result,playbackAxis);
  if(lastFrame)playbackPosition=Math.min(max,playbackPosition+(now-lastFrame)/1000*Number($('playbackSpeed').value));lastFrame=now;
  if(now-lastRender>150||playbackPosition>=max){render();lastRender=now;}
  if(playbackPosition>=max){pause();return;}frame=requestAnimationFrame(tick);
}
$('play').onclick=()=>{if(playing){pause();return;}const {min,max}=playbackBounds(result,playbackAxis);if(playbackPosition>=max)playbackPosition=min;render();playing=true;lastFrame=0;lastRender=0;$('play').textContent='Pausar';frame=requestAnimationFrame(tick);};
$('timeline').oninput=()=>{pause();const {min,max}=playbackBounds(result,playbackAxis);playbackPosition=min+Number($('timeline').value)/10000*(max-min);render();};
function changeMainAxis(next){if(!result||['lula','flavio'].includes(result.mode))return;const point=playbackPoint(result,playbackAxis,playbackPosition);pause();selectedAxis=next;playbackAxis=next;playbackPosition=next==='time'?point.time:100*point.count/result.n;lastFrame=0;configurePlayback();configureCharts();render();}
$('resetZoom').onclick=()=>charts.forEach(chart=>chart.resetSimulationZoom());
$('newDraw').onclick=()=>{randomSeed();run();};
$('randomizeRegionSpeeds').onclick=()=>{
  for(const key of Object.keys(REGIONS))levels=setRegionLevel(levels,key,1+Math.floor(Math.random()*5));
  randomSeed();settings();run();
};
let selectedMode=mode();
$('modeControls').onclick=({target})=>{
  if(!target.matches('input[name="mode"]'))return;
  if(target.value===selectedMode&&['region','random','zigzag'].includes(selectedMode)){randomSeed();run();}
  selectedMode=target.value;
};
$('modeControls').onchange=()=>{selectedMode=mode();run();};
$('modeControls').onkeydown=event=>{
  if(![' ','Enter'].includes(event.key)||!event.target.matches('input[name="mode"]:checked')||!['region','random','zigzag'].includes(mode()))return;
  event.preventDefault();
  if(!event.repeat){randomSeed();run();}
};
$('seed').oninput=()=>{clearTimeout(seedTimer);if($('seed').value!==''&&$('seed').validity.valid)seedTimer=setTimeout(run,350);};
$('includeExterior').onchange=run;$('retry').onclick=load;
$('export').onclick=()=>{$('export').disabled=true;$('export').textContent='Preparando CSV…';worker.postMessage({type:'csv'});};
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
settings();updateMode();load();
