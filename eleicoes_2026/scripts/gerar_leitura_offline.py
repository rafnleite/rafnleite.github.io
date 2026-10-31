#!/usr/bin/env python3
"""Gera uma cópia de leitura com gráficos, bibliotecas e dados incorporados."""
import base64
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
html = (root / 'index.html').read_text()
for src in ['assets/relatorio.css', 'analises/vendor/leaflet.css']:
    html = html.replace(f'<link rel="stylesheet" href="{src}">', '<style>' + (root / src).read_text() + '</style>')
for src in ['analises/vendor/echarts.min.js', 'analises/vendor/leaflet.js']:
    script = (root / src).read_text().replace('</script', '<\\/script')
    html = html.replace(f'<script defer src="{src}"></script>', '<script>' + script + '</script>')
profile = base64.b64encode((root / 'assets/perfil.jpg').read_bytes()).decode()
html = html.replace('src="assets/perfil.jpg"', f'src="data:image/jpeg;base64,{profile}"')
script = (root / 'assets/relatorio.mjs').read_text()
start = script.index("const data=await fetch('dados/resumo-dados.json')")
end = script.index('\nif(data)', start)
script = script[:start] + "const data=JSON.parse(document.getElementById('offline-data').textContent);" + script[end:]
script = script.replace("fetch('analises/state-boundaries.geojson').then(r=>r.json())", "Promise.resolve(JSON.parse(document.getElementById('offline-boundaries').textContent))")
embedded = ''
for identifier, src in [('offline-data', 'dados/resumo-dados.json'), ('offline-boundaries', 'analises/state-boundaries.geojson')]:
    contents = (root / src).read_text().replace('</', '<\\/')
    embedded += f'<script type="application/json" id="{identifier}">{contents}</script>\n'
html = html.replace('<script type="module" src="assets/relatorio.mjs"></script>', '')
# Bibliotecas podem conter strings com </body>. Inserir apenas no fechamento real.
before, after = html.rsplit('</body>', 1)
html = before + embedded + '<script type="module">' + script.replace('</script', '<\\/script') + '</script></body>' + after
html = re.sub(r'<button data-embed="[^"]+">.*?</button>', '', html)
html = html.replace('<div class="meta">', '<div class="note neutral"><p><strong>Versão para leitura offline.</strong> Os gráficos e o mapa deste relatório funcionam sem servidor. As páginas completas de análise integram este mesmo site e devem ser abertas na versão hospedada no GitHub Pages ou pela visualização local descrita nas instruções.</p></div><div class="meta">', 1)
out = root / 'leitura-offline.html'
out.write_text(html)
print(f'Leitura offline criada: {out.stat().st_size} bytes')
