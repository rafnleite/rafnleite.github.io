#!/usr/bin/env python3
"""Consolida logs por minuto e forma de habilitação para o gráfico do relatório."""
import argparse
import base64
from collections import defaultdict
import gzip
import json
from pathlib import Path
import struct


ROOT = Path(__file__).resolve().parents[1]
ANALISES = ROOT / 'analises'
METHOD_INDEX = {1: 0, 3: 1, 2: 2, 0: 3, 4: 3}
METHODS = [
    {'key': 'biometria', 'label': 'Biometria', 'color': '#4c8061'},
    {'key': 'sem', 'label': 'Sem biometria', 'color': '#4f7da0'},
    {'key': 'falha', 'label': 'Falha na biometria', 'color': '#bf914a'},
    {'key': 'indeterminado', 'label': 'Indeterminado', 'color': '#929b99'},
]


def load_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def read_part(path, expected_uf, counts, uf_totals):
    part = load_json(path)
    if part.get('schemaVersion') != 2 or part.get('uf') != expected_uf:
        raise ValueError(f'Fragmento incompatível: {path}')
    row_data = part.get('rowData')
    if not row_data or row_data.get('encoding') != 'gzip-base64-u32le':
        raise ValueError(f'Dados de horários não compactados como esperado: {path}')
    packed = gzip.decompress(base64.b64decode(row_data['data'], validate=True))
    if len(packed) % 4:
        raise ValueError(f'Tamanho de linhas inválido: {path}')
    word_count = len(packed) // 4
    target = 'exterior' if expected_uf == 'ZZ' else 'brasil'
    for location in part.get('locations', []):
        offset, length = location.get('rowOffset'), location.get('rowLength')
        if not isinstance(offset, int) or not isinstance(length, int) or offset < 0 or length < 0 or offset + length > word_count:
            raise ValueError(f'Índice de horários inválido: {path}')
        for row_index in range(offset, offset + length):
            word = struct.unpack_from('<I', packed, row_index * 4)[0]
            minute = (word >> 19) - 4096
            method = (word >> 16) & 7
            count = word & 65535
            if method not in METHOD_INDEX:
                raise ValueError(f'Forma de habilitação desconhecida ({method}): {path}')
            counts[target][minute][METHOD_INDEX[method]] += count
            uf_totals[expected_uf] += count


def make_series(counts, key):
    values = counts[key]
    if not values:
        return {'start': 480, 'end': 1440, 'rows': [[0, 0, 0, 0] for _ in range(960)], 'total': 0}
    start, end = min(values), max(values) + 1
    if key == 'brasil':
        start, end = min(start, 480), max(end, 1440)
    rows = [values.get(minute, [0, 0, 0, 0]) for minute in range(start, end)]
    return {'start': start, 'end': end, 'rows': rows, 'total': sum(map(sum, rows))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dados/horarios-votos.json')
    args = parser.parse_args()
    manifest_path = ANALISES / 'voting/manifest.json'
    manifest = load_json(manifest_path)
    counts = {'brasil': defaultdict(lambda: [0, 0, 0, 0]), 'exterior': defaultdict(lambda: [0, 0, 0, 0])}
    uf_totals = defaultdict(int)
    for state in manifest['states']:
        state_path = (ANALISES / state['url']).resolve()
        document = load_json(state_path)
        if document.get('schemaVersion') != manifest['schemaVersion'] or document.get('uf') != state['uf'] or document.get('rowEncoding') != 'u32-minute4096-method3-count16':
            raise ValueError(f'Manifesto de {state["uf"]} incompatível.')
        for part in document.get('parts', []):
            read_part((state_path.parent / part['url']).resolve(), state['uf'], counts, uf_totals)
        if uf_totals[state['uf']] != state['votes']:
            raise ValueError(f'Soma de {state["uf"]} diverge do manifesto: {uf_totals[state["uf"]]} != {state["votes"]}')

    brazil = make_series(counts, 'brasil')
    exterior = make_series(counts, 'exterior')
    payload = {
        'schemaVersion': 1,
        'generatedAt': manifest['generatedAt'],
        'sourceManifest': 'analises/voting/manifest.json',
        'timeZone': manifest['timeZone'],
        'intervalMinutes': 1,
        'methods': METHODS,
        'brazil': brazil,
        'exterior': exterior,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({
        'output': str(args.output.relative_to(ROOT)),
        'bytes': args.output.stat().st_size,
        'states': len(manifest['states']),
        'brazilTotal': brazil['total'],
        'exteriorTotal': exterior['total'],
        'brazilRange': [brazil['start'], brazil['end']],
        'exteriorRange': [exterior['start'], exterior['end']],
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()