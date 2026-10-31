/** Plot only the occupied extent while preserving gaps and original bin IDs. */
export function sectionDistributions(result){
  const counts=new Map(result.margins.filter(([,count])=>count>0));
  const occupied=[...counts.keys()].sort((a,b)=>a-b);
  const differences=occupied.length?Array.from({length:occupied.at(-1)-occupied[0]+1},(_,index)=>occupied[0]+index):[];
  const countValues=differences.map(difference=>counts.get(difference)||0);
  const contributions=differences.map((difference,index)=>difference*countValues[index]);
  const first=result.percentages.findIndex(count=>count>0);
  let last=result.percentages.length-1;
  while(last>=0&&!(result.percentages[last]>0))last--;
  const percentageBins=first<0?[]:Array.from({length:last-first+1},(_,index)=>first+index);
  const percentageValues=percentageBins.map(bin=>result.percentages[bin]);
  const extent=values=>values.reduce((range,value)=>({min:Math.min(range.min,value),max:Math.max(range.max,value)}),{min:0,max:0});
  return {differences,countValues,contributions,percentageBins,percentageValues,
    countDomain:extent(countValues),percentageDomain:extent(percentageValues),contributionDomain:extent(contributions)};
}

export function complementaryPercentageLabel(bin){
  return `${99-bin}%–${100-bin}%${bin===0?' (inclui 100%)':bin===99?' (inclui 0%)':''}`;
}
