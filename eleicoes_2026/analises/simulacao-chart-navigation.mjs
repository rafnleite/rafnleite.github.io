import {zoomYRange,shiftYRange} from './chart-y-zoom.mjs?v=calibrated-2';
const percentLabel=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2,useGrouping:false});
export const formatSimulationPercent=value=>`${percentLabel.format(value)}%`;
export function fitSeriesY(series,bounds=[0,100],axisIndex=0){
 let lo=Infinity,hi=-Infinity;
 for(const line of series||[]){
  if((line.yAxisIndex||0)!==axisIndex)continue;
  for(const item of line.data||[]){
   const value=Array.isArray(item)?item[1]:typeof item==='number'?item:Array.isArray(item?.value)?item.value[1]:item?.value;
   if(!Number.isFinite(value))continue;lo=Math.min(lo,value);hi=Math.max(hi,value);
  }
 }
 if(!Number.isFinite(lo))return [...bounds];
 const margin=Math.max((hi-lo)*.04,(bounds[1]-bounds[0])*.01);
 return [Math.max(bounds[0],lo-margin),Math.min(bounds[1],hi+margin)];
}
// The plot and left labels move the candidate axis; right labels move only
// completion percentages. The horizontal domain always remains fixed.
export function attachSimulationNavigation(chart){
 const node=chart.getDom();node.dataset.simulationNavigation='true';let drag;
 const bounds=axis=>axis? [0,100]:JSON.parse(node.dataset.yBounds||'[0,100]');
 const range=axis=>chart.getModel().getComponent('yAxis',axis).axis.scale.getExtent();
 const field=(base,axis)=>axis?base+axis:base;
 const apply=(value,axis=0)=>{
  node.dataset[field('yRange',axis)]=JSON.stringify(value);
  chart.setOption({yAxis:chart.getOption().yAxis.map((_,i)=>i===axis?{min:value[0],max:value[1]}:{})});
 };
 const point=event=>{
  const box=node.getBoundingClientRect(),grid=chart.getModel().getComponent('grid',0)?.coordinateSystem?.getRect();
  if(!grid)return null;const x=(event.clientX-box.left)*chart.getWidth()/box.width,y=(event.clientY-box.top)*chart.getHeight()/box.height;
  const vertical=y>=grid.y&&y<=grid.y+grid.height,onLeft=vertical&&x>=Math.max(0,grid.x-72)&&x<grid.x,onRight=vertical&&x>grid.x+grid.width&&chart.getOption().yAxis.length>1;
  return {grid,x,y,axis:onRight?1:0,scale:chart.getHeight()/box.height,inside:vertical&&x>=grid.x&&x<=grid.x+grid.width,onY:onLeft||onRight};
 };
 node.addEventListener('wheel',event=>{const p=point(event);if(!p||!event.deltaY||!p.inside&&!p.onY)return;event.preventDefault();event.stopImmediatePropagation();const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?chart.getHeight():1);node.dataset[field('yFit',p.axis)]='manual';apply(zoomYRange(range(p.axis),delta,1-(p.y-p.grid.y)/p.grid.height,bounds(p.axis)),p.axis);},{passive:false,capture:true});
 node.addEventListener('pointerdown',event=>{const p=point(event);if(!p||!p.inside&&!p.onY||event.button!==0)return;event.preventDefault();drag={id:event.pointerId,y:event.clientY,axis:p.axis,range:[...range(p.axis)],height:p.grid.height/p.scale};node.setPointerCapture(event.pointerId);node.style.cursor='grabbing';},{capture:true});
 node.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();node.dataset[field('yFit',drag.axis)]='manual';apply(shiftYRange(drag.range,(event.clientY-drag.y)/drag.height*(drag.range[1]-drag.range[0]),bounds(drag.axis)),drag.axis);},{capture:true});
 const stop=()=>{drag=null;node.style.cursor='';};for(const event of ['pointerup','pointercancel','lostpointercapture'])node.addEventListener(event,stop);
 const resetAxis=axis=>{node.dataset[field('yFit',axis)]='full';apply(bounds(axis),axis);};
 node.addEventListener('dblclick',event=>{event.preventDefault();const axis=point(event)?.axis||0,key=field('yFit',axis);if(node.dataset[key]==='auto')resetAxis(axis);else{node.dataset[key]='auto';apply(fitSeriesY(chart.getOption().series,bounds(axis),axis),axis);}});
 return ()=>{for(let axis=0;axis<chart.getOption().yAxis.length;axis++)resetAxis(axis);};
}
