import {candidateOpacity,candidateColor} from './simulacao-legend.mjs?v=legend-highlight-2';
import {createAxisControl} from './simulacao-axis-control.mjs?v=axis-label-2';
import {zoomYRange,shiftYRange} from './chart-y-zoom.mjs?v=fixed-regions-2';
import {clock,START_TIME} from './simulacao-model.mjs?v=fixed-regions-2';
// Fit both candidates across every finite sample of the selected horizontal
// axis. Mirroring Lula's share includes Flávio without scanning a second buffer.
export function ensembleYExtent(result,axis){
 let lo=Infinity,hi=-Infinity;
 const percent=axis==='count',values=percent?result.percentCoords:result.curves;
 for(let i=percent?1:0;i<(values?.length||0);i+=percent?2:1){
  const value=values[i];if(!Number.isFinite(value))continue;
  lo=Math.min(lo,value,100-value);hi=Math.max(hi,value,100-value);
 }
 if(!Number.isFinite(lo))return [0,100];
 const margin=Math.max(1,(hi-lo)*.04);
 return [Math.max(0,lo-margin),Math.min(100,hi+margin)];
}
// All curves share one GPU buffer. Two draw calls mirror Lula/Flávio's shares.
export function createEnsembleChart(container,{onAxisChange}={}){
 const axes=document.createElement('canvas'),canvas=document.createElement('canvas');axes.className='ensemble-axes';canvas.className='ensemble-lines';axes.setAttribute('aria-hidden','true');canvas.setAttribute('aria-hidden','true');container.append(axes,canvas);
 let regl,draw,buffer,result,vertices,count=0,opacity=.012,highlightedCandidate=null,range=[0,100],xRange=[0,1],size,drag,pendingFrame,axis='time',fitActive=false,fitRanges={};
 const axisNode=document.createElement('div');axisNode.className='chart-axis-control';container.append(axisNode);const axisControl=createAxisControl(axisNode,changeAxis);
 let fallback=false;
 try{
  regl=createREGL({canvas,attributes:{alpha:true,antialias:true,preserveDrawingBuffer:true}});
  buffer=regl.buffer({type:"float",data:new Float32Array(0)});
  draw=regl({vert:'precision highp float; attribute vec2 position; uniform float mirror; uniform vec2 yrange; uniform vec2 xrange; void main(){float y=mix(position.y,1.0-position.y,mirror)*100.0;gl_Position=vec4((position.x-xrange.x)/(xrange.y-xrange.x)*2.0-1.0,(y-yrange.x)/(yrange.y-yrange.x)*2.0-1.0,0,1);}',
   frag:'precision mediump float; uniform vec4 color; void main(){gl_FragColor=color;}',attributes:{position:{buffer,size:2,type:"float"}},uniforms:{mirror:regl.prop('mirror'),color:regl.prop('color'),yrange:()=>range,xrange:()=>xRange},primitive:'lines',count:()=>count,lineWidth:1,depth:{enable:false},blend:{enable:true,func:{srcRGB:'src alpha',dstRGB:'one minus src alpha',srcAlpha:'one',dstAlpha:'one minus src alpha'}}});
 }catch(error){fallback=true;canvas.remove();}
 function render(){
  if(!result||!size)return;
  const ratio=Math.min(2,window.devicePixelRatio||1),{width,height}=size,left=54,right=18,top=22,bottom=48,w=Math.max(1,width-left-right),h=Math.max(1,height-top-bottom);
  axes.width=Math.round(width*ratio);axes.height=Math.round(height*ratio);axes.style.width=width+'px';axes.style.height=height+'px';
  const ctx=axes.getContext('2d');ctx.scale(ratio,ratio);ctx.clearRect(0,0,width,height);ctx.font='11px Arial';ctx.fillStyle='#667069';ctx.strokeStyle='#e3e7e4';ctx.lineWidth=1;
  for(let i=0;i<=5;i++){const y=top+h-i*h/5;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+w,y);ctx.stroke();ctx.textAlign='right';ctx.fillText((range[0]+i*(range[1]-range[0])/5).toFixed(Math.max(0,Math.min(6,Math.ceil(-Math.log10((range[1]-range[0])/10)))))+'%',left-8,y+4);}
  const ticks=w<500?2:4;for(let i=0;i<=ticks;i++){const x=left+i*w/ticks;ctx.textAlign=i===0?'left':i===ticks?'right':'center';ctx.fillText(axis==='time'?clock(START_TIME+(result.points-1)*result.step*(xRange[0]+(xRange[1]-xRange[0])*i/ticks)).replace(/:\d\d(?= |$)/,''):((xRange[0]+(xRange[1]-xRange[0])*i/ticks)*100).toFixed((xRange[1]-xRange[0])<.05?2:1).replace(/\.0$/,'')+'%',x,height-26);}
  axisControl.update(axis,!result.regional);
  const order=highlightedCandidate===null?[0,1]:[1-highlightedCandidate,highlightedCandidate];
  if(fallback){
   ctx.save();ctx.beginPath();ctx.rect(left,top,w,h);ctx.clip();ctx.lineWidth=.4;ctx.globalAlpha=opacity;
   for(const candidate of order){ctx.globalAlpha=candidateOpacity(candidate,highlightedCandidate,opacity);ctx.strokeStyle=candidateColor(candidate,highlightedCandidate);for(let run=0;run<result.count;run++){ctx.beginPath();let open=false;for(let j=0;j<(axis==='time'?result.points:result.percentPoints);j++){const c=(run*result.percentPoints+j)*2;let y=axis==='time'?result.curves[run*result.points+j]:result.percentCoords[c+1];if(!Number.isFinite(y)){open=false;continue;}if(candidate)y=100-y;const x=left+((axis==='time'?j/(result.points-1):result.percentCoords[c])-xRange[0])/(xRange[1]-xRange[0])*w;y=top+h-(y-range[0])/(range[1]-range[0])*h;if(open)ctx.lineTo(x,y);else{ctx.moveTo(x,y);open=true;}}ctx.stroke();}}
   ctx.restore();return;
  }
  canvas.style.left=left+'px';canvas.style.top=top+'px';canvas.style.width=w+'px';canvas.style.height=h+'px';if(canvas.width!==Math.round(w*ratio))canvas.width=Math.round(w*ratio);if(canvas.height!==Math.round(h*ratio))canvas.height=Math.round(h*ratio);regl.poll();regl.clear({color:[0,0,0,0],depth:1});
  for(const candidate of order){const muted=highlightedCandidate!==null&&candidate!==highlightedCandidate,rgb=muted?[.62,.65,.63]:candidate?[.129,.4,.675]:[.843,.188,.153];draw({mirror:candidate,color:[...rgb,candidateOpacity(candidate,highlightedCandidate,opacity)]});}
 }
 function viewChanged(){container.dataset.yRange=JSON.stringify(range);container.dataset.xRange=JSON.stringify(xRange);cancelAnimationFrame(pendingFrame);pendingFrame=requestAnimationFrame(render);}
 function resetView(){fitActive=false;container.dataset.yFit='full';range=[0,100];xRange=[0,1];viewChanged();}
 function fitView(){range=[...(fitRanges[axis]??=ensembleYExtent(result,axis))];container.dataset.yFit='auto';viewChanged();}
 function point(event){const b=container.getBoundingClientRect();return {x:event.clientX-b.left,y:event.clientY-b.top,width:Math.max(1,b.width-72),height:Math.max(1,b.height-70),box:b};}
 function inside(p){return p.x>=54&&p.x<=p.box.width-18&&p.y>=22&&p.y<=p.box.height-48;}
 container.tabIndex=0;
 container.addEventListener('wheel',event=>{
  const p=point(event);if(!result||p.y<14||p.y>p.box.height-10)return;
  const inPlot=inside(p),onY=p.x<=54&&p.y<=p.box.height-40,onX=p.x>=54&&p.x<=p.box.width-18&&p.y>=p.box.height-48;
  if(!inPlot&&!onY&&!onX)return;
  event.preventDefault();event.stopPropagation();const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?p.box.height:1);
  if(inPlot||onY)range=zoomYRange(range,delta,1-(p.y-22)/p.height,[0,100]);

  viewChanged();
 },{passive:false});
 container.addEventListener('pointerdown',event=>{const p=point(event);if(!result||event.button!==0||!inside(p))return;event.preventDefault();container.focus({preventScroll:true});drag={id:event.pointerId,x:event.clientX,y:event.clientY,xRange:[...xRange],range:[...range],width:p.width,height:p.height};container.setPointerCapture(event.pointerId);container.classList.add('is-panning');});
 container.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();range=shiftYRange(drag.range,(event.clientY-drag.y)/drag.height*(drag.range[1]-drag.range[0]),[0,100]);viewChanged();});
 const stopDrag=()=>{drag=null;container.classList.remove('is-panning');};
 container.addEventListener('pointerup',stopDrag);container.addEventListener('pointercancel',stopDrag);container.addEventListener('lostpointercapture',stopDrag);
 container.addEventListener('dblclick',event=>{if(!result)return;event.preventDefault();if(fitActive)resetView();else{fitActive=true;fitView();}});
 container.addEventListener('keydown',event=>{if(!result)return;const step=.15,keys=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','Escape','+','=','-'];if(!keys.includes(event.key))return;event.preventDefault();if(event.key==='Home'||event.key==='Escape'){resetView();return;}if(event.key==='ArrowUp'||event.key==='ArrowDown')range=shiftYRange(range,(event.key==='ArrowUp'?1:-1)*step*(range[1]-range[0]),[0,100]);else if(event.key==='ArrowLeft'||event.key==='ArrowRight')return;else{const delta=event.key==='-'?120:-120;range=zoomYRange(range,delta,.5,[0,100]);}viewChanged();});
 const observer=new ResizeObserver(entries=>{size={width:entries[0].contentRect.width,height:entries[0].contentRect.height};render();});observer.observe(container);
 function changeAxis(value){if(!result)return;axis=result.regional?value:'count';xRange=[0,1];container.dataset.axis=axis;axisControl.update(axis,!result.regional);upload();if(fitActive)fitView();else viewChanged();onAxisChange?.(axis);}
 function upload(){
  if(fallback)return;
  const points=axis==='time'?result.points:result.percentPoints;
  vertices=new Float32Array(result.count*(points-1)*4);let k=0;
  for(let run=0;run<result.count;run++)for(let j=1;j<points;j++){
   const ia=run*points+j-1,ib=ia+1;
   const a=axis==='time'?result.curves[ia]:result.percentCoords[ia*2+1],b=axis==='time'?result.curves[ib]:result.percentCoords[ib*2+1];
   if(!Number.isFinite(a)||!Number.isFinite(b))continue;
   vertices[k++]=axis==='time'?(j-1)/(points-1):result.percentCoords[ia*2];vertices[k++]=a/100;
   vertices[k++]=axis==='time'?j/(points-1):result.percentCoords[ib*2];vertices[k++]=b/100;
  }
  count=k/2;buffer({data:vertices.subarray(0,k),usage:'static'});vertices=null;
 }
 return {
  setData(value,nextAxis){
   result=value;fitActive=true;fitRanges={};container.dataset.yFit='auto';axis=value.regional?(nextAxis||'time'):'count';range=[...(fitRanges[axis]=ensembleYExtent(result,axis))];xRange=[0,1];container.dataset.axis=axis;container.dataset.yRange=JSON.stringify(range);container.dataset.xRange=JSON.stringify(xRange);
   container.setAttribute('aria-label',`${value.count.toLocaleString('pt-BR')} simulações, com curvas de Lula e Flávio. Resultado final: Lula ${value.finalPercent.toFixed(2)}%, Flávio ${(100-value.finalPercent).toFixed(2)}%.`);upload();render();
  },
  setAxis:changeAxis,
  highlight(candidate){highlightedCandidate=candidate;container.dataset.highlightedCandidate=candidate===null?'':String(candidate);render();},
  appearance(alpha){opacity=alpha;render();},
  get renderer(){return fallback?'Canvas':'WebGL';},
  destroy(){cancelAnimationFrame(pendingFrame);observer.disconnect();regl?.destroy();axes.remove();canvas.remove();axisNode.remove();}
 };
}
