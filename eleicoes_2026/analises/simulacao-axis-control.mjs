export function createAxisControl(node,onChange){
 const label=document.createElement('span'),button=document.createElement('button');
 button.type='button';button.className='axis-toggle';
 node.append(label,button);let axis='time';
 button.onclick=event=>{event.stopPropagation();onChange(axis==='time'?'count':'time');};
 for(const type of ['pointerdown','dblclick','keydown'])button.addEventListener(type,event=>event.stopPropagation());
 return {
  update(value,locked=false){
   axis=value;node.dataset.axis=value;label.textContent=value==='time'?'Horário de apuração · Brasília':'Urnas apuradas (%)';
   button.textContent=value==='time'?'Ver por urnas apuradas':'Ver por horário';
   button.hidden=locked;button.title=value==='time'?'Mostrar percentual de urnas apuradas':'Mostrar horário de apuração';button.setAttribute('aria-label',button.title);
  }
 };
}
