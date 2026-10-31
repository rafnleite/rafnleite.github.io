/** A closed-by-default filter drawer, shared by every page. */
const sidebar=document.getElementById('siteFilters');
const headerToggle=document.getElementById('siteFiltersToggle');
const edgeToggle=document.getElementById('siteFiltersEdgeToggle');
const backdrop=document.getElementById('siteSidebarBackdrop');
if(sidebar&&headerToggle&&edgeToggle&&backdrop){
  const closeButton=sidebar.querySelector('.site-filters-close');
  if(closeButton){
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.setAttribute('viewBox','0 0 20 20');icon.setAttribute('width','14');icon.setAttribute('height','14');
    icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');
    const lines=document.createElementNS('http://www.w3.org/2000/svg','path');
    lines.setAttribute('d','M5 5L15 15M15 5L5 15');lines.setAttribute('fill','none');
    lines.setAttribute('stroke','currentColor');lines.setAttribute('stroke-width','1.6');lines.setAttribute('stroke-linecap','round');
    icon.append(lines);closeButton.replaceChildren(icon);
  }
  const toggles=[headerToggle,edgeToggle],mobile=matchMedia('(max-width:980px)');
  let open=false,opener=edgeToggle,resizeFrame;
  const focusable=()=>[...sidebar.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]')]
    .filter(element=>element.tabIndex>=0&&!element.closest('[hidden],[inert]')&&element.getClientRects().length>0);
  function setOpen(next,{trigger,focus=true}={}){
    if(trigger)opener=trigger;
    open=Boolean(next);
    sidebar.querySelectorAll('select').forEach(select=>select.tomselect?.close());
    document.dispatchEvent(new CustomEvent('site:filterschange',{detail:{open,mobile:mobile.matches}}));
    sidebar.hidden=!open;backdrop.hidden=true;
    document.body.classList.toggle('site-filters-collapsed',!open);
    document.body.classList.toggle('site-filters-open',open);
    document.body.classList.remove('site-mobile-filters-open');
    for(const toggle of toggles)toggle.setAttribute('aria-expanded',String(open));
    headerToggle.textContent=open?'Fechar filtros':'Filtros';
    edgeToggle.setAttribute('aria-label',open?'Recolher filtros':'Abrir filtros');
    edgeToggle.tabIndex=0;
    sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');
    if(focus){
      const target=open?(focusable()[0]||sidebar):(opener?.isConnected?opener:edgeToggle);
      target.focus({preventScroll:true});
    }
    cancelAnimationFrame(resizeFrame);
    resizeFrame=requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  }
  toggles.forEach(toggle=>toggle.addEventListener('click',()=>setOpen(!open,{trigger:toggle})));
  sidebar.querySelector('.site-filters-close')?.addEventListener('click',()=>setOpen(false));
  backdrop.addEventListener('click',()=>setOpen(false));
  document.addEventListener('keydown',event=>{
    if(!open)return;
    if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();
      const menu=[...sidebar.querySelectorAll('select')].map(select=>select.tomselect).find(select=>select?.isOpen);
      if(menu){menu.close();menu.control.focus({preventScroll:true});return;}
      setOpen(false);
    }
  },true);
  const gated=[...(sidebar.hasAttribute('data-sidebar-source')?[sidebar]:[]),...sidebar.querySelectorAll('[data-sidebar-source]')];
  for(const group of gated){
    const sourceId=group.dataset.sidebarSource,source=document.getElementById(sourceId);if(!source)continue;
    const body=group===sidebar?sidebar.querySelector('.site-filter-body'):group,note=document.createElement('p');
    note.className='site-filter-loading';note.setAttribute('role','status');
    note.textContent=sourceId==='workbench'?'Abra a base SQLite para consultar tabelas e usar os filtros.':'Os filtros estarão disponíveis quando os dados terminarem de carregar.';
    body.before(note);
    const sync=()=>{const waiting=source.hidden;body.inert=waiting;note.hidden=!waiting;group.setAttribute('aria-busy',String(waiting));};
    new MutationObserver(sync).observe(source,{attributes:true,attributeFilter:['hidden']});sync();
  }
  // Do not revive the open state saved by the former permanent sidebar.
  setOpen(false,{focus:false});
}
