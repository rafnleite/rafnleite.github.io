// Positive Gamma conditioned on dispatch occurring by the scenario deadline.
// Level 1 can use the full remaining window; faster levels shrink that window
// in proportion to their base mean, so their tails end earlier.
// Inverse-CDF sampling uses one uniform draw per location, without rejection or
// piling an unbounded Gamma tail into one final event. Tables use 6-second bins.
export const END_TIME=23*3600+55*60;
export const TIMING_MODEL='gamma-speed-tail-user-levels-v3';
const STEP=.1,tables=new Map();
function logGamma(z){
 const p=[676.5203681218851,-1259.1392167224028,771.3234287776531,-176.6150291621406,12.507343278686905,-.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];
 z--;let x=.9999999999998099;for(let i=0;i<p.length;i++)x+=p[i]/(z+i+1);const t=z+p.length-.5;return .9189385332046727+(z+.5)*Math.log(t)-t+Math.log(x);
}
function gammaP(a,x){
 if(x<=0)return 0;
 let term=1/a,sum=term;for(let n=1;n<1000;n++){term*=x/(a+n);sum+=term;if(term<sum*1e-14)break;}
 return Math.min(1,sum*Math.exp(a*Math.log(x)-x-logGamma(a)));
}
function tableFor(level,spec){
 if(tables.has(level))return tables.get(level);
 const shape=(spec.mean/spec.sd)**2,scale=spec.sd**2/spec.mean,size=Math.ceil((spec.mean+20*spec.sd)/STEP)+1,cdf=new Float64Array(size);
 for(let i=1;i<size;i++)cdf[i]=Math.max(cdf[i-1],gammaP(shape,i*STEP/scale));
 cdf[size-1]=1;
 // Coarse inverse brackets avoid a full table binary search in every one of
 // the billion location draws used by a 10,000-scenario regional ensemble.
 const brackets=new Uint32Array(65537);let i=0;
 for(let j=0;j<brackets.length;j++){while(i+1<size&&cdf[i+1]<=j/65536)i++;brackets[j]=i;}
 const table={cdf,brackets};tables.set(level,table);return table;
}
export function boundedGammaMinutes(level,spec,closing,random,speedRatio=1){
 const available=(END_TIME-closing)/60*speedRatio;if(!(available>0))throw Error('O encerramento deve anteceder o limite da simulação.');
 const {cdf,brackets}=tableFor(level,spec),position=Math.min(available/STEP,cdf.length-1),i=Math.floor(position),upper=i===cdf.length-1?1:cdf[i]+(position-i)*(cdf[i+1]-cdf[i]);
 return inverseGamma(cdf,brackets,upper,available,random);
}
function inverseGamma(cdf,brackets,upper,available,random){
 const p=Math.min(1-Number.EPSILON,Math.max(0,random()))*upper,bucket=Math.min(65535,Math.floor(p*65536));
 let lo=brackets[bucket],hi=Math.min(cdf.length-1,brackets[bucket+1]+1);
 while(hi-lo>1){const mid=(lo+hi)>>>1;if(cdf[mid]<=p)lo=mid;else hi=mid;}
 const minutes=(lo+(cdf[hi]>cdf[lo]?(p-cdf[lo])/(cdf[hi]-cdf[lo]):0))*STEP;
 return Math.max(0,Math.min(available,minutes));
}

// Closing times and the five speed distributions stay fixed across all runs.
// Compute each location's truncation once instead of a billion repeated lookups.
export function createBoundedGammaSampler(specs,closings,fallback,usedLevels=Object.keys(specs)){
 const prepared=[];
 for(const level of new Set(usedLevels)){
  const spec=specs[level],table=tableFor(level,spec),upper=new Float64Array(closings.length),available=new Float64Array(closings.length),ratio=spec.mean/specs[1].mean;
  for(let i=0;i<closings.length;i++){
   const a=(END_TIME-closings[i])/60*ratio;available[i]=a;if(!(a>0))continue;
   const position=Math.min(a/STEP,table.cdf.length-1),j=Math.floor(position);
   upper[i]=j===table.cdf.length-1?1:table.cdf[j]+(position-j)*(table.cdf[j+1]-table.cdf[j]);
  }
  prepared[level]={...table,upper,available};
 }
 return (level,i,random)=>{const p=prepared[level],available=p.available[i];return available>0?inverseGamma(p.cdf,p.brackets,p.upper[i],available,random):fallback(level,random);};
}
