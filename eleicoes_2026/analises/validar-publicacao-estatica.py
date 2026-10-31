#!/usr/bin/env python3
"""Verify packaged Pulso references and gzip payloads without network access."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import gzip,hashlib,json,re,subprocess,sys,shutil,argparse
args=argparse.ArgumentParser();args.add_argument("--node",default=shutil.which("node"));args=args.parse_args()
ROOT=Path(__file__).resolve().parent
SITE=ROOT.parent
errors=[];warnings=[];checked=[];externals=set()
class HTMLRefs(HTMLParser):
 def __init__(self):super().__init__();self.refs=[];self.ids=set()
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if a.get('id'):self.ids.add(a['id'])
  for key in ('src','href','poster'):
   if a.get(key):self.refs.append(a[key])
html={p:HTMLRefs() for p in ROOT.glob('*.html')}
for p,v in html.items():v.feed(p.read_text())
def link(src,raw,base=None):
 if not raw or raw.startswith(('data:','blob:','mailto:','javascript:','tel:')):return
 u=urlsplit(raw)
 if u.scheme or u.netloc:externals.add(raw);return
 if '${' in raw or '<' in raw:return
 if raw.startswith('/'):
  errors.append({'source':str(src.relative_to(ROOT)),'reference':raw,'error':'Absolute site-root path; incompatible with a project GitHub Pages subpath.'});return
 target=((base or src.parent)/unquote(u.path)).resolve() if u.path else src.resolve()
 if not target.exists():errors.append({'source':str(src.relative_to(ROOT)),'reference':raw,'error':'Missing local target'});return
 checked.append((str(src.relative_to(ROOT)),raw))
 if u.fragment and target.suffix=='.html':
  parser=html.get(target)
  if parser is None:
   parser=HTMLRefs();parser.feed(target.read_text())
  if u.fragment not in parser.ids:errors.append({'source':str(src.relative_to(ROOT)),'reference':raw,'error':'Missing fragment'})
for p,parsed in html.items():
 for ref in parsed.refs:link(p,ref)
 for ref in re.findall(r'url\([\s\'\"]*([^\s\)\'\"]+)',p.read_text()):link(p,ref)
for p in ROOT.rglob('*.css'):
 for ref in re.findall(r'url\([\s\'\"]*([^\s\)\'\"]+)',p.read_text()):link(p,ref)
for p in ROOT.rglob('*.mjs'):
 text=p.read_text()
 # Explicit module, worker, fetch and URL references with static string paths.
 patterns=[r'\bfrom\s+[\'\"]([^\'\"]+)[\'\"]',r'\bimport\s*\(?\s*[\'\"]([^\'\"]+)[\'\"]',r'\b(?:fetch|Worker|URL)\(\s*[\'\"]([^\'\"]+)[\'\"]']
 for pattern in patterns:
  for ref in re.findall(pattern,text):
   if ref in ('manifest.json?v=trocas5',):link(p,ref,ROOT/'dados/fluxos');continue
   if ref.startswith(('./','../','/')) or Path(urlsplit(ref).path).suffix in ('.mjs','.js','.json','.css','.wasm','.gz'):
    link(p,ref)
 if re.search(r'''(?:fetch|Worker)\(\s*['"](?:\./)?/?api/''',text) and 'vendor' not in p.parts:errors.append({'source':str(p.relative_to(ROOT)),'error':'Server API dependency remains'})
# Manifest URLs in voting/results are relative to the application, not the manifest.
for name in ('voting/manifest.json','results/manifest.json'):
 p=ROOT/name;data=json.loads(p.read_text())
 for entry in data['states']:link(p,entry['url'],ROOT)
p=ROOT/'biometria/manifest.json';bio=json.loads(p.read_text())
for uf in bio['states']:
 link(p,'./biometria/'+uf+'.json',ROOT)
 link(p,'./biometria/locais-'+uf+'.json',ROOT)
# Files used by lazily-loaded voting geographies.
def walk(value):
 if isinstance(value,dict):
  for k,v in value.items():
   if isinstance(v,str) and k.lower() in ('url','file','arquivo','path') and not v.startswith(('http:','https:')):yield v
   elif isinstance(v,(dict,list)):yield from walk(v)
 elif isinstance(value,list):
  for item in value:yield from walk(item)
for p in (ROOT/'voting/manifest.json',ROOT/'biometria/locais-index.json'):
 for ref in walk(json.loads(p.read_text())):link(p,ref,ROOT)
p=ROOT/'dados/fluxos/manifest.json';flow=json.loads(p.read_text())
for item in flow['ufs']:
 for key,sha,byteskey in [('arquivo','sha256','bytes'),('arquivoUrnas','sha256Urnas','bytesUrnas')]:
  if key not in item:continue
  ref=item[key];link(p,ref,p.parent);target=p.parent/ref
  if target.exists():
   actual=hashlib.sha256(target.read_bytes()).hexdigest()
   if item.get(sha) and actual!=item[sha]:errors.append({'source':str(p.relative_to(ROOT)),'reference':ref,'error':'Manifest SHA-256 mismatch'})
   if item.get(byteskey) and target.stat().st_size!=item[byteskey]:errors.append({'source':str(p.relative_to(ROOT)),'reference':ref,'error':'Manifest byte count mismatch'})
for preset in ('random','regions'):link(ROOT/'simulacao-ensemble.mjs','./ensemble-presets/'+preset+'.bin.gz')
# Validate streaming gzip checksums and equality of bundled plain counterparts.
def digest(stream):
 h=hashlib.sha256();n=0
 for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk);n+=len(chunk)
 return h.hexdigest(),n
gz_checked=[]
for p in sorted(ROOT.rglob('*.gz')):
 try:
  with gzip.open(p,'rb') as f:unpacked,size=digest(f)
  twin=p.with_suffix('')
  if twin.exists():
   with twin.open('rb') as f:plain,_=digest(f)
   if unpacked!=plain:errors.append({'source':str(p.relative_to(ROOT)),'error':'Gzip and plain counterpart differ'})
  gz_checked.append({'file':str(p.relative_to(ROOT)),'unpackedBytes':size,'plainCounterpart':twin.exists()})
 except Exception as e:errors.append({'source':str(p.relative_to(ROOT)),'error':'Invalid gzip: '+str(e)})
# Verify JavaScript syntax without executing application or contacting services.
syntax=0
if not args.node:warnings.append('Node unavailable: JavaScript syntax validation skipped; pass --node /path/to/node.')
for p in ROOT.glob('*.mjs') if args.node else []:
 r=subprocess.run([args.node,'--check',str(p)],capture_output=True,text=True)
 if r.returncode:errors.append({'source':p.name,'error':'JavaScript syntax: '+r.stderr.strip()})
 syntax+=1
report={'ok':not errors,'scope':'Pulso static package; no network access','htmlPages':len(html),'referenceChecks':len(checked),'javascriptSyntaxChecks':syntax,'gzipFiles':len(gz_checked),'gzipDetails':gz_checked,'externalUrls':sorted(externals),'errors':errors,'warnings':warnings,'limits':['Dynamic paths explicitly checked for every UF in voting/results/biometry/flows manifests.','External URLs and map tiles are recorded but not fetched.','This does not replace browser interaction checks.','The static site does not include a database or SQLite query interface.']}
(ROOT/'validacao-estatica.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ('ok','htmlPages','referenceChecks','javascriptSyntaxChecks','gzipFiles','errors','warnings')},ensure_ascii=False,indent=2))
sys.exit(0 if report['ok'] else 1)
