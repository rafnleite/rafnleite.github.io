import {electionSummary} from './election-results.mjs';
const labels=['Biometria','Sem biometria','Falha na biometria','Indeterminado / motivo não definido'];
const palette=['#247967','#d5ac48','#c05b45','#879197'];
const fmt=new Intl.NumberFormat('pt-BR'),pf=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function proportions(counts){const total=counts.reduce((a,b)=>a+b,0);return counts.map(n=>total?100*n/total:0);}
export function electionHTML(election,scope='DO LOCAL',paired=false,logs){
 const result=electionSummary(election);
 if(!result.available)return `<div class="place-election"><small>Resultado ${esc(scope.toLocaleLowerCase('pt-BR'))} ainda sem BU disponível.</small></div>`;
 const lulaPercent=result.valid?pf.format(result.lulaPercent)+'%':'—',flavioPercent=result.valid?pf.format(result.flavioPercent)+'%':'—';
 return `<div class="place-election"><small>RESULTADO ${result.partial?'PARCIAL ':''}${esc(scope)} · PRESIDÊNCIA · 2º TURNO</small><div class="election-candidates"><span class="lula"><b>Lula</b><br>${fmt.format(result.lula)} votos · ${lulaPercent}</span><span class="flavio"><b>Flávio</b><br>${fmt.format(result.flavio)} votos · ${flavioPercent}</span></div>${result.valid?`<div class="election-bar" role="img" aria-label="Lula: ${fmt.format(result.lula)} votos, ${lulaPercent}; Flávio: ${fmt.format(result.flavio)} votos, ${flavioPercent}"><span class="lula" style="width:${result.lulaPercent}%"></span><span class="flavio" style="width:${result.flavioPercent}%"></span></div>`:'<small>Sem votos válidos entre Lula e Flávio.</small>'}<small>${logs===undefined?'':fmt.format(logs)+' votos presidenciais nos logs<br>'}Percentuais sobre votos válidos. Todas as formas de habilitação.<br>${paired?'BUs das mesmas urnas com logs:':'BUs disponíveis:'} ${fmt.format(result.bus)} / ${fmt.format(result.sections)} seções.</small></div>`;
}
export function biometryDetailHTML({title,subtitle='',address='',counts,covered,expected,election,scope='DO LOCAL',paired=false}){
 const ratios=proportions(counts),total=counts.reduce((a,b)=>a+b,0);
 return `<div class="bio-map-detail"><strong>${esc(title)}</strong>${subtitle?`<div>${esc(subtitle)}</div>`:''}${address?`<small>${esc(address)}</small>`:''}<h4>Tipos de habilitação</h4><div class="bio-distribution" role="img" aria-label="${esc(labels.map((label,i)=>`${label}: ${pf.format(ratios[i])}%`).join('; '))}">${ratios.map((p,i)=>`<span style="width:${p}%;background:${palette[i]}"></span>`).join('')}</div><div class="bio-distribution-labels">${labels.map((label,i)=>`<div><span><i style="background:${palette[i]}"></i>${label}</span><b>${pf.format(ratios[i])}%</b><small>${fmt.format(counts[i])}</small></div>`).join('')}</div>${electionHTML(election,scope,paired,total)}${!electionSummary(election).available?`<small>${fmt.format(total)} votos presidenciais nos logs<br>${fmt.format(covered)} / ${fmt.format(expected)} seções com logs</small>`:''}</div>`;
}
export function scatterDetailHTML(point,level){
 const indeterminate=point.indeterminate??0;
 return biometryDetailHTML({title:point.name,subtitle:point.subtitle,counts:[point.biometry,point.logs-point.biometry-point.failures-indeterminate,point.failures,indeterminate],covered:point.sections,expected:point.sections,election:{lula:point.lula,flavio:point.flavio,bus:point.sections,sections:point.sections},scope:{section:'DA URNA',place:'DO LOCAL',zone:'DA ZONA',city:'DA CIDADE',state:'DO ESTADO'}[level],paired:true});
}
