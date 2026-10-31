const positiveCount=bin=>Number.isFinite(bin?.count)&&bin.count>0?bin.count:0;

/** Return a separate presentation array; aggregation results and bins stay intact. */
export function binsForVotingChart(bins,{preserveRange=false}={}){
  if(!Array.isArray(bins))return [];
  if(preserveRange)return bins.slice();
  let first=0,last=bins.length-1;
  while(first<=last&&!positiveCount(bins[first]))first++;
  while(last>=first&&!positiveCount(bins[last]))last--;
  return bins.slice(first,last+1);
}

/**
 * Maximum stacked total in an ECharts category-axis percentage window.
 * AxisProxy maps percentages to [0,n-1], then OrdinalScale.parse rounds both
 * endpoints. Both categories are included. The empty/zero-only fallback is 1.
 * Sources (ECharts 5.6.0): src/component/dataZoom/AxisProxy.ts and
 * src/scale/Ordinal.ts in https://github.com/apache/echarts/tree/5.6.0 .
 */
export function visibleVotingMaximum(bins,zoom={}){
  if(!Array.isArray(bins)||!bins.length)return 1;
  const percent=(value,fallback)=>Number.isFinite(value)?Math.max(0,Math.min(100,value)):fallback;
  let start=percent(zoom?.start,0),end=percent(zoom?.end,100);
  if(start>end)[start,end]=[end,start];
  const first=Math.round(start/100*(bins.length-1)),last=Math.round(end/100*(bins.length-1));
  let maximum=0;
  for(let index=first;index<=last;index++)maximum=Math.max(maximum,positiveCount(bins[index]));
  return maximum||1;
}
