const single=document.getElementById('sim-single');
const ensemble=document.getElementById('sim-ensemble');
let ensembleLoaded;
for(const control of document.querySelectorAll('input[name="simulation-view"]')){
 control.addEventListener('change',()=>{
  const showEnsemble=control.value==='ensemble';
  single.hidden=showEnsemble;
  ensemble.hidden=!showEnsemble;
  if(showEnsemble&&!ensembleLoaded){
   ensembleLoaded=import('../analises/simulacao-ensemble.mjs?v=saldo-exterior-2').catch(error=>{
    ensembleLoaded=null;
    for(const status of ensemble.querySelectorAll('[role="status"]'))status.textContent='Não foi possível carregar as simulações. Atualize a página para tentar novamente.';
    console.error(error);
   });
  }
 });
}

for(const control of document.querySelectorAll('input[name="ensemble-mode"]')){
 control.addEventListener('change',()=>{
  for(const panel of ensemble.querySelectorAll('[data-ensemble]'))panel.hidden=panel.dataset.ensemble!==control.value;
 });
}
