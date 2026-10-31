/** A searchable geography checklist. Children are mounted only when expanded. */
const canonicalCode=value=>{
  const text=String(value??'').trim(),number=Number(text);
  return text!==''&&Number.isFinite(number)?String(number):text;
};
export const geographyPath=(uf,municipality,zone)=>
  `${String(uf??'').trim().toUpperCase()}/${canonicalCode(municipality)}/${canonicalCode(zone)}`;

const searchable=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();
const PAGE_SIZE=80;
let instanceCount=0;

function geographyModel(input){
  if(!Array.isArray(input))throw new TypeError('states deve ser uma lista de estados.');
  const byUF=new Map();
  for(const item of input){
    const uf=String(item?.uf??'').trim().toUpperCase();
    if(!/^[A-Z]{2}$/.test(uf))throw new TypeError('UF geográfica inválida.');
    let state=byUF.get(uf);
    if(!state){
      state={kind:'state',id:`state:${uf}`,uf,label:String(item.label||uf),municipalities:new Map(),children:[],leaves:[],selectedCount:0,emptySelected:true};
      state.search=searchable(`${uf} ${state.label}`);byUF.set(uf,state);
    }
    for(const raw of item.municipalities??[]){
      const code=canonicalCode(raw?.code);
      if(!code||code.includes('/'))throw new TypeError(`Código de município inválido em ${uf}.`);
      let municipality=state.municipalities.get(code);
      if(!municipality){
        municipality={kind:'municipality',id:`municipality:${uf}/${code}`,uf,code,label:String(raw.name||code),parent:state,zones:new Map(),children:[],leaves:[],selectedCount:0};
        municipality.search=searchable(`${state.search} ${code} ${municipality.label}`);
        state.municipalities.set(code,municipality);
      }
      for(const rawZone of raw.zones??[]){
        const zone=Number(rawZone);
        if(!Number.isSafeInteger(zone)||zone<=0)throw new TypeError(`Zona inválida em ${uf}/${code}.`);
        if(municipality.zones.has(zone))continue;
        const path=geographyPath(uf,code,zone);
        municipality.zones.set(zone,{kind:'zone',id:`zone:${path}`,path,uf,zone,label:`Zona ${zone}`,parent:municipality,search:searchable(`${municipality.search} zona ${zone}`)});
      }
    }
  }
  const states=[...byUF.values()],nodes=new Map(),leaves=[];
  for(const state of states){
    state.children=[...state.municipalities.values()].filter(node=>node.zones.size).sort((a,b)=>a.label.localeCompare(b.label,'pt-BR')||a.code.localeCompare(b.code));
    nodes.set(state.id,state);
    for(const municipality of state.children){
      municipality.children=[...municipality.zones.values()].sort((a,b)=>a.zone-b.zone);
      municipality.leaves=municipality.children;
      nodes.set(municipality.id,municipality);
      for(const leaf of municipality.children){nodes.set(leaf.id,leaf);leaves.push(leaf);state.leaves.push(leaf);}
    }
  }
  return {states,nodes,leaves};
}

export function createGeographyTree(container,{states=[],onChange=()=>{}}={}){
  if(!container?.ownerDocument)throw new TypeError('Contêiner da seleção geográfica inválido.');
  if(typeof onChange!=='function')throw new TypeError('onChange deve ser uma função.');
  const model=geographyModel(states),doc=container.ownerDocument,instance=`geography-${++instanceCount}`;
  const selected=new Set(model.leaves.map(leaf=>leaf.path)),expanded=new Set(),searchCollapsed=new Set(),limits=new Map();
  const checks=new Map(),buttons=new Map();
  let destroyed=false,query='',matches=null;
  const element=(tag,className,text)=>{
    const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;
  };
  const root=element('div','geography-tree'),searchLabel=element('label','geography-search-label','Buscar estado, município ou zona');
  const search=element('input','geography-search');search.id=`${instance}-search`;search.type='search';search.autocomplete='off';search.placeholder='Nome, UF, município ou zona';
  searchLabel.htmlFor=search.id;search.setAttribute('aria-controls',`${instance}-list`);
  const actions=element('div','geography-actions');
  for(const [action,label]of [['all','Selecionar tudo'],['clear','Limpar']]){
    const button=element('button','geography-action',label);button.type='button';button.dataset.geographyAction=action;actions.append(button);
  }
  const status=element('p','geography-status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  const list=element('ul','geography-list');list.id=`${instance}-list`;list.setAttribute('aria-label','Estados, municípios e zonas eleitorais');
  root.append(searchLabel,search,actions,status,list);container.append(root);

  function refreshCounts(){
    for(const state of model.states){
      state.selectedCount=0;
      for(const municipality of state.children){
        municipality.selectedCount=municipality.leaves.reduce((sum,leaf)=>sum+Number(selected.has(leaf.path)),0);
        state.selectedCount+=municipality.selectedCount;
      }
    }
  }
  function getSelection(){
    const active=model.states.filter(state=>state.leaves.length?state.selectedCount>0:state.emptySelected);
    const limited=active.some(state=>state.selectedCount<state.leaves.length);
    return {ufs:active.map(state=>state.uf),paths:limited?new Set(selected):null,limited};
  }
  function updateStatus(){
    if(query){
      const count=matches.size;
      status.textContent=count?`${count} ${count===1?'estado encontrado':'estados encontrados'}. A busca preserva a seleção.`:'Nenhum estado, município ou zona encontrado.';
      return;
    }
    const selection=getSelection();
    status.textContent=selection.ufs.length?`${selection.ufs.length} ${selection.ufs.length===1?'estado selecionado':'estados selecionados'}${selection.limited?' · seleção parcial':''}.`:'Nenhum estado selecionado.';
  }
  function checkedState(node){
    if(node.kind==='zone')return {checked:selected.has(node.path),mixed:false};
    const total=node.leaves.length,count=node.selectedCount;
    return {checked:total?count===total:Boolean(node.emptySelected),mixed:count>0&&count<total};
  }
  function syncChecks(){
    for(const [id,input]of checks){
      const {checked,mixed}=checkedState(model.nodes.get(id));input.checked=checked;input.indeterminate=mixed;
      input.setAttribute('aria-checked',mixed?'mixed':String(checked));
    }
    updateStatus();
  }
  function notify(){refreshCounts();syncChecks();onChange(getSelection());}
  function changeNode(node,wanted){
    let changed=false;
    if(node.kind==='zone'){
      changed=selected.has(node.path)!==wanted;if(wanted)selected.add(node.path);else selected.delete(node.path);
    }else if(!node.leaves.length){changed=node.emptySelected!==wanted;node.emptySelected=wanted;}
    else for(const leaf of node.leaves){
      if(selected.has(leaf.path)!==wanted)changed=true;
      if(wanted)selected.add(leaf.path);else selected.delete(leaf.path);
    }
    if(changed)notify();else syncChecks();
    return getSelection();
  }
  function setAll(wanted){
    if(destroyed)return getSelection();
    let changed=wanted?selected.size!==model.leaves.length:selected.size>0;
    if(wanted)for(const leaf of model.leaves)selected.add(leaf.path);else selected.clear();
    for(const state of model.states)if(!state.leaves.length){changed||=state.emptySelected!==wanted;state.emptySelected=wanted;}
    if(changed)notify();else syncChecks();
    return getSelection();
  }
  function matchSearch(){
    if(!query){matches=null;return;}
    const tokens=query.split(' '),accept=text=>tokens.every(token=>text.includes(token));matches=new Map();
    for(const state of model.states){
      const municipalities=new Map();
      for(const municipality of state.children){
        const zones=municipality.children.filter(leaf=>accept(leaf.search));
        if(zones.length)municipalities.set(municipality.id,zones);
      }
      if(municipalities.size||(!state.children.length&&accept(state.search)))matches.set(state.id,municipalities);
    }
  }
  const isExpanded=node=>node.kind==='state'&&query?!searchCollapsed.has(node.id):expanded.has(node.id);
  function nodeChildren(node){
    if(!query)return node.children;
    if(node.kind==='state')return node.children.filter(child=>matches.get(node.id)?.has(child.id));
    return matches.get(node.parent.id)?.get(node.id)??[];
  }
  function renderNode(node,parent){
    const item=element('li',`geography-item geography-${node.kind}`),row=element('div','geography-row');item.dataset.geographyNode=node.id;
    const children=node.kind==='zone'?[]:nodeChildren(node),hasChildren=children.length>0,opened=hasChildren&&isExpanded(node);
    if(hasChildren){
      const button=element('button','geography-expand',opened?'−':'+');button.type='button';button.dataset.geographyAction='expand';button.dataset.geographyNode=node.id;
      button.setAttribute('aria-expanded',String(opened));button.setAttribute('aria-controls',`${instance}-${node.id}`);
      button.setAttribute('aria-label',`${opened?'Recolher':'Expandir'} ${node.label}`);row.append(button);buttons.set(`expand:${node.id}`,button);
    }else{const spacer=element('span','geography-spacer');spacer.setAttribute('aria-hidden','true');row.append(spacer);}
    const label=element('label','geography-label'),check=element('input','geography-checkbox');check.type='checkbox';check.dataset.geographyAction='check';check.dataset.geographyNode=node.id;
    check.setAttribute('aria-label',node.kind==='state'?`${node.label} (${node.uf})`:node.kind==='municipality'?`${node.label}, ${node.uf}`:`${node.label}, ${node.parent.label}, ${node.uf}`);
    const name=element('span','geography-name',node.kind==='state'?`${node.uf} · ${node.label}`:node.label);label.append(check,name);row.append(label);checks.set(node.id,check);
    if(node.kind!=='zone'){
      const count=children.length,badge=element('span','geography-count',String(count));badge.setAttribute('aria-label',`${count} ${node.kind==='state'?'municípios':'zonas'}${query?' encontrados':''}`);row.append(badge);
    }
    item.append(row);
    if(node.kind!=='zone'){
      const group=element('ul','geography-children');group.id=`${instance}-${node.id}`;group.hidden=!opened;
      if(opened){
        const limit=limits.get(node.id)??PAGE_SIZE;
        for(const child of children.slice(0,limit))renderNode(child,group);
        if(children.length>limit){
          const moreItem=element('li','geography-more-item'),more=element('button','geography-more',`Mostrar mais (${children.length-limit})`);more.type='button';more.dataset.geographyAction='more';more.dataset.geographyNode=node.id;
          moreItem.append(more);group.append(moreItem);buttons.set(`more:${node.id}`,more);
        }
      }
      item.append(group);
    }
    parent.append(item);
  }
  function render(focusKey){
    checks.clear();buttons.clear();list.replaceChildren();
    for(const state of model.states)if(!query||matches.has(state.id))renderNode(state,list);
    if(!list.children.length){const empty=element('li','geography-empty',query?'Nenhum resultado para a busca.':'Nenhuma geografia disponível.');list.append(empty);}
    syncChecks();
    if(focusKey)(buttons.get(focusKey)||buttons.get(`expand:${focusKey.replace(/^more:/,'')}`))?.focus({preventScroll:true});
  }
  function click(event){
    const target=event.target?.closest?.('[data-geography-action]');if(!target||!root.contains(target))return;
    const action=target.dataset.geographyAction,node=model.nodes.get(target.dataset.geographyNode);
    if(action==='all'){event.preventDefault();setAll(true);}
    else if(action==='clear'){event.preventDefault();setAll(false);}
    else if(action==='expand'&&node){
      event.preventDefault();
      if(node.kind==='state'&&query){if(isExpanded(node))searchCollapsed.add(node.id);else searchCollapsed.delete(node.id);}
      else if(expanded.has(node.id))expanded.delete(node.id);else expanded.add(node.id);
      render(`expand:${node.id}`);
    }else if(action==='more'&&node){event.preventDefault();limits.set(node.id,(limits.get(node.id)??PAGE_SIZE)+PAGE_SIZE);render(`more:${node.id}`);}
  }
  function change(event){
    const target=event.target;
    if(target?.dataset?.geographyAction!=='check')return;
    const node=model.nodes.get(target.dataset.geographyNode);if(node)changeNode(node,Boolean(target.checked));
  }
  function input(event){
    if(event.target!==search)return;
    const next=searchable(search.value);if(next===query)return;
    query=next;searchCollapsed.clear();limits.clear();matchSearch();render();
  }
  root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('input',input);
  refreshCounts();render();
  const stateFor=uf=>model.nodes.get(`state:${String(uf??'').trim().toUpperCase()}`);
  return {
    getSelection,selectAll:()=>setAll(true),clear:()=>setAll(false),
    isStateSelected(uf){
      const state=stateFor(uf);
      return Boolean(state&&(state.leaves.length?state.selectedCount>0:state.emptySelected));
    },
    setStateSelected(uf,wanted){
      const state=stateFor(uf);
      return !destroyed&&state?changeNode(state,Boolean(wanted)):getSelection();
    },
    destroy(){
      if(destroyed)return;destroyed=true;
      root.removeEventListener('click',click);root.removeEventListener('change',change);root.removeEventListener('input',input);root.remove();checks.clear();buttons.clear();
    }
  };
}
