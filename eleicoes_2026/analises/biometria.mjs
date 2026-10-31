import {createBiometryScatter} from './biometria-scatter.mjs?v=cumulative-1';
import {createBiometryCumulative} from './biometria-cumulative.mjs?v=6';
import {addStateBoundaries} from './map-boundaries.mjs';
import {createBiometryMap} from './biometria-map.mjs?v=tooltip-2';
import {createBiometryHistogram} from './biometria-histogram.mjs?v=legenda-limpa-3';
const $=id=>document.getElementById(id),fmt=new Intl.NumberFormat('pt-BR'),pf=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const labels=['Biometria','Sem biometria','Falha na biometria','Indeterminado nos logs'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const percent=(a,b)=>b?pf.format(a*100/b)+'%':'—';
const bioHistogram=createBiometryHistogram({element:$('bioHistogram'),interval:$('bioBinWidth'),status:$('bioHistogramStatus'),table:$('bioHistogramBins'),scope:$('bioHistogramScope'),meanLegend:$('bioMeanLegend'),medianLegend:$('bioMedianLegend')});
const bioWorker=new Worker(new URL('./biometria-scatter-worker.mjs?v=cumulative-5',import.meta.url),{type:'module'});
const bioScatter=createBiometryScatter({element:$('bioScatter'),status:$('bioScatterStatus'),level:$('bioScatterLevel'),metric:$('bioScatterMetric'),uf:$('uf'),zone:$('zone'),worker:bioWorker});
const bioCumulative=createBiometryCumulative({element:$('bioCumulative'),status:$('bioCumulativeStatus'),uf:$('uf'),zone:$('zone'),limit:$('bioCumulativeLimit'),consult:$('bioCumulativeConsult'),order:$('bioCumulativeOrder'),metricSelect:$('bioCumulativeMetric'),rateLabel:$('bioCumulativeRateLabel'),metricLegend:$('bioCumulativeMetricLegend'),worker:bioWorker});
let histogramScope=null;
let bioMap,data,map,layer,cache=new Map(),rows=[],page=0,request=0;
const selectedZones=()=>data.zones.filter(z=>(!$('uf').value||z.uf===$('uf').value)&&(!$('zone').value||`${z.uf}:${z.zone}`===$('zone').value));
async function json(path){const r=await fetch(path);if(!r.ok)throw Error(`Falha ao carregar ${path} (${r.status})`);return r.json();}
function zoneOptions(){const uf=$('uf').value;$('zone').replaceChildren(new Option('Todas as zonas',''),...data.zones.filter(z=>!uf||z.uf===uf).sort((a,b)=>a.uf.localeCompare(b.uf)||a.zone-b.zone).map(z=>new Option(`${z.uf} · Zona ${z.zone}`,`${z.uf}:${z.zone}`)));}
function choose(z){$('uf').value=z.uf;zoneOptions();$('zone').value=`${z.uf}:${z.zone}`;render(true);}
function render(fit=false){
 const zones=selectedZones(),counts=[0,0,0,0];zones.forEach(z=>z.counts.forEach((n,i)=>counts[i]+=n));const total=counts.reduce((a,b)=>a+b,0),covered=zones.reduce((a,z)=>a+z.covered,0),expected=zones.reduce((a,z)=>a+z.expected,0);
 $('stats').innerHTML=counts.map((n,i)=>`<article>${labels[i]}<strong>${percent(n,total)}</strong><span>${fmt.format(n)} votos</span></article>`).join('');
 $('status').textContent=`${fmt.format(total)} confirmações nos logs · ${fmt.format(covered)} de ${fmt.format(expected)} seções · cobertura de ${percent(covered,expected)}`;
 const method=Number($('method').value);
 if(fit){const bounds=zones.filter(z=>Number.isFinite(z.lat)&&Number.isFinite(z.lon)).map(z=>[z.lat,z.lon]);if(bounds.length)map.fitBounds(bounds,{padding:[24,24],maxZoom:10});}
 bioMap.render();
 if(fit){bioScatter.render();bioCumulative.render();}
 $('zones').innerHTML=[...zones].sort((a,b)=>{const ta=a.counts.reduce((s,n)=>s+n,0),tb=b.counts.reduce((s,n)=>s+n,0);return (tb?b.counts[method]/tb:-1)-(ta?a.counts[method]/ta:-1);}).map(z=>{const n=z.counts.reduce((a,b)=>a+b,0);return `<tr><td><button data-key="${z.uf}:${z.zone}">${z.uf} / ${z.zone}</button></td><td>${fmt.format(n)}</td>${z.counts.map(c=>`<td>${percent(c,n)}</td>`).join('')}<td>${z.covered} / ${z.expected}</td></tr>`;}).join('');
 $('zones').querySelectorAll('button').forEach(b=>b.onclick=()=>choose(data.zones.find(z=>`${z.uf}:${z.zone}`===b.dataset.key)));loadRanking();
}
async function loadRanking(){const id=++request,scopeKey=[$('uf').value,$('zone').value].join('|'),scopeChanged=histogramScope!==scopeKey;if(scopeChanged){histogramScope=null;bioHistogram.loading();}$('rankStatus').textContent='Carregando urnas do recorte…';$('csv').disabled=true;$('ranking').replaceChildren();$('prev').disabled=$('next').disabled=true;
 try{const states=$('uf').value?[$('uf').value]:data.states;await Promise.all(states.map(async uf=>{if(!cache.has(uf))cache.set(uf,await json(`./biometria/${uf}.json`));}));if(id!==request)return;
 const zone=$('zone').value,search=$('search').value.trim().toLocaleLowerCase('pt-BR'),scopedRows=states.flatMap(uf=>cache.get(uf).map(r=>[uf,...r])).filter(r=>!zone||`${r[0]}:${r[3]}`===zone);
 if(scopeChanged){const scopeLabel=[$('uf').selectedOptions[0].textContent,$('zone').selectedOptions[0].textContent].join(' · ');bioHistogram.setRows(scopedRows,scopeLabel);histogramScope=scopeKey;}
 rows=scopedRows.filter(r=>!search||[r[1],r[3],r[4],r[9]].join(' ').toLocaleLowerCase('pt-BR').includes(search));
 rows.sort((a,b)=>($('sort').value==='rate'?b[7]/b[6]-a[7]/a[6]:b[7]-a[7])||b[7]-a[7]||a[0].localeCompare(b[0])||a[2]-b[2]||a[3]-b[3]||a[4]-b[4]);page=0;showPage();$('csv').disabled=!rows.length;
 }catch(e){if(id===request){if(scopeChanged){histogramScope=null;bioHistogram.error(e.message+' Recarregue a página para tentar novamente.');}rows=[];$('rankStatus').textContent=e.message+' Recarregue a página para tentar novamente.';$('page').textContent='';}}
}
function showPage(){const pages=Math.max(1,Math.ceil(rows.length/50));$('rankStatus').textContent=`${fmt.format(rows.length)} seções · ${fmt.format(rows.filter(r=>r[7]>0).length)} com votos após falha biométrica`;
 $('ranking').innerHTML=rows.slice(page*50,(page+1)*50).map((r,i)=>`<tr><td>${page*50+i+1}</td><td>${esc(r[0])}</td><td>${esc(r[1])}<small>${esc(r[9])}</small></td><td>${r[3]}</td><td>${r[4]}</td><td class="bio-flavio">${r[10]==null?'—':fmt.format(r[10])}</td><td class="bio-lula">${r[11]==null?'—':fmt.format(r[11])}</td><td>${fmt.format(r[5])}</td><td>${fmt.format(r[6])}</td><td><b>${fmt.format(r[7])}</b></td><td>${percent(r[7],r[6])}</td><td>${r[8]===null?'—':fmt.format(r[8])}</td></tr>`).join('')||'<tr><td colspan="12">Nenhuma urna corresponde aos filtros.</td></tr>';
 $('page').textContent=`Página ${page+1} de ${pages}`;$('prev').disabled=page===0;$('next').disabled=page+1>=pages;}
 $('uf').onchange=()=>{zoneOptions();render(true);};$('zone').onchange=()=>render(true);$('method').onchange=()=>render();$('sort').onchange=loadRanking;let timer;$('search').oninput=()=>{clearTimeout(timer);timer=setTimeout(loadRanking,250);};$('prev').onclick=()=>{page--;showPage();};$('next').onclick=()=>{page++;showPage();};
 $('csv').onclick=()=>{const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const body=[['UF','Município','Código município','Zona','Seção','Aptos','Votos logs','Falhas','Votos BU','Local','Flávio (votos BU)','Lula (votos BU)','% falhas'],...rows.map(r=>[...r,100*r[7]/r[6]])].map(r=>r.map(cell).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+body],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='ranking-falhas-biometria.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
try{data=await json('./biometria/manifest.json?v=result-1');$('uf').append(...data.states.map(uf=>new Option(uf==='ZZ'?'ZZ · Exterior':uf,uf)));zoneOptions();$('date').textContent=`Gerado em ${new Date(data.generatedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} (Brasília). Consolidação: ${data.sourceSnapshot?new Date(data.sourceSnapshot).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'data não informada'}.`;
map=L.map('map',{preferCanvas:true}).setView([-14,-52],4);layer=L.layerGroup().addTo(map);addStateBoundaries(map);bioMap=createBiometryMap({map,layer,data,selectedZones,method:()=>Number($('method').value),choose,json});new ResizeObserver(()=>map.invalidateSize({pan:false})).observe($('map'));render(true);}
catch(e){bioHistogram.error('Não foi possível carregar as urnas: '+e.message);$('status').textContent='Não foi possível carregar a página: '+e.message;}
