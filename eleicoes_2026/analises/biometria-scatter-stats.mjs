export const MIN_POINT_DIAMETER=4,MAX_POINT_DIAMETER=10;
export function pointDiameter(votes,min,max){
 if(max<=min)return MIN_POINT_DIAMETER;
 const t=Math.max(0,Math.min(1,(Math.sqrt(votes)-Math.sqrt(min))/(Math.sqrt(max)-Math.sqrt(min))));
 return MIN_POINT_DIAMETER+(MAX_POINT_DIAMETER-MIN_POINT_DIAMETER)*t;
}
