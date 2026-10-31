export const ELECTION_COLORS=Object.freeze({lula:'#d73027',flavio:'#2166ac',tie:'#e7e3e7',missing:'#a0a7a9',lulaDark:'#67000d',flavioDark:'#053061'});
export const ELECTION_SCALE=Object.freeze([ELECTION_COLORS.flavioDark,ELECTION_COLORS.flavio,ELECTION_COLORS.tie,ELECTION_COLORS.lula,ELECTION_COLORS.lulaDark]);

// ECharts spaces the five colors uniformly. Map the actual Lula shares
// 0%, 30%, 50%, 70%, 100% to those stops, preserving the full vote gradient.
function positionForLulaPercent(percent){
  if(percent<=30)return percent/120;
  if(percent<=50)return .25+(percent-30)/80;
  if(percent<=70)return .5+(percent-50)/80;
  return .75+(percent-70)/120;
}
export function electionSummary(value){
  if(!value||!Number.isInteger(value.bus)||value.bus<1)return {available:false,color:ELECTION_COLORS.missing,colorPosition:null};
  const lula=Number(value.lula),flavio=Number(value.flavio);
  if(!Number.isSafeInteger(lula)||!Number.isSafeInteger(flavio)||lula<0||flavio<0)throw new Error('Resultado eleitoral inválido.');
  const valid=lula+flavio,winner=lula>flavio?'lula':flavio>lula?'flavio':'tie';
  const lulaPercent=valid?100*lula/valid:0;
  return {available:true,lula,flavio,valid,lulaPercent,flavioPercent:valid?100*flavio/valid:0,winner,color:ELECTION_COLORS[winner],colorPosition:valid?positionForLulaPercent(lulaPercent):null,bus:value.bus,sections:value.sections,partial:value.bus<value.sections};
}
