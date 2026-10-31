import {electionSummary,ELECTION_SCALE} from './election-results.mjs';
import {pointDiameter,MIN_POINT_DIAMETER,MAX_POINT_DIAMETER} from './biometria-scatter-stats.mjs';

// Typed buffers, cached circle sprites and short animation frames avoid creating
// hundreds of thousands of chart objects, even when each point has its own size.
export function createScatterCanvas(element,chart){
 const canvas=document.createElement('canvas');canvas.className='bio-scatter-canvas';canvas.setAttribute('aria-hidden','true');element.append(canvas);
 const scale=ELECTION_SCALE.map((color,i)=>i===2?'#858d93':color);
 const ctx=canvas.getContext('2d'),colors=Array.from({length:101},(_,lula)=>echarts.color.lerp(electionSummary({lula,flavio:100-lula,bus:1,sections:1}).colorPosition,scale));
 let revision=0,frame;
 function clear(){revision++;cancelAnimationFrame(frame);ctx.clearRect(0,0,canvas.width,canvas.height);element.dataset.renderedCount='0';}
 function draw(data){
  clear();const ticket=revision,dpr=Math.min(2,window.devicePixelRatio||1),w=chart.getWidth(),h=chart.getHeight();canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);
  const axes={xAxisIndex:0,yAxisIndex:1},[left,bottom]=chart.convertToPixel(axes,[0,0]),[right,top]=chart.convertToPixel(axes,[100,100]);
  if(![left,bottom,right,top].every(Number.isFinite))return;
  const sx=(right-left)/100,sy=(bottom-top)/100,sprites=new Map(),count=data.count;let position=0;
  const sprite=(color,size)=>{
   const key=color*16+size;if(sprites.has(key))return sprites.get(key);
   const diameter=MIN_POINT_DIAMETER+(MAX_POINT_DIAMETER-MIN_POINT_DIAMETER)*size/15,pad=1,side=diameter+2*pad,s=document.createElement('canvas');s.width=s.height=Math.ceil(side*dpr);const c=s.getContext('2d');c.scale(dpr,dpr);c.globalAlpha=count>10000?.55:.85;c.fillStyle=colors[color];c.beginPath();c.arc(side/2,side/2,diameter/2,0,Math.PI*2);c.fill();const result={image:s,side};sprites.set(key,result);return result;
  };
  const part=()=>{
   if(ticket!==revision)return;
   ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
   const deadline=performance.now()+7,end=Math.min(count,position+8000);
   while(position<end){
    const i=position++,x=data.coords[2*i],y=data.coords[2*i+1],diameter=pointDiameter(data.votes[i],data.minVotes,data.maxVotes),size=Math.round(15*(diameter-MIN_POINT_DIAMETER)/(MAX_POINT_DIAMETER-MIN_POINT_DIAMETER)),s=sprite(Math.round(y),size);
    ctx.drawImage(s.image,left+x*sx-s.side/2,bottom-y*sy-s.side/2,s.side,s.side);
    if(position%256===0&&performance.now()>deadline)break;
   }
   ctx.restore();element.dataset.renderedCount=String(position);
   if(position<count){frame=requestAnimationFrame(part);return;}
  };
  frame=requestAnimationFrame(part);
 }
 return {draw,clear};
}
