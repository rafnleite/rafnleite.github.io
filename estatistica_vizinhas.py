"""Compara votos presidenciais apenas entre seções do mesmo local e turno.

analisar_turno recebe {local: {secao: (marcada, {candidato: votos}, brancos, nulos)}}.
As chaves de local e seção retornam intactas. Votos omitidos de um candidato valem zero.
None em brancos ou nulos indica dado ausente e impede o cálculo das duas proporções
sobre o total de votos. Os indicadores de candidatura usam apenas os votos válidos.
As distâncias e diferenças de proporções estão expressas em pontos percentuais.
"""
from bisect import bisect_left
from collections import Counter, defaultdict
from itertools import combinations
from math import comb, fsum, sqrt
from numbers import Integral
from random import Random


def _contagem(valor):
    if not isinstance(valor, Integral) or isinstance(valor, bool) or valor < 0:
        raise ValueError(f"Contagem de votos inválida: {valor!r}")
    return int(valor)


def _validar_resultado(resultado, candidatos):
    marcada, votos, brancos, nulos = resultado
    votos = {str(num): _contagem(v) for num, v in votos.items()}
    extras = [num for num, v in votos.items() if num not in candidatos and v]
    if extras:
        raise ValueError(f"Votos positivos fora da lista de candidatos: {extras}")
    return (bool(marcada), tuple(votos.get(num, 0) for num in candidatos),
            None if brancos is None else _contagem(brancos), None if nulos is None else _contagem(nulos))


def _soma_completa(valores):
    return None if any(v is None for v in valores) else sum(valores)


def _distancia(votos, soma, votos_total, soma_total):
    """TV entre uma seção e as demais; forma inteira até a última divisão."""
    numerador = sum(abs(v * soma_total - t * soma) for v, t in zip(votos, votos_total, strict=True))
    return 50 * numerador / (soma * (soma_total - soma))


def _distancia_entre(votos, soma, base, soma_base):
    numerador = sum(abs(v * soma_base - b * soma) for v, b in zip(votos, base, strict=True))
    return 50 * numerador / (soma * soma_base)


def _distribuicao(amostra, n):
    """Cada tupla contém valor e peso; quantil pela distribuição empírica."""
    if not amostra:
        return dict.fromkeys(("media", "mediana", "p90", "p95", "maximo")) | {"n": 0}
    ordenada = sorted(amostra)
    total = fsum(peso for _, peso in ordenada)
    media = fsum(valor * peso for valor, peso in ordenada) / total
    percentis = iter((("mediana", .5), ("p90", .9), ("p95", .95)))
    proximo = next(percentis)
    acumulado = 0.
    resumo = {"n": n, "media": media, "maximo": ordenada[-1][0]}
    for valor, peso in ordenada:
        acumulado += peso
        while proximo and acumulado >= total * proximo[1] - 1e-11 * total:
            resumo[proximo[0]] = valor
            proximo = next(percentis, None)
        if proximo is None:
            break
    return resumo


def _amostra_simples(valores):
    return _distribuicao([(v, 1.) for v in valores], len(valores))


def _distribuicao_acumulada(distancias, referencia):
    """Distribui cada observação no primeiro corte inclusivo e acumula seu peso."""
    cortes = range(21)
    n = len(distancias)
    def percentuais(amostra):
        classes = [0.] * len(cortes)
        for distancia, peso in amostra:
            indice = bisect_left(cortes, distancia - 1e-10)
            if indice < len(cortes):
                classes[indice] += peso
        acumulado = 0.
        resultado = []
        for peso in classes:
            acumulado += peso
            resultado.append(min(100., 100 * acumulado / n) if n else None)
        return resultado
    marcadas = percentuais((d, 1.) for d in distancias)
    controles = percentuais(referencia)
    return [dict(limiar_pp=k, marcadas_pct=m, referencia_pct=c)
            for k, m, c in zip(cortes, marcadas, controles, strict=True)]


def _resumo_proporcoes(pares):
    nomes = ("media_secao_pct", "media_vizinhas_pct", "diferenca_media_pp",
             "diferenca_absoluta_media_pp", "mediana_diferenca_pp")
    if not pares:
        return dict.fromkeys(nomes) | {"n": 0}
    difs = [x - y for x, y in pares]
    n = len(difs)
    return dict(n=n, media_secao_pct=fsum(x for x, _ in pares) / n,
                media_vizinhas_pct=fsum(y for _, y in pares) / n,
                diferenca_media_pp=fsum(difs) / n, diferenca_absoluta_media_pp=fsum(map(abs, difs)) / n,
                mediana_diferenca_pp=_amostra_simples(difs)["mediana"])


def _teste_permutacao(estratos, repeticoes, semente):
    """Permuta rótulos condicionalmente ao número de marcadas de cada local.

    O escore é a distância de cada seção à soma de TODAS as outras seções válidas
    de seu local. Assim o escore de uma seção permanece idêntico em todas as permutações.
    Os sorteios de subconjuntos no local são uniformes e sem reposição. A cauda
    superior testa excesso de discrepância, o IC nulo é o intervalo central das simulações.
    """
    base = {"n_permutacoes": repeticoes, "semente": semente}
    if not estratos:
        return base | {"n_secoes": 0, "n_locais_informativos": 0} | dict.fromkeys(
            ("observado_pp", "esperado_pp", "excesso_pp", "p_superior", "p_inferior", "p025_pp", "p975_pp",
             "desvio_nulo_pp"))
    rng = Random(semente)
    sims = [0.] * repeticoes
    previsto = observado = variancia = 0.
    n_marcadas = n_informativos = 0
    for m, escores in estratos:
        n = len(escores)
        soma = fsum(escores)
        media = soma / n
        n_marcadas += m
        previsto += m * media
        observado += fsum(escores[:m])
        desvios = [v - media for v in escores]
        if max(escores) - min(escores) < 1e-12:
            continue
        n_informativos += 1
        variancia += m * (n - m) / (n * (n - 1)) * fsum(d * d for d in desvios)
        # Somar a minoria economiza sorteios. Pelo centramento a soma do
        # complemento tem sinal oposto. A expectativa condicional volta ao final.
        k = min(m, n - m)
        if m > n - m:
            desvios = [-d for d in desvios]
        if k == 1:
            sorteios = rng.choices(desvios, k=repeticoes)
        elif comb(n, k) <= 256:
            possiveis = [fsum(grupo) for grupo in combinations(desvios, k)]
            sorteios = rng.choices(possiveis, k=repeticoes)
        else:
            sorteios = (fsum(rng.sample(desvios, k)) for _ in range(repeticoes))
        sims = [acumulado + novo for acumulado, novo in zip(sims, sorteios, strict=True)]
    desv_obs = (observado - previsto) / n_marcadas
    sims = sorted(x / n_marcadas for x in sims)
    media_nula = previsto / n_marcadas
    return base | dict(n_secoes=n_marcadas, n_locais_informativos=n_informativos,
                       observado_pp=observado / n_marcadas, esperado_pp=media_nula, excesso_pp=desv_obs,
                       desvio_nulo_pp=sqrt(variancia) / n_marcadas,
                       p_superior=(1 + sum(x >= desv_obs - 1e-12 for x in sims)) / (repeticoes + 1),
                       p_inferior=(1 + sum(x <= desv_obs + 1e-12 for x in sims)) / (repeticoes + 1),
                       p025_pp=media_nula + sims[(25 * repeticoes - 1) // 1000],
                       p975_pp=media_nula + sims[(975 * repeticoes - 1) // 1000])


def analisar_turno(locais, candidatos, principal, *, permutacoes=1999, semente=20261125):
    """Devolve uma linha por marcada e um resumo, com peso igual por seção comparável."""
    candidatos = tuple(map(str, candidatos))
    principal = str(principal)
    if not candidatos or len(set(candidatos)) != len(candidatos) or principal not in candidatos:
        raise ValueError("Verifique a lista de candidatos e o candidato principal")
    if permutacoes < 0:
        raise ValueError("O número de permutações deve ser não negativo")
    linhas = []
    estratos = []
    referencia = []
    distancias_independentes = []
    referencias_independentes = []
    n_locais_independentes = 0
    proporcoes = defaultdict(list)
    n_controles = n_elegiveis = n_cauda = n_pares = 0
    esperado_cauda = 0.
    for local in sorted(locais):
        registros = locais[local]
        if not any(r[0] for r in registros.values()):
            continue
        marcadas, controles = [], []
        for secao in sorted(registros):
            marcada, votos, b, n = _validar_resultado(registros[secao], candidatos)
            urna = (secao, votos, sum(votos), b, n)
            if marcada:
                marcadas.append(urna)
            elif urna[2] > 0:
                controles.append(urna)
        validas = [u for u in marcadas if u[2]]
        c = len(controles)
        totais_c = tuple(sum(u[1][j] for u in controles) for j in range(len(candidatos)))
        validos_c = sum(totais_c)
        brancos_c = _soma_completa([u[3] for u in controles]) if c else None
        nulos_c = _soma_completa([u[4] for u in controles]) if c else None
        excessos_independentes = {}
        if validas and c >= 2:
            # Cada par (marcada, controle j) usa a mesma base de C-1 controles.
            # As bases e a média dos controles valem para todas as marcadas do local.
            bases = [(tuple(t-v for t, v in zip(totais_c, u[1], strict=True)), validos_c - u[2])
                     for u in controles]
            media_controles = fsum(_distancia_entre(u[1], u[2], base, soma_base)
                                   for u, (base, soma_base) in zip(controles, bases, strict=True)) / c
            n_locais_independentes += 1
            for u in validas:
                media_marcada = fsum(_distancia_entre(u[1], u[2], base, soma_base)
                                     for base, soma_base in bases) / c
                excessos_independentes[u[0]] = media_marcada - media_controles
                distancias_independentes.append(media_marcada)
                referencias_independentes.append(media_controles)
        if validas and c:
            n_controles += c
            if permutacoes:
                totais = tuple(vc + sum(u[1][j] for u in validas) for j, vc in enumerate(totais_c))
                total = sum(totais)
                estratos.append((len(validas), [_distancia(u[1], u[2], totais, total) for u in validas + controles]))
        for secao, votos, validos, brancos, nulos in marcadas:
            situacao = "comparavel" if validos and c else ("sem_controle" if validos else "sem_votos_validos")
            linha = dict(local=local, secao=secao, situacao=situacao, n_marcadas_local=len(marcadas),
                         n_controles_validos=c, validos_secao=validos, validos_vizinhas=validos_c,
                         brancos_secao=brancos, brancos_vizinhas=brancos_c, nulos_secao=nulos, nulos_vizinhas=nulos_c,
                         distancia_pp=None, referencia_media_pp=None, excesso_pp=None, p_local=None,
                         excesso_controles_independentes_pp=excessos_independentes.get(secao),
                         pct_principal_secao=None, pct_principal_vizinhas=None, dif_principal_pp=None,
                         dif_brancos_pp=None, dif_nulos_pp=None)
            linhas.append(linha)
            for num, v, t in zip(candidatos, votos, totais_c, strict=True):
                linha[f"votos_{num}_secao"] = v
                linha[f"votos_{num}_vizinhas"] = t if c else None
                linha[f"dif_{num}_pp"] = None
            if situacao != "comparavel":
                continue
            for num, v, t in zip(candidatos, votos, totais_c, strict=True):
                x, y = 100 * v / validos, 100 * t / validos_c
                proporcoes[num].append((x, y))
                linha[f"dif_{num}_pp"] = x - y
                if num == principal:
                    linha.update(pct_principal_secao=x, pct_principal_vizinhas=y, dif_principal_pp=x-y)
            if None not in (brancos, nulos, brancos_c, nulos_c):
                total_secao = validos + brancos + nulos
                total_controles = validos_c + brancos_c + nulos_c
                for campo, v, t in (("brancos", brancos, brancos_c), ("nulos", nulos, nulos_c)):
                    x, y = 100 * v / total_secao, 100 * t / total_controles
                    proporcoes[campo].append((x, y))
                    linha[f"dif_{campo}_pp"] = x - y
            # Mesmo conjunto de C+1 seções para medir tanto a marcada quanto
            # cada controle mascarado. Cada uma é comparada à soma das outras C.
            totais = tuple(v+t for v,t in zip(votos, totais_c, strict=True))
            total = validos + validos_c
            distancia = _distancia(votos, validos, totais, total)
            escores = [_distancia(u[1], u[2], totais, total) for u in controles]
            media_ref = fsum(escores) / c
            referencia.extend((d, 1/c) for d in escores)
            n_pares += c
            todos = [round(d, 10) for d in [distancia, *escores]]
            posicao = sum(d >= todos[0] for d in todos)
            n_local = c + 1
            p_local = posicao / n_local
            linha.update(distancia_pp=distancia, referencia_media_pp=media_ref, excesso_pp=distancia - media_ref,
                         p_local=p_local)
            if n_local >= 20:
                n_elegiveis += 1
                n_cauda += p_local <= .05
                # A massa da cauda pode ser <5% com poucos postos ou empates.
                limite = n_local // 20
                ordenados = sorted(todos, reverse=True)
                corte = ordenados[limite]  # quem empata com o posto seguinte fica fora
                esperado_cauda += sum(d > corte for d in todos) / n_local

    comparaveis = [r for r in linhas if r["situacao"] == "comparavel"]
    n = len(comparaveis)
    distancias = [r["distancia_pp"] for r in comparaveis]
    referencia_resumo = _distribuicao(referencia, n)
    limiar = referencia_resumo["p95"]
    acima = sum(d > limiar + 1e-10 for d in distancias) if n else 0
    ref_acima = fsum(w for d, w in referencia if d > limiar + 1e-10) if n else 0
    ni = len(distancias_independentes)
    media_m = fsum(distancias_independentes) / ni if ni else None
    media_c = fsum(referencias_independentes) / ni if ni else None
    resumo = dict(n_marcadas=len(linhas), n_comparaveis=n, n_locais_comparaveis=len({r["local"] for r in comparaveis}),
                  n_controles_distintos=n_controles, n_pares_referencia=n_pares,
                  situacoes=dict(Counter(r["situacao"] for r in linhas)),
                  distancia=_amostra_simples(distancias), referencia=referencia_resumo,
                  excesso=_amostra_simples([r["excesso_pp"] for r in comparaveis]),
                  semelhanca={p: sum(d <= p + 1e-10 for d in distancias) for p in (2, 5, 10)},
                  distribuicao_acumulada=_distribuicao_acumulada(distancias, referencia),
                  controles_independentes=dict(n_marcadas=ni, n_locais=n_locais_independentes,
                                               media_marcadas_pp=media_m, media_controles_pp=media_c,
                                               diferenca_pp=media_m - media_c if ni else None),
                  extremos=dict(limiar_p95_ref_pp=limiar, n_acima=acima,
                                pct_acima=100*acima/n if n else None,
                                pct_referencia_acima=100*ref_acima/n if n else None),
                  cauda=dict(n_elegiveis=n_elegiveis, n_cauda=n_cauda, esperado_n=esperado_cauda, limiar=.05),
                  candidatos={num: _resumo_proporcoes(proporcoes[num]) for num in candidatos},
                  brancos=_resumo_proporcoes(proporcoes["brancos"]), nulos=_resumo_proporcoes(proporcoes["nulos"]),
                  permutacao=_teste_permutacao(estratos, permutacoes, semente) if permutacoes else None)
    return linhas, resumo
