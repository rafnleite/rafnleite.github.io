import {bindCandidateLegend} from './simulacao-legend.mjs?v=legend-highlight-2';
import {createEnsembleRunner} from './simulacao-ensemble-runner.mjs?v=fast-draw-1';
import {createEnsembleChart} from './simulacao-ensemble-chart.mjs?v=legend-highlight-2';
import {decodeEnsemble,regionalSpeedConfig,regionalSpeedKey} from './simulacao-ensemble-model.mjs?v=fast-draw-1';
import {LEVELS,REGIONS} from './simulacao-model.mjs?v=fast-draw-1';
const fmt=new Intl.NumberFormat('pt-BR'),panels=[...document.querySelectorAll('[data-ensemble]')];
for(const panel of panels){
 const regional=panel.dataset.ensemble==='regions',button=panel.querySelector('[data-generate]'),cancel=panel.querySelector('[data-cancel]'),status=panel.querySelector('[role=status]'),progress=panel.querySelector('progress'),plot=panel.querySelector('.ensemble-plot'),alpha=panel.querySelector('[data-opacity]'),notes=panel.querySelector('[data-notes]'),fixedSettings=panel.querySelector('[data-fixed-speeds]');
 const fixedLevels=Object.fromEntries(Object.keys(REGIONS).map(region=>[region,3]));
 let worker,chart,revision=0,appliedKey=null,selectedAxis=regional?'time':'count';
 const config=()=>regionalSpeedConfig({speedMode:panel.querySelector('[name="ensemble-speed-mode"]:checked')?.value||'random',fixedLevels});
 let highlightedCandidate=null;
 bindCandidateLegend(panel.querySelector('.candidate-legend'),candidate=>{highlightedCandidate=candidate;chart?.highlight(candidate);});
 const appearance=()=>chart?.appearance(Number(alpha.value)/1000);alpha.oninput=appearance;
 function updatePending(){
  if(appliedKey===null)return;
  status.textContent=regional&&appliedKey!==regionalSpeedKey(config())?'Configuração alterada. Gere novas 10 mil simulações para aplicar.':'10.000 simulações carregadas';
 }
 if(regional){
  const controls=panel.querySelector('[data-region-speeds]'),choices={};
  for(const region of Object.keys(REGIONS)){
   const row=document.createElement('div');row.className='speed-row';
   const heading=document.createElement('span');heading.textContent=region;
   const group=document.createElement('div');group.className='speed-button-group';group.setAttribute('role','radiogroup');group.setAttribute('aria-label',`10 mil simulações: ${region}`);
   const buttons=[];
   function choose(level){fixedLevels[region]=level;for(const b of buttons){const selected=Number(b.dataset.level)===level;b.setAttribute('aria-checked',String(selected));b.tabIndex=selected?0:-1;}updatePending();}
   for(const [level,{mean,sd}]of Object.entries(LEVELS)){
    const b=document.createElement('button');b.type='button';b.className='speed-level';b.dataset.level=level;b.textContent=level;b.setAttribute('role','radio');b.setAttribute('aria-label',`Nível ${level}: média ${mean} min, desvio padrão ${sd} min`);b.title=`Média ${mean} min · desvio padrão ${sd} min`;b.onclick=()=>choose(Number(level));buttons.push(b);group.append(b);
   }
   group.onkeydown=event=>{
    const current=buttons.indexOf(document.activeElement);if(current<0)return;
    const next=event.key==='Home'?0:event.key==='End'?4:['ArrowRight','ArrowDown'].includes(event.key)?(current+1)%5:['ArrowLeft','ArrowUp'].includes(event.key)?(current+4)%5:null;
    if(next===null)return;event.preventDefault();choose(next+1);buttons[next].focus();
   };
   choices[region]=choose;
   const draw=document.createElement('button');draw.type='button';draw.className='region-speed-draw';draw.setAttribute('aria-label',`Sortear velocidade nas 10 mil: ${region}`);draw.title=`Sortear velocidade: ${region}`;
   draw.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><g fill="currentColor"><circle cx="8" cy="8" r="1.5"/><circle cx="16" cy="8" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="8" cy="16" r="1.5"/><circle cx="16" cy="16" r="1.5"/></g></svg>';
   draw.onclick=()=>choose(1+Math.floor(Math.random()*5));
   choose(3);row.append(heading,group,draw);controls.append(row);
  }
  panel.querySelector('[data-randomize-speeds]').onclick=()=>{for(const choose of Object.values(choices))choose(1+Math.floor(Math.random()*5));};
  for(const radio of panel.querySelectorAll('[name="ensemble-speed-mode"]'))radio.onchange=()=>{fixedSettings.hidden=config().speedMode!=='fixed';updatePending();};
 }
 function setControlsDisabled(value){for(const control of panel.querySelectorAll('[name="ensemble-speed-mode"], [data-region-speeds] button, [data-randomize-speeds]'))control.disabled=value;}
 function stop(){worker?.terminate();worker=null;button.disabled=false;cancel.hidden=true;progress.hidden=true;setControlsDisabled(false);}
 function display(data){
  plot.hidden=false;plot.dataset.elapsedMs=String(data.elapsedMs||'');plot.dataset.workers=String(data.workers||'');chart??=createEnsembleChart(plot,{onAxisChange:value=>{selectedAxis=value;}});chart.setData(data,selectedAxis);chart.highlight(highlightedCandidate);appearance();appliedKey=regionalSpeedKey(data);updatePending();button.textContent='Gerar nova simulação de 10 mil';
  const speeds=data.regional?(data.speedMode==='fixed'?`Velocidades fixas: ${Object.keys(REGIONS).map(r=>`${r} ${data.fixedLevels[r]}`).join(' · ')}. `:'Velocidades sorteadas em cada simulação. '):'';
  notes.textContent=`${speeds}Sorteio ${data.seed} · ${data.includeExterior?'Brasil e exterior':'Brasil, sem exterior'} · ${fmt.format(data.places)} locais e ${fmt.format(data.urns)} urnas por simulação. Resultado final: Lula ${data.finalPercent.toFixed(2).replace('.',',')}% · Flávio ${(100-data.finalPercent).toFixed(2).replace('.',',')}%.`;
 }
 cancel.onclick=()=>{revision++;stop();status.textContent='Cálculo interrompido. Você pode gerar novamente.';};window.addEventListener('pagehide',()=>{if(worker)cancel.click();});
 button.onclick=()=>{
  revision++;stop();const drawRevision=revision,seed=crypto.getRandomValues(new Uint32Array(1))[0],includeExterior=regional?document.getElementById('includeExterior').checked:true,options=config();
  button.disabled=true;cancel.hidden=false;progress.hidden=false;progress.value=0;setControlsDisabled(true);status.textContent='Carregando os locais de votação…';
  worker=createEnsembleRunner();
  worker.onerror=()=>{if(revision!==drawRevision)return;stop();status.textContent='Não foi possível concluir. Tente gerar novamente.';};
  worker.onmessage=({data})=>{
   if(revision!==drawRevision)return;
   if(data.type==='progress'){progress.value=data.done;status.textContent=data.loading?'Carregando os locais de votação…':`${fmt.format(data.done)} de 10.000 simulações calculadas`;}
   else if(data.type==='error'){stop();status.textContent=data.message;}
   else if(data.type==='result'){stop();try{display(data);}catch(error){status.textContent='Falha ao desenhar os gráficos. Tente gerar novamente.';console.error(error);}}
  };
  worker.postMessage({seed,includeExterior,regional,...options});
 };
 const initialRevision=revision;status.textContent='Carregando 10 mil cenários prontos…';
 fetch(`./ensemble-presets/${regional?'regions':'random'}.bin.gz?v=fixed-regions-2`).then(response=>{if(!response.ok)throw Error('Conjunto inicial indisponível');return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}).then(buffer=>{if(revision===initialRevision)display(decodeEnsemble(buffer));}).catch(error=>{if(revision===initialRevision){status.textContent='Não foi possível carregar os cenários iniciais. Use o botão para gerar um novo conjunto.';console.warn(error);}});
}
