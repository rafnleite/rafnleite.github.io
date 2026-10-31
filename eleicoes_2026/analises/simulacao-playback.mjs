import {countAtTime} from './simulacao-model.mjs?v=zigzag-flow-1';

export const PLAYBACK_RATES={time:[60,300,900],count:[0.2,1,3]};

export function playbackBounds(result,axis){
  return axis==='time'?{min:result.start,max:result.end}:{min:result.n?100*result.initialCount/result.n:0,max:100};
}

export function playbackPoint(result,axis,position){
  const {min,max}=playbackBounds(result,axis),value=Math.max(min,Math.min(max,position));
  if(axis==='time')return {count:countAtTime(result.times,value),time:value,value};
  // Complete whole locations only. Identical timestamps do not merge distinct
  // locations when the playback advances by urn count instead of elapsed time.
  const target=result.n*value/100;
  let lo=0,hi=result.groupEnds.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(result.groupEnds[mid]<=target+1e-7)lo=mid+1;else hi=mid;}
  const count=Math.max(result.initialCount,lo?result.groupEnds[lo-1]:0);
  return {count,time:count<=result.initialCount?result.start:Math.max(result.start,result.times[count-1]),value:result.n?100*count/result.n:0};
}
