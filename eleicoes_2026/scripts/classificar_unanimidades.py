#!/usr/bin/env python3
"""Classifica seções unânimes por campos TSE e cruza coordenadas com TIs da FUNAI.

Uso: python3 scripts/classificar_unanimidades.py --shapefile /caminho/tis_poligonais.zip
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / 'dados/unanimidades-contexto.json'
SOURCE_URL = 'https://geoserver.funai.gov.br/geoserver/Funai/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=Funai%3Atis_poligonais&maxFeatures=10000&outputFormat=SHAPE-ZIP'


def decode_dbf(data):
    count = struct.unpack_from('<I', data, 4)[0]
    header_length = struct.unpack_from('<H', data, 8)[0]
    record_length = struct.unpack_from('<H', data, 10)[0]
    fields = []
    offset = 32
    while data[offset] != 0x0D:
        descriptor = data[offset:offset + 32]
        name = descriptor[:11].split(b'\0', 1)[0].decode('ascii')
        fields.append((name, descriptor[16]))
        offset += 32
    if offset + 1 != header_length or 1 + sum(width for _, width in fields) != record_length:
        raise ValueError('Estrutura DBF inconsistente.')
    records = []
    for index in range(count):
        start = header_length + index * record_length
        record = data[start:start + record_length]
        if record[:1] == b'*':
            records.append(None)
            continue
        cursor, values = 1, {}
        for name, width in fields:
            raw = record[cursor:cursor + width].strip()
            values[name] = raw.decode('cp1252', 'replace').strip()
            cursor += width
        records.append(values)
    return records


def read_shapes(data):
    if struct.unpack_from('<i', data, 32)[0] != 5:
        raise ValueError('O shapefile da FUNAI não é Polygon conforme esperado.')
    offset, shapes = 100, []
    while offset + 8 <= len(data):
        content_length = struct.unpack_from('>i', data, offset + 4)[0] * 2
        content = data[offset + 8:offset + 8 + content_length]
        offset += 8 + content_length
        shape_type = struct.unpack_from('<i', content, 0)[0]
        if shape_type == 0:
            shapes.append(None)
            continue
        if shape_type != 5:
            raise ValueError(f'Tipo de geometria inesperado: {shape_type}')
        xmin, ymin, xmax, ymax = struct.unpack_from('<4d', content, 4)
        part_count, point_count = struct.unpack_from('<2i', content, 36)
        parts_offset = 44
        starts = list(struct.unpack_from(f'<{part_count}i', content, parts_offset))
        points_offset = parts_offset + part_count * 4
        points = [struct.unpack_from('<2d', content, points_offset + index * 16) for index in range(point_count)]
        starts.append(point_count)
        rings = [points[starts[index]:starts[index + 1]] for index in range(part_count)]
        shapes.append(((xmin, ymin, xmax, ymax), rings))
    return shapes


def ring_contains(ring, x, y):
    inside = False
    previous_x, previous_y = ring[-1]
    for current_x, current_y in ring:
        cross = (x - previous_x) * (current_y - previous_y) - (y - previous_y) * (current_x - previous_x)
        if abs(cross) < 1e-10 and min(previous_x, current_x) - 1e-10 <= x <= max(previous_x, current_x) + 1e-10 and min(previous_y, current_y) - 1e-10 <= y <= max(previous_y, current_y) + 1e-10:
            return True
        if (current_y > y) != (previous_y > y):
            crossing_x = (current_x - previous_x) * (y - previous_y) / (current_y - previous_y) + previous_x
            if x < crossing_x:
                inside = not inside
        previous_x, previous_y = current_x, current_y
    return inside


def polygon_covers(shape, x, y):
    if shape is None:
        return False
    (xmin, ymin, xmax, ymax), rings = shape
    if not (xmin <= x <= xmax and ymin <= y <= ymax):
        return False
    inside = False
    for ring in rings:
        if ring_contains(ring, x, y):
            inside = not inside
    return inside


def read_tis(path):
    with zipfile.ZipFile(path) as archive:
        names = {Path(name).name.lower(): name for name in archive.namelist()}
        dbf_name = names.get('tis_poligonais.dbf')
        shp_name = names.get('tis_poligonais.shp')
        prj_name = names.get('tis_poligonais.prj')
        if not dbf_name or not shp_name:
            raise ValueError('O ZIP precisa conter tis_poligonais.shp e .dbf.')
        if prj_name and '4674' not in archive.read(prj_name).decode('utf-8', 'replace'):
            raise ValueError('Projeção do shapefile não é SIRGAS 2000 / EPSG:4674.')
        records = decode_dbf(archive.read(dbf_name))
        shapes = read_shapes(archive.read(shp_name))
    if len(records) != len(shapes):
        raise ValueError('Quantidades de registros DBF e SHP divergem.')
    return [(shape, record.get('terrai_nom', '').strip()) for shape, record in zip(shapes, records) if shape and record]


def normalize_name(value):
    import unicodedata
    return ''.join(char for char in unicodedata.normalize('NFD', value.upper()) if unicodedata.category(char) != 'Mn')


def textual_labels(row):
    name = normalize_name(row['local'])
    labels = []
    if int(row['eleitores_aptos']) < 100:
        labels.append('Menos de 100 eleitores aptos (BU do TSE)')
    if 'INDIG' in name or 'ALDEIA' in name:
        labels.append('Referência indígena/aldeia no nome do local (TSE)')
    if any(term in name for term in ('PRESID', 'CADEIA', 'DETENCAO', 'PRISION', 'PENITENCI')):
        labels.append('Unidade prisional no nome do local (TSE)')
    if 'QUILOMB' in name:
        labels.append('Referência quilombola no nome do local (TSE)')
    if 'ASSENTAMENTO' in name:
        labels.append('Assentamento no nome do local (TSE); vínculo ao MST não confirmado')
    if 'POVOADO' in name or 'ZONA RURAL' in name:
        labels.append('Povoado/zona rural no nome do local (TSE)')
    return labels


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shapefile', type=Path, required=True, help='ZIP tis_poligonais oficial da FUNAI')
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    shapes = read_tis(args.shapefile)
    digest = hashlib.sha256(args.shapefile.read_bytes()).hexdigest()
    with (ROOT / 'dados/unanimidades.csv').open(encoding='utf-8-sig', newline='') as source:
        rows = list(csv.DictReader(source, delimiter=';'))
    output_rows, counters = [], {}
    for row in rows:
        labels = textual_labels(row)
        x, y = row['longitude'], row['latitude']
        matching = []
        if x and y:
            longitude, latitude = float(x), float(y)
            matching = sorted({name for shape, name in shapes if name and polygon_covers(shape, longitude, latitude)})
        for name in matching:
            labels.append(f'Coordenada do local dentro da Terra Indígena {name} (FUNAI)')
        for label in labels:
            key = label.split(' (')[0]
            counters[key] = counters.get(key, 0) + 1
        if labels:
            output_rows.append({
                'key': f"{row['uf']}:{row['municipio_codigo']}:{row['zona']}:{row['secao']}",
                'labels': labels,
                'terras_indigenas': matching,
            })
    payload = {
        'fonte': SOURCE_URL,
        'camada': 'Funai:tis_poligonais',
        'crs': 'EPSG:4674 (SIRGAS 2000)',
        'sha256_shapefile_zip': digest,
        'metodo': 'Ponto de coordenada do local eleitoral contido em polígono oficial; demais rótulos derivados do nome cadastral TSE e eleitores aptos do BU.',
        'contagens': counters,
        'secoes_rotuladas': output_rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    tamakaya = [row for row in output_rows if row['key'].startswith('AC:1074:4:457')]
    print(json.dumps({
        'output': str(args.output),
        'bytes': args.output.stat().st_size,
        'tiPolygons': len(shapes),
        'sections': len(rows),
        'labelledSections': len(output_rows),
        'counts': counters,
        'tamakaya': tamakaya,
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
