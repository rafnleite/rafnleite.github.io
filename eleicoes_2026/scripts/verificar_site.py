#!/usr/bin/env python3
"""Confere os destinos locais do relatório e a portabilidade do pacote estático."""
import argparse
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
import shutil
import subprocess
from urllib.parse import unquote, urlsplit


class Document(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.ids = set()
        self.links = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get('id'):
            self.ids.add(a['id'])
        for key in ('href', 'src'):
            if a.get(key):
                self.links.append(a[key])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', help='Caminho opcional para verificar sintaxe JavaScript')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    files = [p for p in root.rglob('*') if p.is_file()]
    errors = []
    checked = 0
    documents = {}
    for p in root.rglob('*.html'):
        documents[p] = Document(p.read_text())
    for p, doc in documents.items():
        for link in doc.links:
            url = urlsplit(link)
            if url.scheme or url.netloc:
                continue
            if url.path.startswith('/'):
                errors.append(f'Endereço não relativo: {p.relative_to(root)}: {link}')
                continue
            dest = (p.parent / unquote(url.path)).resolve() if url.path else p
            if dest.is_dir():
                dest = dest / 'index.html'
            checked += 1
            if not dest.is_file():
                errors.append(f'Ausente: {p.relative_to(root)}: {link}')
            elif url.fragment and dest in documents and unquote(url.fragment) not in documents[dest].ids:
                errors.append(f'Âncora ausente: {p.relative_to(root)}: {link}')
    node = args.node or shutil.which('node')
    js_checked = 0
    if node:
        for p in root.rglob('*.mjs'):
            r = subprocess.run([node, '--check', str(p)], capture_output=True, text=True)
            js_checked += 1
            if r.returncode:
                errors.append(f'Sintaxe JavaScript: {p.relative_to(root)}: {r.stderr}')
    size = sum(p.stat().st_size for p in files)
    if size >= 1_000_000_000:
        errors.append('Pacote descompactado excede 1 GB.')
    large = [str(p.relative_to(root)) for p in files if p.stat().st_size >= 100_000_000]
    if large:
        errors.append(f'Arquivos com pelo menos 100 MB: {large}')
    # O hash é das cópias incluídas. Não certifica origem ou publicação histórica.
    hashes = []
    for p in sorted((root / 'dados').iterdir()):
        if p.is_file() and p.name not in {'SHA256SUMS.txt', 'validacao-site.json'}:
            hashes.append(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(root)}')
    (root / 'dados/SHA256SUMS.txt').write_text('\n'.join(hashes) + '\n')
    result = dict(ok=not errors, paginas_html=len(documents), referencias_locais=checked,
                  modulos_verificados=js_checked, javascript_verificado=bool(node),
                  arquivos=len(files), bytes_descompactados=size,
                  arquivos_maiores_ou_iguais_100mb=large, erros=errors)
    (root / 'dados/validacao-site.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
