// Percentuais sobre o comparecimento conhecido; ausência de total não vira 100% indeterminado.
export function comparisonCounts(row){
 const total=row?.comparecimento_total??row?.comparecimento;
 if(!Number.isSafeInteger(total)||total<=0)return null;
 const counts=['biometria','falha_biometria','sem_biometria'].map(key=>row[key]??0);
 if(counts.some(n=>!Number.isSafeInteger(n)||n<0))throw Error('Contagem de habilitação inválida.');
 const known=counts.reduce((sum,n)=>sum+n,0);
 if(known>total)throw Error('Habilitações excedem o comparecimento.');
 const indeterminate=total-known;
 if(!Number.isSafeInteger(indeterminate)||indeterminate<0||(row.indeterminado!==undefined&&row.indeterminado!==indeterminate))throw Error('Contagem indeterminada divergente.');
 counts.push(indeterminate);
 return counts;
}
export function comparisonShares(row){
 const counts=comparisonCounts(row);if(!counts)return null;
 const total=counts.reduce((a,b)=>a+b,0);
 const shares=counts.map(n=>100*n/total),last=counts.findLastIndex(n=>n>0);
 shares[last]=100-shares.reduce((sum,n,i)=>sum+(i===last?0:n),0);
 return shares;
}
const fmt=new Intl.NumberFormat('pt-BR'),short=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}),pf=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
export function compactCount(value){
 if(value==null)return '—';
 return value>=1e6?short.format(value/1e6)+' mi':value>=1e3?short.format(value/1e3)+' mil':fmt.format(value);
}
export function comparisonTooltip(label,row,markers=[]){
 const counts=comparisonCounts(row),shares=comparisonShares(row),names=['Biometria','Mesário após falha','Sem biometria','Indeterminado'];
 return `<strong>${label}</strong><br>`+names.map((name,i)=>`${markers[i]||''} ${name}: <strong>${shares?pf.format(shares[i])+'%':'—'}</strong> · ${counts?compactCount(counts[i]):'—'} votos`).join('<br>')+(counts?`<br><small>Total: ${compactCount(counts.reduce((a,b)=>a+b,0))} votos<br>Indeterminado = total de votos − (biometria + após falha + sem biometria).</small>`:'');
}
