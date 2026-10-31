import sqlite3InitModule from './vendor/sqlite/index.mjs';
let sqlite,pool,db;
const filename='/eleicoes_2026.sqlite3';
function run(sql,limit=200){
  const stmt=db.prepare(sql),rows=[];let columns;
  try{
    if(!sqlite.capi.sqlite3_stmt_readonly(stmt.pointer))throw new Error('A base está aberta somente para leitura.');
    columns=stmt.getColumnNames();
    while(stmt.step()){
      if(rows.length>=limit)return {columns,rows,truncated:true,limit};
      rows.push(stmt.get([]).map(v=>typeof v==='bigint'?String(v):v instanceof Uint8Array?`[BLOB: ${v.length} bytes]`:typeof v==='string'&&v.length>20000?v.slice(0,20000)+'… [célula abreviada]':v));
    }
    return {columns,rows,truncated:false,limit};
  }finally{stmt.finalize();}
}
function schema(){
  const objects=run("SELECT name,type,sql FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type,name",100).rows.map(([name,type,sql])=>({name,type,sql}));
  for(const item of objects){const name=item.name.replaceAll("'","''");item.columns=run(`SELECT name,type,pk FROM pragma_table_info('${name}')`,300).rows.map(([name,type,primaryKey])=>({name,type,primaryKey}));item.foreignKeys=run(`SELECT "from","table","to" FROM pragma_foreign_key_list('${name}')`,100).rows.map(([from,table,to])=>({from,table,to}));}
  const rows=run("SELECT valor FROM metadados WHERE chave='consolidacao'",1).rows;
  return {objects,metadata:{consolidacao:rows.length?JSON.parse(rows[0][0]):{}},filename:'eleicoes_2026.sqlite3',mode:'browser_readonly'};
}
self.onmessage=async({data})=>{
  const {id,type}=data;
  try{
    if(!sqlite)sqlite=await sqlite3InitModule({print:()=>{},printErr:()=>{}});
    if(!pool){pool=await sqlite.installOpfsSAHPoolVfs({name:'pulso-query-readonly',directory:'.pulso-consulta',initialCapacity:6});await pool.reserveMinimumCapacity(6);}
    if(type==='open'){
      if(db){db.close();db=null;}
      const file=data.file;let offset=0,last=0;
      await pool.importDb(filename,async()=>{
        if(offset>=file.size)return undefined;
        const chunk=new Uint8Array(await file.slice(offset,offset+4*1024*1024).arrayBuffer());offset+=chunk.length;
        if(offset-last>=32*1024*1024||offset===file.size){last=offset;self.postMessage({id,type:'progress',loaded:offset,total:file.size});}
        return chunk;
      });
      db=new pool.OpfsSAHPoolDb(filename,'r');db.exec('PRAGMA query_only=ON;PRAGMA cache_size=-32768;');
      self.postMessage({id,type:'ready',schema:schema()});
    }else if(type==='resume'){
      if(!pool.getFileNames().includes(filename))throw new Error('Nenhuma cópia anterior foi encontrada neste navegador. Abra o arquivo SQLite.');
      db=new pool.OpfsSAHPoolDb(filename,'r');db.exec('PRAGMA query_only=ON;PRAGMA cache_size=-32768;');self.postMessage({id,type:'ready',schema:schema()});
    }else if(type==='query'){
      if(!db)throw new Error('Abra uma base SQLite primeiro.');
      const start=performance.now();const result=run(data.sql,Math.max(1,Math.min(data.limit||200,1000)));result.seconds=(performance.now()-start)/1000;self.postMessage({id,type:'result',result});
    }
  }catch(error){self.postMessage({id,type:'error',error:error.message||String(error)});}
};
