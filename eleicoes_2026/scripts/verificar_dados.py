#!/usr/bin/env python3
"""Valida os agregados publicados e exporta CSVs; requer apenas Python 3.

Uso: python3 scripts/verificar_dados.py
      python3 scripts/verificar_dados.py --site /caminho/do/relatorio

Uma divergência documentada entre o extrato local e as tabelas externas não
é convertida em igualdade nem em erro da soma. O processo retorna código 1
somente quando uma verificação de integridade interna falha.
"""
from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime, timezone
import argparse, csv, hashlib, json, math, sys


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def write_csv(path, fields, rows):
    with path.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(fields)
        w.writerows(rows)


def validate(site):
    data = site / 'dados'
    s, o = read(data / 'resumo-dados.json'), read(data / 'oficial-pos17.json')
    checks, differences = [], []

    def check(name, ok, observed=None, expected=None):
        item = {'verificacao': name, 'ok': bool(ok)}
        if observed is not None:
            item['observado'] = observed
        if expected is not None:
            item['esperado'] = expected
        checks.append(item)

    def eq(name, observed, expected):
        check(name, observed == expected, observed, expected)

    def difference(name, local, external, note):
        differences.append({'tema': name, 'extrato_local': local,
                            'referencia_externa': external,
                            'diferenca_local_menos_externa': local - external,
                            'situacao': 'documentada; sem causa presumida', 'nota': note})

    e, official = s['encerramento'], o['resultado_nacional']
    total, brazil, exterior = e['com_exterior'], e['brasil'], e['exterior']
    eq('ano e turno do extrato local', [s['meta']['ano'], s['meta']['turno']], [2026, 2])
    for name, row in [('Brasil', brazil), ('Brasil e exterior', total)]:
        eq('votos classificados somam comparecimento: ' + name,
           row['lula'] + row['flavio'] + row['brancos'] + row['nulos'], row['comparecimento'])
    for k, ek in [('secoes', 'sections'), ('lula', 'lula'), ('flavio', 'flavio'),
                  ('comparecimento', 'total'), ('brancos', 'white'), ('nulos', 'invalid')]:
        eq('Brasil + exterior: ' + k, brazil[k] + exterior[ek], total[k])
    for local, ext in [('lula', 'Lula'), ('flavio', 'Flavio'), ('comparecimento', 'comparecimento'),
                       ('secoes', 'secoes_instaladas')]:
        eq('total local confere com resultado nacional: ' + local, total[local], official[ext])
    eq('margem final', total['lula'] - total['flavio'], official['diferenca'])
    eq('margem nos metadados', s['meta']['margem_final'], official['diferenca'])
    eq('válidos nacionais', total['lula'] + total['flavio'], official['validos'])
    eq('seções instaladas + não instaladas', official['secoes_instaladas'] + official['secoes_nao_instaladas'], official['secoes_esperadas'])
    eq('seções cadastradas na cobertura', sum(r['expected'] for r in e['coverage']), official['secoes_esperadas'])
    eq('BUs na cobertura', sum(r['bus'] for r in e['coverage']), total['secoes'])

    close = s['encerramento_por_minuto']['rows']
    for index, k in enumerate(['secoes', 'lula', 'flavio', 'comparecimento', 'brancos', 'nulos'], 1):
        eq('histograma de encerramento soma Brasil: ' + k, sum(r[index] for r in close), brazil[k])
    eq('BUs a partir das 19h no histograma', sum(r[1] for r in close if r[0] >= 1140), e['brasil_a_partir19']['secoes'])
    eq('comparecimento de BUs a partir das 19h', sum(r[4] for r in close if r[0] >= 1140), e['brasil_a_partir19']['comparecimento'])

    curve = s['curva']['rows']
    eq('curva sem lacunas, de 16h59 a 17h15', [r[0] for r in curve], list(range(61140, 62101)))
    check('curva acumulada não diminui', all(all(b[i] >= a[i] for i in [1, 2, 3]) for a, b in zip(curve, curve[1:])))
    by_time = {r[0]: r for r in curve}
    eq('corte anterior 17h06min43s', by_time[61603][2], 59806238)
    eq('corte inclusivo 17h06min44s', by_time[61604][2], 59832485)
    eq('referência fixa é votação FINAL de Flávio', s['curva']['referencia_flavio_final'], official['Flavio'])
    check('primeiro cruzamento da referência final às 17h06min44s',
          by_time[61603][2] < official['Flavio'] <= by_time[61604][2])
    for t in [61603, 61604]:
        eq('curva e corte consolidado no segundo ' + str(t), by_time[t][2:4],
           [e['ate_' + str(t)]['lula_com_exterior'], e['ate_' + str(t)]['flavio_com_exterior']])
    check('hipótese do exterior integral explicitada', s['curva']['exterior_saldo_inicial'] is True)

    voting = s['votos_por_minuto']['rows']
    logs_brazil = [r for r in s['logs_por_uf'] if r['uf'] != 'ZZ']
    log_total = sum(r['votos'] for r in logs_brazil)
    log17 = sum(r['a_partir17'] for r in logs_brazil)
    log19 = sum(r['a_partir19'] for r in logs_brazil)
    eq('histograma de confirmações soma votos nos logs Brasil', sum(sum(r[1:]) for r in voting), log_total)
    eq('histograma >=17h confere com logs por UF', sum(sum(r[1:]) for r in voting if r[0] >= 1020), log17)
    eq('histograma >=19h confere com logs por UF', sum(sum(r[1:]) for r in voting if r[0] >= 1140), log19)
    eq('contagem local >=17h preservada', log17, 34126)
    eq('contagem local >=19h preservada', log19, 11)

    histogram_rows = []
    for key in ['histograma_biometria_bu', 'histograma_biometria_logs']:
        h = s[key]
        eq(key + ': 100 faixas de um ponto percentual', len(h['bins_1pp']), 100)
        eq(key + ': frequência soma universo', sum(h['bins_1pp']), h['n'])
        eq(key + ': abaixo de 5%', sum(h['bins_1pp'][:5]), h['menor5'])
        eq(key + ': abaixo de 10%', sum(h['bins_1pp'][:10]), h['menor10'])
        eq(key + ': a partir de 50%', sum(h['bins_1pp'][50:]), h['maior50'])
        check(key + ': zero cabe na primeira faixa', 0 <= h['zero'] <= h['bins_1pp'][0])
        lower = sum(i * n for i, n in enumerate(h['bins_1pp'])) / h['n']
        check(key + ': média compatível com frequências', lower <= h['media'] <= lower + 1)
        median_bin = next(i for i in range(100) if sum(h['bins_1pp'][:i+1]) >= (h['n']+1)/2)
        check(key + ': mediana compatível com frequências', median_bin <= h['mediana'] <= median_bin+1)
        acc = 0
        for i, n in enumerate(h['bins_1pp']):
            acc += n
            histogram_rows.append([key.removeprefix('histograma_'), i, i + 1,
                                   'fechado' if i == 99 else 'aberto', n,
                                   h['n'], n / h['n'] * 100, acc, acc / h['n'] * 100])
    for p in s['evolucao_biometria']['periods']:
        label = str(p['ano']) + '/' + str(p['turno'])
        t = p['total']
        eq('biometria geral soma comparecimento: ' + label,
           t['biometria'] + t['falha_biometria'] + t['sem_biometria'], t['comparecimento'])
        for k in ['biometria', 'falha_biometria', 'sem_biometria']:
            check('taxa biométrica ' + label + ': ' + k,
                  math.isclose(p['percentuais'][k], t[k] / t['comparecimento'] * 100, abs_tol=1e-10))
    eq('universo histograma BU confere Brasil', s['histograma_biometria_bu']['n'], brazil['secoes'])

    unanim = s['unanimidades']
    identities = [(r['uf'], r['municipio_codigo'], r['zona'], r['secao']) for r in unanim]
    eq('unanimidades sem identidades repetidas', len(set(identities)), len(unanim))
    eq('quantidade de unanimidades', len(unanim), 110)
    eq('unanimidades por candidato', dict(Counter('Lula' if r['lula'] else 'Flávio' for r in unanim)), {'Lula': 106, 'Flávio': 4})
    check('unanimidades têm exatamente um candidato com votos', all((r['lula'] > 0) != (r['flavio'] > 0) for r in unanim))
    check('unanimidades somam comparecimento', all(r['lula'] + r['flavio'] + r['brancos'] + r['nulos'] == r['comparecimento'] for r in unanim))
    check('unanimidades têm BU oficial', all(r['url'].startswith('https://resultados.tse.jus.br/') for r in unanim))
    mapped = [r for r in unanim if r['latitude'] is not None and r['longitude'] is not None]
    missing = [dict(uf=r['uf'], municipio=r['municipio'], zona=r['zona'], secao=r['secao']) for r in unanim if r['latitude'] is None or r['longitude'] is None]
    eq('unanimidades com coordenadas disponíveis', len(mapped), 106)
    check('coordenadas presentes são válidas', all(-90 <= r['latitude'] <= 90 and -180 <= r['longitude'] <= 180 for r in mapped))

    for name, t in o['tabelas'].items():
        check('tabela externa sem UFs duplicadas: ' + name, len({r['uf'] for r in t['rows']}) == len(t['rows']))
        check('tabela externa soma faixas por UF: ' + name,
              all(r['votos_17_18'] + r['votos_18_19'] + r['votos_apos19'] == r['total_votos_apos17_nestas_secoes'] for r in t['rows']))
        for k, n in t['totais'].items():
            eq('tabela externa soma UFs: ' + name + '/' + k, sum(r[k] for r in t['rows']), n)
    difference('confirmações a partir/apos 17h', log17, o['tabelas']['apos17']['totais']['total_votos_apos17_nestas_secoes'], 'Extrato local usa >=17:00:00; tabela externa mantém o critério e o universo de sua fonte. Não forçar equivalência.')
    difference('confirmações a partir/apos 19h', log19, o['tabelas']['apos17']['totais']['votos_apos19'], 'As duas fontes têm cobertura e critérios próprios; diferença não foi reconciliada por seção.')
    difference('seções encerradas a partir/apos 19h', e['brasil_a_partir19']['secoes'], o['tabelas']['apos19']['totais']['secoes_encerradas_apos_corte'], 'Local: encerramento de BU em Brasília >=19h. Tabela externa: critério da publicação original; causa da diferença não presumida.')

    # Opcional: confronto com a fonte compacta integral incluída no Pulso.
    original = site / 'analises' / 'apuracao-encerramento.json'
    if original.exists():
        base = read(original)
        grouped = defaultdict(lambda: [0, 0, 0])
        for uf, t, count, lula, flavio, *_ in base['rows']:
            if uf != 'ZZ':
                grouped[t][0] += count
                grouped[t][1] += lula
                grouped[t][2] += flavio
        state = [0, base['initialExterior']['lula'], base['initialExterior']['flavio']]
        rebuilt = []
        for t in range(61140, 62101):
            state = [a + b for a, b in zip(state, grouped[t])]
            rebuilt.append([t, *state])
        check('curva recomposta da fonte integral Pulso', rebuilt == curve)
        eq('carimbo da fonte integral Pulso', base['sourceSnapshot'], s['meta']['gerado_base_bu'])

    provenance = data / 'proveniencia.json'
    if provenance.exists():
        for item in read(provenance).get('entradas_publicadas', []):
            path = site / item['arquivo']
            check('hash da fonte publicada: ' + item['arquivo'], path.exists() and sha256(path) == item['sha256'])

    fields = ['uf', 'municipio', 'municipio_codigo', 'zona', 'secao', 'local', 'eleitores_aptos',
              'comparecimento', 'lula', 'flavio', 'brancos', 'nulos', 'latitude', 'longitude', 'url']
    write_csv(data / 'unanimidades.csv', fields, ([r[k] for k in fields] for r in unanim))
    write_csv(data / 'biometria-histograma.csv',
              ['fonte', 'inicio_percentual_inclusivo', 'fim_percentual', 'limite_superior', 'urnas',
               'universo', 'percentual_urnas', 'urnas_acumuladas', 'percentual_acumulado'], histogram_rows)
    write_csv(data / 'curva-encerramento.csv',
              [*s['curva']['columns'], 'referencia_flavio_final', 'exterior_integral_saldo_inicial'],
              ([*r, official['Flavio'], True] for r in curve))
    result = {'gerado_em_utc': datetime.now(timezone.utc).isoformat(),
              'ok': all(c['ok'] for c in checks), 'verificacoes': len(checks),
              'aprovadas': sum(c['ok'] for c in checks),
              'falhas': [c for c in checks if not c['ok']],
              'divergencias_entre_fontes': differences,
              'cobertura_mapa_unanimidades': {'mapeadas': len(mapped), 'total': len(unanim), 'sem_coordenadas': missing},
              'limite': 'Integridade e consistência dos arquivos publicados; não certifica segurança do sistema eleitoral nem verifica a data histórica de cada download.',
              'entradas': {name: sha256(data / name) for name in ['resumo-dados.json', 'oficial-pos17.json']},
              'checagens': checks}
    (data / 'validacao.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: result[k] for k in ['ok', 'verificacoes', 'aprovadas', 'falhas', 'divergencias_entre_fontes']}, ensure_ascii=False, indent=2))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, default=Path(__file__).resolve().parents[1])
    sys.exit(validate(parser.parse_args().site.resolve()))
