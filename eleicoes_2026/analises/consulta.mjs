const $=id=>document.getElementById(id),fmt=new Intl.NumberFormat('pt-BR');
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const queries={
resultados:`SELECT uf, SUM(lula) AS lula, SUM(flavio) AS flavio,\n       ROUND(100.0*SUM(lula)/NULLIF(SUM(lula+flavio),0),2) AS lula_pct_dupla\nFROM v_resultados_locais\nWHERE turno=2\nGROUP BY uf ORDER BY SUM(lula+flavio) DESC;`,
locais:`SELECT uf, municipio, zona, numero, nome, lula, flavio,\n       ROUND(lula_pct_dupla,2) AS lula_pct,\n       ROUND(flavio_pct_dupla,2) AS flavio_pct, vencedor, bus, secoes\nFROM v_resultados_locais\nWHERE turno=2 ORDER BY total DESC;`,
apos17:`SELECT s.uf, SUM(r.confirmacoes) AS confirmacoes,\n       SUM(r.apos17_brasil) AS votos_apos17,\n       SUM(r.apos19_brasil) AS votos_apos19\nFROM resumo_logs r JOIN secoes s ON s.id=r.secao_id\nWHERE s.uf<>'ZZ' GROUP BY s.uf ORDER BY votos_apos17 DESC;`,
biometria:`SELECT s.uf, SUM(r.biometria) AS biometria,\n       SUM(r.sem_biometria) AS sem_biometria,\n       SUM(r.falha_biometria) AS falha_biometria,\n       SUM(r.indeterminados) AS indeterminados\nFROM resumo_logs r JOIN secoes s ON s.id=r.secao_id\nGROUP BY s.uf ORDER BY s.uf;`,
comparacao:`SELECT * FROM v_comparacao_turnos\nWHERE uf='RR' AND mesma_composicao_agregadas=1\nORDER BY municipio,zona,secao;`,
auditoria:`SELECT s.uf,s.municipio,s.zona,s.secao,\n       a.resultado,a.escopo,a.votos_antes,a.votos_depois,\n       a.votos_acrescentados,a.diferenca_bu,a.motivo\nFROM auditoria a JOIN secoes s ON s.id=a.secao_id\nORDER BY s.uf,s.municipio,s.zona,s.secao;`,
votos:`SELECT uf,municipio,zona,secao,ordem,forma_liberacao,\n       presidente_local_seg,presidente_brasilia_seg,local_nome\nFROM v_votos_cruzados\nWHERE uf='RR' AND zona=1 AND secao=1\nORDER BY ordem;`,
indices:`SELECT name,tbl_name,sql FROM sqlite_schema\nWHERE type='index' AND sql IS NOT NULL ORDER BY tbl_name,name;`};
let mode=null,catalog=null,result=null,worker=null,pending=null,queryId=null,cancelTimer=null;
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function setBusy(value){$('run').disabled=value;$('cancel').disabled=!value;$('chooseFile').disabled=value;$('resume').disabled=value;}
function activate(data,newMode){
  mode=newMode;catalog=data;$('fileHelp').hidden=true;$('workbench').hidden=false;$('metrics').hidden=false;$('importProgress').hidden=true;
  const m=data.metadata?.consolidacao||{};
  for(const [id,key] of [['metricSections','secoes'],['metricBus','boletins'],['metricVotes','confirmacoes'],['metricPlaces','locais']])$(id).textContent=m[key]===undefined?'—':fmt.format(m[key]);
  $('sourceTitle').textContent=newMode==='server'?'Base SQLite conectada':'Arquivo aberto no navegador';
  $('sourceDetail').textContent=`${data.filename||'eleicoes_2026.sqlite3'}${m.gerado_utc?' · atualizado em '+new Date(m.gerado_utc).toLocaleString('pt-BR'):''}`;
  $('downloadDb').hidden=newMode!=='server';renderTables();status('Base conectada. Escolha uma consulta pronta ou escreva seu SQL.');setBusy(false);
}
function renderTables(){
  const search=$('tableSearch').value.toLowerCase();$('tableList').replaceChildren();
  for(const table of catalog?.objects||[]){if(!table.name.toLowerCase().includes(search))continue;const button=document.createElement('button');button.type='button';button.className='table-button';button.innerHTML=`${escape(table.name)}<span>${table.type==='view'?'VIEW':'TABELA'}</span>`;button.onclick=()=>{document.querySelectorAll('.table-button.active').forEach(x=>x.classList.remove('active'));button.classList.add('active');$('sql').value=`SELECT * FROM "${table.name.replaceAll('"','""')}" LIMIT ${$('limit').value};`;$('schemaTitle').textContent=table.name;$('tableDescription').textContent=table.description||'';$('schemaSql').textContent=table.sql||'';$('columns').innerHTML=(table.foreignKeys||[]).map(f=>`<span class="column-pill">${escape(f.from)} → ${escape(f.table)}.${escape(f.to)}</span>`).join('')+(table.columns||[]).map(c=>`<span class="column-pill">${escape(c.name)} · ${escape(c.type)}${c.primaryKey?' · PK':''}</span>`).join('');};$('tableList').append(button);}
}
function ensureWorker(){
  if(worker)return worker;
  worker=new Worker('./consulta-worker.mjs',{type:'module'});
  worker.onmessage=({data})=>{
    if(!pending||data.id!==pending.id)return;
    if(data.type==='progress'){$('importProgress').hidden=false;$('progress').value=100*data.loaded/data.total;$('progressLabel').textContent=`${(data.loaded/1024**3).toFixed(2)} / ${(data.total/1024**3).toFixed(2)} GB · ${Math.floor(100*data.loaded/data.total)}%`;return;}
    clearTimeout(cancelTimer);const job=pending;pending=null;
    if(data.type==='error')job.reject(new Error(data.error));else job.resolve(data.type==='ready'?data.schema:data.result);
  };
  worker.onerror=event=>{if(pending){pending.reject(new Error(event.message||'Não foi possível iniciar o SQLite no navegador.'));pending=null;}stopWorker();};
  return worker;
}
function stopWorker(){worker?.terminate();worker=null;clearTimeout(cancelTimer);}
function workerRequest(type,args={}){
  return new Promise((resolve,reject)=>{if(pending){reject(new Error('Aguarde a operação atual.'));return;}const id=crypto.randomUUID();pending={id,resolve,reject};ensureWorker().postMessage({id,type,...args});if(type==='query')cancelTimer=setTimeout(()=>{stopWorker();const job=pending;pending=null;mode=null;$('workbench').hidden=true;job?.reject(new Error('Consulta interrompida após 20 segundos. Retome o arquivo e refine os filtros.'));},20000);});
}
async function execute(){
  if(!mode)return;setBusy(true);status('Executando consulta somente leitura…');queryId=crypto.randomUUID();
  try{
    const sql=$('sql').value,limit=Number($('limit').value);
    if(mode==='server'){
      const response=await fetch('./api/database/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:queryId,sql,limit})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Falha na consulta.');result=data;
    }else result=await workerRequest('query',{sql,limit});
    renderResult();status(result.truncated?'Consulta concluída. Existem mais linhas; refine a consulta ou altere o limite.':'Consulta concluída.');
  }catch(error){status(error.message,true);}finally{setBusy(false);queryId=null;}
}
function renderResult(){
  $('resultTable').querySelector('thead').innerHTML='<tr>'+result.columns.map(c=>`<th>${escape(c)}</th>`).join('')+'</tr>';
  $('resultTable').querySelector('tbody').innerHTML=result.rows.map(row=>'<tr>'+row.map(v=>`<td${v===null?' class="null"':''} title="${escape(v===null?'NULL':v)}">${escape(v===null?'NULL':v)}</td>`).join('')+'</tr>').join('');
  $('queryInfo').textContent=`${fmt.format(result.rows.length)} linhas${result.truncated?' (limitado)':''} · ${(result.seconds||0).toFixed(3)} s`;$('exportRows').disabled=!result.rows.length;
}
async function openFile(file){
  if(!file)return;setBusy(true);status('Abrindo o arquivo no navegador…');
  try{
    if(!navigator.storage?.getDirectory)throw new Error('Este navegador não oferece o armazenamento necessário. Use Chrome/Edge atual ou a página de consulta local.');
    const estimate=await navigator.storage.estimate();if(estimate.quota&&file.size>estimate.quota-(estimate.usage||0))throw new Error('O espaço reservado ao navegador é insuficiente. Use a consulta local, que lê diretamente o arquivo.');
    activate(await workerRequest('open',{file}),'browser');
  }catch(error){status(error.message,true);$('importProgress').hidden=true;setBusy(false);}
}
$('sql').value=queries.resultados;$('examples').onchange=()=>{$('sql').value=queries[$('examples').value];};$('tableSearch').oninput=renderTables;$('run').onclick=execute;
$('sql').onkeydown=event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();execute();}};
$('chooseFile').onclick=()=>$('databaseFile').click();$('databaseFile').onchange=event=>openFile(event.target.files[0]);
$('resume').onclick=async()=>{setBusy(true);try{activate(await workerRequest('resume'),'browser');}catch(error){status(error.message,true);setBusy(false);}};
$('cancel').onclick=()=>{if(mode==='server'&&queryId)fetch('./api/database/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:queryId})}).catch(()=>{});else{stopWorker();const job=pending;pending=null;mode=null;$('workbench').hidden=true;job?.reject(new Error('Consulta cancelada. Use “Retomar arquivo” para continuar.'));}};
$('exportRows').onclick=()=>{if(!result)return;const cell=value=>{let text=String(value??'');if(typeof value==='string'&&/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};const text='\uFEFF'+[result.columns,...result.rows].map(row=>row.map(cell).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='consulta-eleitoral.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
try{
  const response=await fetch('./api/database/schema',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Base local ainda não disponível.');activate(data,'server');
}catch(error){$('sourceTitle').textContent='Escolha a base SQLite';$('sourceDetail').textContent='Abra o arquivo consolidado ou retome uma cópia já importada neste navegador.';$('fileHelp').hidden=false;status('Nenhum arquivo aberto.');}
