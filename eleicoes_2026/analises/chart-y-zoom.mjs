export function zoomYRange(range,delta,anchor=.5,bounds){
 const [lo,hi]=range,span=hi-lo;if(!Number.isFinite(span)||span<=0||!Number.isFinite(delta)||!delta)return [...range];
 anchor=Math.max(0,Math.min(1,anchor));const factor=Math.exp(Math.max(-.45,Math.min(.45,delta*.0025)));
 let width=Math.max((bounds?bounds[1]-bounds[0]:span)*1e-7,span*factor),start=lo+span*anchor-width*anchor;
 if(bounds){width=Math.min(width,bounds[1]-bounds[0]);start=Math.max(bounds[0],Math.min(bounds[1]-width,start));}
 return [start,start+width];
}
export function shiftYRange(range,delta,bounds=[0,100]){
 const width=Math.min(bounds[1]-bounds[0],Math.max(0,range[1]-range[0]));
 const lo=Math.max(bounds[0],Math.min(bounds[1]-width,range[0]+delta));
 return [lo,Math.min(bounds[1],lo+width)];
}
const states=new WeakMap(),activeCharts=new Set();
function hitAxis(event){
 if(!globalThis.echarts)return;
 for(let node=event.target;node instanceof Element;node=node.parentElement){
  if(node.dataset.simulationNavigation||node.dataset.chartZoom==='disabled')return;
  if(!node.hasAttribute('_echarts_instance_'))continue;
  const chart=echarts.getInstanceByDom(node);if(!chart||chart.isDisposed())return;
  const box=node.getBoundingClientRect(),x=(event.clientX-box.left)*chart.getWidth()/box.width,y=(event.clientY-box.top)*chart.getHeight()/box.height;
  const option=chart.getOption(),axes=option.yAxis||[];
  for(let i=0;i<axes.length;i++){
   const model=chart.getModel().getComponent('yAxis',i),axis=model?.axis;
   if(!axis||axis.scale.type==='ordinal'||axes[i].show===false||axes[i].axisLabel?.show===false)continue;
   const grid=chart.getModel().getComponent('grid',model.get('gridIndex')||0)?.coordinateSystem?.getRect();if(!grid)continue;
   const right=axis.position==='right',edge=right?grid.x+grid.width+(Number(axes[i].offset)||0):grid.x-(Number(axes[i].offset)||0);
   if(y<grid.y-8||y>grid.y+grid.height+8||!(right?x>edge+1&&x<edge+72:x<edge-1&&x>Math.max(0,edge-84)))continue;
   const range=axis.scale.getExtent();if(!range.every(Number.isFinite)||range[1]<=range[0])continue;
   return {chart,node,option,index:i,range,anchor:1-(y-grid.y)/grid.height};
  }
  return;
 }
}
function restore(hit){
 const map=states.get(hit.chart),state=map?.get(hit.index);if(!state)return;
 hit.chart.setOption({yAxis:hit.option.yAxis.map((a,i)=>i===hit.index?{min:state.min??null,max:state.max??null}:{})});map.delete(hit.index);delete hit.node.dataset.yZoom;
}
if(typeof document!=='undefined'){
 document.addEventListener('wheel',event=>{
  const hit=hitAxis(event);if(!hit||!event.deltaY)return;
  event.preventDefault();event.stopImmediatePropagation();
  let map=states.get(hit.chart);if(!map){map=new Map();states.set(hit.chart,map);}
  let state=map.get(hit.index),option=hit.option.yAxis[hit.index];
  if(!state||option.min!==state.last?.[0]||option.max!==state.last?.[1]){state={min:option.min,max:option.max,bounds:[...hit.range]};map.set(hit.index,state);}
  const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?300:1),rawRange=zoomYRange(hit.range,delta,hit.anchor,state.bounds),digits=Math.max(0,Math.min(12,3-Math.floor(Math.log10(rawRange[1]-rawRange[0])))),range=rawRange.map(v=>Number(v.toFixed(digits)));state.last=range;activeCharts.add(hit.chart);hit.node.dataset.yZoom=JSON.stringify({axis:hit.index,range});
  hit.chart.setOption({yAxis:hit.option.yAxis.map((a,i)=>i===hit.index?{min:range[0],max:range[1]}:{})});
 },{passive:false,capture:true});
 document.addEventListener('dblclick',event=>{const hit=hitAxis(event);if(hit){event.preventDefault();event.stopImmediatePropagation();restore(hit);}},true);
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('button');if(!button||!['resetChartZoom','resetHistogramZoom','resetZoom','tallyReset'].includes(button.id))return;
  for(const chart of activeCharts){if(chart.isDisposed()){activeCharts.delete(chart);continue;}const map=states.get(chart);for(const index of [...(map?.keys()||[])])restore({chart,index,node:chart.getDom(),option:chart.getOption()});}
 },true);
 let hovered;
 document.addEventListener('pointermove',event=>{const hit=hitAxis(event);if(hovered&&hovered!==hit?.node){hovered.style.cursor='';hovered=null;}if(hit){hit.node.style.cursor='ns-resize';hovered=hit.node;}},{passive:true});
}
