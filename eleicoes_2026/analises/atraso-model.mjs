export function delayReport(data,{minute=1020,ufs=null,paths=null}={}){
 const totals=Array(7).fill(0),byUF=new Map(),places=new Map();
 for(const row of data.rows){const [index,second,...values]=row,p=data.places[index];
  if(second<minute*60||(ufs&&!ufs.has(p.uf))||(paths&&!paths.has(`${p.uf}/${Number(p.municipality)}/${Number(p.zone)}`)))continue;
  for(let i=0;i<7;i++)totals[i]+=values[i];
  if(!byUF.has(p.uf))byUF.set(p.uf,Array(7).fill(0));
  if(!places.has(index))places.set(index,{...p,values:Array(7).fill(0),latest:second});
  const target=places.get(index);target.latest=Math.max(target.latest,second);
  for(let i=0;i<7;i++){byUF.get(p.uf)[i]+=values[i];target.values[i]+=values[i];}
 }
 return {totals,byUF:[...byUF].sort((a,b)=>b[1][0]-a[1][0]||a[0].localeCompare(b[0])),places:[...places.values()]};
}
export function closingLabel(seconds){const day=Math.floor(seconds/86400),m=((Math.floor(seconds/60)%1440)+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}${day?` (+${day}d)`:''}`;}
