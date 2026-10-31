// Portais e posicionamento usam as bibliotecas da página, fora dos cartões que recortam conteúdo.
export function chartTooltipOptions(options={}){
  return {renderMode:'html',appendTo:'body',confine:true,className:'ui-chart-tooltip',transitionDuration:0,
    triggerOn:'mousemove',backgroundColor:'#fffef9',borderColor:'#d6e0cb',textStyle:{fontSize:11,color:'#557549'},
    showDelay:30,hideDelay:80,extraCssText:'z-index:3000;max-width:calc(100vw - 24px);white-space:normal;overflow-wrap:anywhere;',...options};
}

export function installChartDismissal(getCharts){
  const hide=()=>getCharts().filter(Boolean).forEach(chart=>chart.dispatchAction({type:'hideTip'}));
  window.addEventListener('scroll',hide,{capture:true,passive:true});
  window.addEventListener('blur',hide);
  window.addEventListener('resize',hide);
  window.addEventListener('ui-menu-open',hide);
  document.addEventListener('pointerdown',event=>{if(!getCharts().filter(Boolean).some(chart=>chart.getDom().contains(event.target)))hide();},{passive:true});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
}

export function enhanceStateSelect(select,{onAll,onNone}={}){
  const floating=window.FloatingUIDOM;
  if(!floating)throw new Error('A biblioteca de posicionamento não foi carregada. Atualize a página.');
  const dropdown=select.dropdown;
  dropdown.classList.add('ui-select-dropdown');
  dropdown.style.position='fixed';
  const toolbar=document.createElement('div');toolbar.className='ui-select-actions';toolbar.setAttribute('aria-label','Ações dos estados');
  for(const [label,action] of [['Marcar todos',onAll],['Desmarcar todos',onNone],['Concluir',()=>{select.close();select.control.focus();}]]){
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.addEventListener('mousedown',event=>event.preventDefault());
    button.addEventListener('click',()=>{action?.();if(select.isOpen)select.positionDropdown();});
    toolbar.append(button);
  }
  dropdown.insertBefore(toolbar,select.dropdown_content);
  let cleanup,generation=0;
  const update=()=>{
    if(!select.isOpen)return;
    const ticket=++generation;
    floating.computePosition(select.control,dropdown,{strategy:'fixed',placement:'bottom-start',middleware:[
      floating.offset(6),floating.flip({padding:12}),floating.shift({padding:12}),
      floating.size({padding:12,apply({availableHeight,rects}){
        dropdown.style.width=`${Math.min(Math.max(rects.reference.width,280),window.innerWidth-24)}px`;
        const chrome=dropdown.offsetHeight-select.dropdown_content.offsetHeight;
        select.dropdown_content.style.maxHeight=`${Math.max(48,Math.min(280,availableHeight-chrome-4))}px`;
      }}),floating.hide({strategy:'referenceHidden'})
    ]}).then(({x,y,middlewareData})=>{
      if(!select.isOpen||ticket!==generation)return;
      if(middlewareData.hide?.referenceHidden){select.close();return;}
      Object.assign(dropdown.style,{left:`${x}px`,top:`${y}px`,visibility:'visible'});
    });
  };
  select.positionDropdown=update;
  select.on('dropdown_open',()=>{
    window.dispatchEvent(new Event('ui-menu-open'));cleanup?.();
    cleanup=floating.autoUpdate(select.control,dropdown,update);
  });
  select.on('dropdown_close',()=>{generation++;cleanup?.();cleanup=undefined;});
  select.on('destroy',()=>{generation++;cleanup?.();});
}

export function createMapTooltip({interactive=false}={}){
  const floating=window.FloatingUIDOM;
  if(!floating)throw new Error('A biblioteca de posicionamento não foi carregada. Atualize a página.');
  const element=document.createElement('div');element.className=interactive?'ui-map-popover':'ui-map-tooltip';element.hidden=true;element.setAttribute('role',interactive?'dialog':'tooltip');
  if(interactive)element.setAttribute('aria-label','Resultado do local de votação');document.body.append(element);
  let cleanup,generation=0,returnFocus;
  const remove=()=>{generation++;element.hidden=true;cleanup?.();cleanup=undefined;};
  const show=(reference,html)=>{
    remove();const ticket=generation;returnFocus=document.activeElement;
    if(interactive){
      const close=document.createElement('button');close.type='button';close.className='ui-map-close';close.textContent='×';close.setAttribute('aria-label','Fechar resultado');close.onclick=()=>{remove();returnFocus?.focus({preventScroll:true});};
      const content=document.createElement('div');content.className='ui-map-content';content.innerHTML=html;element.replaceChildren(close,content);
    }else element.innerHTML=html;
    element.hidden=false;element.style.visibility='hidden';
    const update=()=>floating.computePosition(reference,element,{strategy:'fixed',placement:'top',middleware:[
      floating.offset(12),floating.flip({padding:12}),floating.shift({padding:12,crossAxis:true}),
      floating.size({padding:12,apply({availableHeight,availableWidth}){
        element.style.maxWidth=`${Math.min(360,Math.max(180,availableWidth))}px`;
        element.style.maxHeight=`${Math.max(80,availableHeight)}px`;
      }})
    ]}).then(({x,y})=>{if(ticket===generation&&!element.hidden)Object.assign(element.style,{left:`${x}px`,top:`${y}px`,visibility:'visible'});});
    cleanup=floating.autoUpdate(reference,element,update);
  };
  window.addEventListener('scroll',event=>{if(!interactive||!element.contains(event.target))remove();},{capture:true,passive:true});window.addEventListener('resize',remove);window.addEventListener('blur',remove);window.addEventListener('ui-menu-open',remove);
  document.addEventListener('pointerdown',event=>{if(interactive&&!element.hidden&&!element.contains(event.target))remove();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){const wasOpen=!element.hidden;remove();if(interactive&&wasOpen)returnFocus?.focus({preventScroll:true});}});
  return {show,remove,isOpen:()=>!element.hidden};
}
