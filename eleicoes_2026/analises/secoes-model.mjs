export function combineStates(states, selected){
  const allowed=new Set(selected),margins=new Map();
  const result={expected:0,bus:0,eligible:0,noValid:0,lula:0,flavio:0,winners:[0,0,0],percentages:Array(100).fill(0),margins:[]};
  for(const state of states){
    if(!allowed.has(state.uf))continue;
    for(const field of ['expected','bus','eligible','noValid','lula','flavio'])result[field]+=state[field];
    state.winners.forEach((n,i)=>result.winners[i]+=n);
    state.percentages.forEach((n,i)=>result.percentages[i]+=n);
    for(const [difference,count] of state.margins)margins.set(difference,(margins.get(difference)||0)+count);
  }
  result.margins=[...margins].sort((a,b)=>a[0]-b[0]);
  result.net=result.lula-result.flavio;
  return result;
}
export function modes(entries){
  const maximum=entries.reduce((m,[,n])=>Math.max(m,n),0);
  return maximum?entries.filter(([,n])=>n===maximum).map(([value])=>value):[];
}
export function percentageLabel(bin){return `${bin}%–${bin+1}%${bin===99?' (inclui 100%)':''}`;}
