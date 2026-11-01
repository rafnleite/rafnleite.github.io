const body=document.getElementById('bio-high-rows'),status=document.getElementById('bio-high-count');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=new Intl.NumberFormat('pt-BR'),percent=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
try {
 const response=await fetch('dados/biometria-acima-50.json');
 if(!response.ok)throw new Error(`HTTP ${response.status}`);
 const rows=await response.json();
 status.textContent=`${number.format(rows.length)} seções`;
 body.innerHTML=rows.map(r=>`<tr><td>${escape(r.uf)}<br>${escape(r.municipio)}</td><td>Z ${r.zona}<br>S ${r.secao}</td><td>${escape(r.local)}</td><td class="num">${number.format(r.comparecimento)}</td><td class="num">${number.format(r.falhas)}</td><td class="num">${percent.format(100*r.falhas/r.comparecimento)}%</td><td class="num vote-lula">${number.format(r.lula)}</td><td class="num vote-flavio">${number.format(r.flavio)}</td></tr>`).join('')||'<tr><td colspan="8">Nenhuma seção encontrada.</td></tr>';
}catch(error){status.textContent='Não foi possível carregar a tabela de seções.';console.error(error);}
