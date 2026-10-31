import {simulate,chartIndices,clock,adjustedClosing} from './simulacao-model.mjs?v=fixed-regions-2';
let snapshot,lastResult;
self.onmessage=async ({data})=>{
  try{
    if(data.type==='load'){
      const response=await fetch('./simulacao-urnas.json.gz');if(!response.ok)throw Error('Não foi possível carregar a base de urnas.');
      if(typeof DecompressionStream==='undefined')throw Error('Este navegador precisa ser atualizado para abrir a base compactada.');
      snapshot=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
      if(snapshot.schemaVersion!==2||!Array.isArray(snapshot.rows)||!Array.isArray(snapshot.places))throw Error('Formato de base inválido.');
      self.postMessage({type:'loaded',metadata:{...snapshot,rows:undefined,places:undefined}});
    }else if(data.type==='simulate'){
      if(!snapshot)throw Error('Aguarde o carregamento da base.');
      const result=simulate(snapshot,data.options);result.chartIndices=chartIndices(result);lastResult=result;
      self.postMessage({type:'result',id:data.id,result});
    }else if(data.type==='csv'&&lastResult){
      const r=lastResult,parts=['\ufeffmodo;sorteio;uf;municipio;zona;secao;local;nivel;encerramento_urna_registrado_brasilia;encerramento_urna_considerado_brasilia;ultimo_encerramento_local_considerado_brasilia;atraso_local_sorteado_min;espera_extra_local_min;apuracao_brasilia;saldo_inicial_19h;lula;flavio;brancos;nulos;lula_acumulado;flavio_acumulado\r\n'];
      let batch=[];
      for(let k=0;k<r.n;k++){
        const i=r.order[k],row=r.rows[i],uf=snapshot.states[row[0]];
        batch.push([r.mode,r.seed,uf,...row.slice(6,9),snapshot.places[row[9]][3]??'sem_local',r.levels[uf]??3,clock(row[1]),clock(adjustedClosing(row[1],uf)),clock(r.placeClosing[i]),(r.delays[i]/60).toFixed(4),(Math.max(0,r.times[k]-r.placeClosing[i]-r.delays[i])/60).toFixed(4),clock(r.times[k]),k<r.initialCount?'sim':'nao',...row.slice(2,6),r.lula[k+1],r.flavio[k+1]].join(';'));
        if(batch.length>=10000){parts.push(batch.join('\r\n')+'\r\n');batch=[];}
      }
      if(batch.length)parts.push(batch.join('\r\n')+'\r\n');
      self.postMessage({type:'csv',blob:new Blob(parts,{type:'text/csv;charset=utf-8'})});
    }
  }catch(error){self.postMessage({type:'error',id:data.id,message:error.message});}
};
