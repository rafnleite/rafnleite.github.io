#!/usr/bin/env python3
"""Reproduz o resumo local a partir do SQLite e dos arquivos de origem.

Requer Python 3, sem bibliotecas adicionais. A base de 8,9 GB não é incluída.
Exemplo:
  python3 scripts/extrair_base.py --banco eleicoes_2026.sqlite3 \
    --pulso pasta-public-do-pulso --evolucao evolucao-biometria.json.gz \
    --saida resumo-reextraido.json

Somente --saida é escrito. O banco é aberto em modo somente leitura. A execução
pode demorar alguns minutos. Fontes externas oficial-pos17.json e a cronologia
de downloads são arquivos independentes; não são reconstruídas por este script.
"""
from pathlib import Path
from collections import defaultdict,Counter
import json,gzip,sqlite3,statistics,math,base64,array,sys,argparse
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--banco',type=Path,required=True)
parser.add_argument('--pulso',type=Path,required=True)
parser.add_argument('--evolucao',type=Path,required=True)
parser.add_argument('--saida',type=Path,required=True)
args=parser.parse_args()
pub=args.pulso
out={}
d=json.loads((pub/'apuracao-encerramento.json').read_text());rows=d['rows'];br=[r for r in rows if r[0]!='ZZ'];ext=d['initialExterior']
def total(rs):
 return dict(zip(['secoes','lula','flavio','comparecimento','brancos','nulos'],[sum(r[i] for r in rs) for i in range(2,8)]))
cs={
'brasil':total(br),'com_exterior':{k:total(br)[k]+ext[ek] for k,ek in [('secoes','sections'),('lula','lula'),('flavio','flavio'),('comparecimento','total'),('brancos','white'),('nulos','invalid')]},
'brasil_antes17':total([r for r in br if r[1]<61200]),
'brasil_a_partir17':total([r for r in br if r[1]>=61200]),
'brasil_apos17':total([r for r in br if r[1]>61200]),
'brasil_a_partir19':total([r for r in br if r[1]>=68400]),
'brasil_apos19':total([r for r in br if r[1]>68400]),
'brasil_170100_a_170259':total([r for r in br if 61260<=r[1]<61380]),
'brasil_170100_a_170159':total([r for r in br if 61260<=r[1]<61320]),
'exterior':ext,
'coverage':d['coverage']}
for t in [61200,61260,61320,61440,61500,61560,61603,61604,61620,61800,63000,64800,68400]:
 z=total([r for r in br if r[1]<=t]);z['lula_com_exterior']=z['lula']+ext['lula'];z['flavio_com_exterior']=z['flavio']+ext['flavio'];cs[f'ate_{t}']=z
out['encerramento']=cs
out['encerramento_minutos_brasil']=[[minute,*[sum(r[i] for r in br if r[1]//60==minute) for i in range(2,8)]] for minute in sorted({r[1]//60 for r in br})]
out['evolucao_biometria']=json.loads(gzip.decompress(args.evolucao.read_bytes()) if args.evolucao.suffix=='.gz' else args.evolucao.read_bytes())
for p in out['evolucao_biometria']['periods']:
 t=p['total'];p['percentuais']={k:t[k]/t['comparecimento']*100 for k in ['biometria','falha_biometria','sem_biometria']}
c=sqlite3.connect(args.banco.resolve().as_uri()+'?mode=ro',uri=True);c.row_factory=sqlite3.Row
q="""select s.uf,s.municipio,s.municipio_codigo,s.zona,s.secao,b.eleitores_aptos,b.comparecimento,b.lula,b.flavio,b.brancos,b.nulos,b.encerramento_brasilia_seg,l.nome local,l.latitude,l.longitude,l.pais,b.url from secoes s join boletins b on b.secao_id=s.id left join locais l on l.id=s.local_id where s.turno=2 and ((b.lula>0 and b.flavio=0) or (b.flavio>0 and b.lula=0)) order by s.uf,s.municipio,s.zona,s.secao"""
out['unanimidades']=[dict(r) for r in c.execute(q)]
q="""select s.uf,count(*) secoes,sum(r.confirmacoes) votos,sum(r.apos17_brasil) a_partir17,sum(r.apos19_brasil) a_partir19,sum(r.falha_biometria) falha_biometria,sum(r.biometria) biometria,sum(r.sem_biometria) sem_biometria,sum(r.indeterminados) indeterminados from secoes s join resumo_logs r on r.secao_id=s.id where s.turno=2 group by s.uf"""
out['logs_por_uf']=[dict(r) for r in c.execute(q)]
q="""select s.uf,s.municipio,s.zona,s.secao,b.encerramento_brasilia_seg,b.total,r.confirmacoes,r.apos17_brasil,r.apos19_brasil from secoes s join boletins b on b.secao_id=s.id join resumo_logs r on r.secao_id=s.id where s.turno=2 and s.uf<>'ZZ' and b.encerramento_brasilia_seg>=68400 order by b.encerramento_brasilia_seg"""
out['urnas_encerradas19']=[dict(r) for r in c.execute(q)]
q="""select s.uf,s.municipio,s.zona,s.secao,b.encerramento_brasilia_seg,b.total,r.confirmacoes,r.apos17_brasil from secoes s join boletins b on b.secao_id=s.id join resumo_logs r on r.secao_id=s.id where s.turno=2 and s.uf<>'ZZ' and b.encerramento_brasilia_seg between 61260 and 61379 order by r.apos17_brasil desc limit 10"""
out['urnas_1701_1702_maior_pos17']=[dict(r) for r in c.execute(q)]
bio=[]
for p in (pub/'biometria').glob('??.json'):
 for r in json.loads(p.read_text()):
  n,f=r[5:7]
  if n>0 and 0<=f<=n:bio.append((p.stem,*r))
rates=[r[7]/r[6]*100 for r in bio];bins=[0]*100
for r in rates:bins[min(99,int(r))]+=1
out['histograma_biometria_logs']={'n':len(rates),'bins_1pp':bins,'media':statistics.mean(rates),'mediana':statistics.median(rates),'zero':sum(r==0 for r in rates),'menor5':sum(r<5 for r in rates),'menor10':sum(r<10 for r in rates),'maior50':sum(r>=50 for r in rates),'fonte':'Pulso public/biometria/??.json; falhas/confirmações presidenciais nos logs por urna'}
q="""select comparecimento,falha_biometria from habilitacao_bus where ano=2026 and turno=2 and status='ok' and comparecimento>0"""
rates=[r['falha_biometria']/r['comparecimento']*100 for r in c.execute(q)];bins=[0]*100
for r in rates:bins[min(99,int(r))]+=1
out['histograma_biometria_bu']={'n':len(rates),'bins_1pp':bins,'media':statistics.mean(rates),'mediana':statistics.median(rates),'zero':sum(r==0 for r in rates),'menor5':sum(r<5 for r in rates),'menor10':sum(r<10 for r in rates),'maior50':sum(r>=50 for r in rates),'fonte':'SQLite habilitacao_bus; falha_biometria/comparecimento com detalhamento, 2026/2T'}
q="""select s.uf,s.municipio,s.zona,s.secao,b.lula,b.flavio,b.total,b.url from secoes s join boletins b on b.secao_id=s.id where s.turno=2 and s.uf<>'ZZ' and (b.lula=0 or b.flavio=0) order by b.total desc limit 8"""
out['unanimidades_maior_comparecimento']=[dict(r) for r in c.execute(q)]

d=out;closing=json.loads((pub/'apuracao-encerramento.json').read_text())
bysec=defaultdict(lambda:[0]*3)
for uf,t,n,l,f,*_ in closing['rows']:
 if uf!='ZZ':
  bysec[t][0]+=n;bysec[t][1]+=l;bysec[t][2]+=f
ext=closing['initialExterior'];n=0;l=ext['lula'];f=ext['flavio'];curve=[]
for t in range(16*3600+59*60,17*3600+15*60+1):
 z=bysec[t];n+=z[0];l+=z[1];f+=z[2];curve.append([t,n,l,f])
# No Brazil closures before 17h: verified against all rows.
vm=json.loads((pub/'voting/manifest.json').read_text());voting=defaultdict(lambda:[0]*5)
for st in vm['states']:
 if st['uf']=='ZZ':continue
 meta=json.loads((pub/st['url'].removeprefix('./')).read_text())
 for part in meta['parts']:
  data=json.loads((pub/'voting'/part['url']).read_text());raw=gzip.decompress(base64.b64decode(data['rowData']['data']));packed=array.array('I');packed.frombytes(raw)
  if sys.byteorder!='little':packed.byteswap()
  for v in packed:voting[(v>>19)-4096][(v>>16)&7]+=v&65535
summary={
'meta':{'ano':2026,'turno':2,'data':'2026-10-25','fuso':'America/Sao_Paulo','tipo':'Agregados de cópia local de arquivos atribuídos ao TSE. Proveniência externa a verificar.','gerado_base_bu':closing['sourceSnapshot'],'margem_final':d['encerramento']['com_exterior']['lula']-d['encerramento']['com_exterior']['flavio']},
'encerramento':d['encerramento'],
'curva':{'columns':['segundo_brasilia','secoes_brasil_acumuladas','lula_com_exterior_integral','flavio_com_exterior_integral'],'exterior_saldo_inicial':True,'referencia_flavio_final':d['encerramento']['com_exterior']['flavio'],'rows':curve},
'encerramento_por_minuto':{'columns':['minuto_brasilia','secoes','lula','flavio','comparecimento','brancos','nulos'],'rows':d['encerramento_minutos_brasil']},
'votos_por_minuto':{'columns':['minuto_brasilia','indeterminado','biometria','falha_biometria','sem_biometria','nao_biometrico_indeterminado'],'rows':[[m,*v] for m,v in sorted(voting.items())],'base':'Logs; confirmações presidenciais explícitas; Brasil; sem associação com candidato'},
'logs_por_uf':d['logs_por_uf'],
'histograma_biometria_logs':d['histograma_biometria_logs'],
'histograma_biometria_bu':d['histograma_biometria_bu'],
'evolucao_biometria':d['evolucao_biometria'],
'unanimidades':d['unanimidades'],
'urnas_1701_1702_maior_pos17':d['urnas_1701_1702_maior_pos17'],
'urnas19_resumo':{'secoes':len(d['urnas_encerradas19']),'votos_log':sum(r['confirmacoes'] for r in d['urnas_encerradas19']),'a_partir17':sum(r['apos17_brasil'] for r in d['urnas_encerradas19']),'a_partir19':sum(r['apos19_brasil'] for r in d['urnas_encerradas19']),'sem_confirmacao_apos17':sum(r['apos17_brasil']==0 for r in d['urnas_encerradas19']),'nota':'Encerradas a partir19h não implica terem esperado por prorrogação nem que votantes chegaram depois17h'},
'notas':['BU contém contagens agregadas; log contém horários sem candidato; RDV preserva sigilo e não permite relacionar voto ao eleitor.','34.126 é a contagem de confirmações a partir17h nos logs disponíveis Brasil (inclui exatamente17:00:00), não uma contagem dos votos de BUs encerrados após17h.','Todos os 497.897 BUs do Brasil têm encerramento posterior17h. Somar os seus votos produz127.854.631, e não34mil.','Corte17:06:44 usa exterior integral como saldo inicial; com Brasil sozinho o marco é outro.','Comparação2024/2026 é descritiva: eleições municipal e geral;2024/2T cobre parte dos municípios.','Histograma logs do Pulso cobre496.327 urnas elegíveis pelo filtro original; histograma BU completo cobre497.897 seções Brasil com detalhamento; não confundir denominadores.']}

c.close()
args.saida.parent.mkdir(parents=True,exist_ok=True)
args.saida.write_text(json.dumps(summary,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(json.dumps({'arquivo':str(args.saida),'bytes':args.saida.stat().st_size,'unanimidades':len(summary['unanimidades']),'ano':summary['meta']['ano'],'turno':summary['meta']['turno']},ensure_ascii=False))
