const gcd=(a,b)=>{while(b){const next=a%b;a=b;b=next;}return a;};
// Equal exact biometric-rate fractions enter together. This preserves their inclusive
// boundary without inventing an order between urns with the same rate.
export function accumulateByBiometry(states,{uf='',zone='',direction='ascending',metric='failure'}={}){
 if(!['ascending','descending'].includes(direction))throw Error('Ordem de apuração inválida.');
 if(!['failure','biometry'].includes(metric))throw Error('Tipo de habilitação inválido.');
 const groups=new Map();let totalSections=0,excluded=0;
 for(const state of states){
  if(uf&&state.uf!==uf)continue;
  const [cities,zones,,logs,failures,biometry,lulaVotes,flavioVotes,,indeterminate]=state.columns;
  for(let i=0;i<state.rows;i++){
   if(zone&&`${state.uf}:${zones[i]}`!==zone)continue;
   if(!state.cities[cities[i]]||!logs[i]||(!lulaVotes[i]&&!flavioVotes[i])||failures[i]+biometry[i]+(indeterminate?.[i]??0)>logs[i]){excluded++;continue;}
   const value=metric==='biometry'?biometry[i]:failures[i],divisor=gcd(value,logs[i]),numerator=value/divisor,denominator=logs[i]/divisor,key=`${numerator}/${denominator}`;
   let group=groups.get(key);if(!group){group={numerator,denominator,sections:0,lula:0,flavio:0};groups.set(key,group);}
   group.sections++;group.lula+=lulaVotes[i];group.flavio+=flavioVotes[i];totalSections++;
  }
 }
 const ordered=[...groups.values()].sort((a,b)=>(a.numerator*b.denominator-b.numerator*a.denominator)*(direction==='ascending'?1:-1)),length=ordered.length+1;
 const lula=new Float64Array(length),flavio=new Float64Array(length),sections=new Uint32Array(length),rateNumerators=new Uint32Array(length),rateDenominators=new Uint32Array(length);rateDenominators[0]=1;
 ordered.forEach((g,i)=>{const j=i+1;lula[j]=lula[i]+g.lula;flavio[j]=flavio[i]+g.flavio;sections[j]=sections[i]+g.sections;rateNumerators[j]=g.numerator;rateDenominators[j]=g.denominator;});
 return {lula,flavio,sections,rateNumerators,rateDenominators,totalSections,excluded,direction,metric};
}
export function cumulativePointAtIndex(result,index){
 index=Math.max(0,Math.min(result.sections.length-1,index));
 const lula=result.lula[index],flavio=result.flavio[index],valid=lula+flavio,sections=result.sections[index];
 return {index,progress:result.totalSections?100*sections/result.totalSections:0,rate:index?100*result.rateNumerators[index]/result.rateDenominators[index]:null,rateNumerator:result.rateNumerators[index],rateDenominator:result.rateDenominators[index],direction:result.direction,metric:result.metric,lula,flavio,valid,lulaPercent:valid?100*lula/valid:null,flavioPercent:valid?100*flavio/valid:null,sections,totalSections:result.totalSections};
}
export function cumulativePoint(result,progress){
 if(!Number.isFinite(progress))throw Error('Percentual de apuração inválido.');
 const requestedProgress=Math.max(0,Math.min(100,progress)),target=requestedProgress===100?result.totalSections:requestedProgress*result.totalSections/100;
 let lo=0,hi=result.sections.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(result.sections[mid]<=target)lo=mid+1;else hi=mid;}
 return {...cumulativePointAtIndex(result,Math.max(0,lo-1)),requestedProgress};
}
