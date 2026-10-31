export function accumulate(data,{uf='',territory='all'}={}){
 const match=u=>(!uf||uf===u)&&(territory!=='brazil'||u!=='ZZ')&&(territory!=='exterior'||u==='ZZ');
 const seconds=new Map();
 const useExterior=territory!=='brazil'&&(!uf||uf==='ZZ');
 const empty={sections:0,lula:0,flavio:0,total:0,white:0,invalid:0};
 const base={...empty,...(useExterior?data.initialExterior:{})};
 for(const [u,t,n,l,f,total,white,invalid] of data.rows){
  // Exterior completo é um saldo inicial; nunca é somado de novo por horário.
  if(!match(u)||u==='ZZ')continue;
  const r=seconds.get(t)||[0,0,0,0,0,0];[n,l,f,total,white,invalid].forEach((v,i)=>r[i]+=v);seconds.set(t,r);
 }
 let {sections,lula,flavio,total,white,invalid}=base;
 const points=[...seconds].sort((a,b)=>a[0]-b[0]).map(([t,r])=>{
  sections+=r[0];lula+=r[1];flavio+=r[2];total+=r[3];white+=r[4];invalid+=r[5];
  const valid=lula+flavio;
  return {t,sections,lula,flavio,total,white,invalid,lulaPct:valid?100*lula/valid:null,flavioPct:valid?100*flavio/valid:null};
 });
 const coverage={expected:0,bus:0,included:0,withoutTime:0};
 for(const c of data.coverage.filter(c=>match(c.uf))){
  for(const k of Object.keys(coverage))coverage[k]+=c[k];
  if(c.uf==='ZZ'&&useExterior){coverage.included+=c.withoutTime;coverage.withoutTime-=c.withoutTime;}
 }
 return {points,coverage,base,useExterior};
}
export function leadership(points,base={lula:0,flavio:0}){
 const sign=p=>Math.sign(p.lula-p.flavio),changes=[];let previous=base;
 for(const p of points){
  if(sign(p)!==sign(previous))changes.push({...p,previousLula:previous.lula,previousFlavio:previous.flavio,leader:sign(p)>0?'lula':sign(p)<0?'flavio':'tie'});
  previous=p;
 }
 const lulaEntries=changes.filter(p=>p.leader==='lula');
 const lastNonLula=points.findLastIndex(p=>sign(p)<=0);
 const lasting=points.length&&sign(points.at(-1))>0?(lastNonLula<0?(sign(base)>0?null:points[0]):points[lastNonLula+1]):null;
 return {initialLeader:sign(base)>0?'lula':sign(base)<0?'flavio':'tie',changes,firstLula:lulaEntries[0]||null,lastingLula:lasting};
}
export function reachesFinalFlavio(points,base={lula:0,flavio:0}){
 const target=points.at(-1)?.flavio??base.flavio;
 if(target<=0)return {target,point:null,before:null,inInitialBalance:false};
 if(base.lula>=target)return {target,point:null,before:null,inInitialBalance:true};
 const index=points.findIndex(p=>p.lula>=target);
 return {target,point:index>=0?points[index]:null,before:index>=0?(index?points[index-1]:base):null,inInitialBalance:false};
}
export function clock(seconds){
 const days=Math.floor(seconds/86400),s=((seconds%86400)+86400)%86400;
 const time=[Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':');
 return time+(days?` (D${days>0?'+':''}${days})`:'');
}
