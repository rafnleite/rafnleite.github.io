"""Teste TOST do excesso médio de distância da votação em pontos percentuais.

Cada seção-turno comparável tem peso um. O excesso da seção é sua distância à
votação local menos a distância média de referência calculada para ela. A média
descreve exatamente as seções observadas. O IC é uma inferência de modelo para
locais comparáveis, admitindo independência entre conglomerados e dependência
arbitrária entre seções de um mesmo conglomerado.

Para cada conglomerado g, sejam n_g o tamanho e S_g a soma dos excessos. A
variância CR1 da média (modelo só com intercepto) é G/(G−1) vezes a soma dos
quadrados de S_g − n_g*média, dividida por N². Todos os intervalos e valores
de p usam t com G−1 graus de liberdade como aproximação para amostras finitas.
No TOST, p é o maior p dos testes unilaterais nas duas fronteiras da margem.
O nível de 5% usa o IC bilateral de 90% estritamente dentro da margem. O IC
bilateral de 95% e o limite superior unilateral de 95% são fornecidos também.
Na análise principal, o par de ICs simultâneos de 95% é calculado por
Bonferroni, com 97,5% de cobertura marginal bilateral por turno.

Uso independente: python equivalencia_vizinhas.py [pasta_dados_relatorio]
O JSON é emitido na saída padrão; os cálculos leem só votos_vizinhas_secoes.csv.
"""

import csv
import json
from collections import defaultdict
from functools import lru_cache
from math import exp, fsum, isfinite, lgamma, log, log1p, sqrt
from pathlib import Path


DADOS = Path(__file__).resolve().parent / "dados" / "relatorio"
MARGENS = (.10, .25, .50)
GRUPO_ABERTO = "Sem explicação específica"


def _beta_regularizada(a, b, x):
    """Fração contínua avaliada pelo método de Lentz (DLMF 8.17.22–23)."""
    if x <= 0:
        return 0.
    if x >= 1:
        return 1.
    if x > (a + 1) / (a + b + 2):
        return 1 - _beta_regularizada(b, a, 1 - x)

    fator = exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * log(x) + b * log1p(-x)) / a
    fracao = numerador = 1.
    denominador = 0.
    for i in range(1, 2001):
        m = i // 2
        if i % 2:
            coef = -(a + m) * (a + b + m) * x / ((a + 2*m) * (a + 2*m + 1))
        else:
            coef = m * (b - m) * x / ((a + 2*m - 1) * (a + 2*m))
        numerador = 1 + coef / numerador
        denominador = 1 + coef * denominador
        # Evita divisões por zero na recorrência sem afetar os dígitos úteis.
        numerador = numerador or 1e-300
        denominador = 1 / (denominador or 1e-300)
        multiplicador = numerador * denominador
        fracao *= multiplicador
        if i >= 2 and abs(multiplicador - 1.) < 8e-15:
            return fator / fracao
    raise ArithmeticError("A fração contínua da distribuição t não convergiu.")


def _cauda_t(t, gl):
    """Probabilidade P(T ≥ t), calculada diretamente para a cauda positiva."""
    x = gl / (gl + t*t)
    cauda = .5 * _beta_regularizada(gl / 2, .5, x)
    return cauda if t >= 0 else 1 - cauda


@lru_cache(maxsize=None)
def _critico_t(cauda, gl):
    esquerda, direita = 0., 1.
    while _cauda_t(direita, gl) > cauda:
        direita *= 2
    for _ in range(55):
        meio = (esquerda + direita) / 2
        if _cauda_t(meio, gl) > cauda:
            esquerda = meio
        else:
            direita = meio
    return (esquerda + direita) / 2


def _inferir(por_local, agrupar_municipios=False):
    grupos = defaultdict(list)
    for local, valores in por_local.items():
        conglomerado = local[:2] if agrupar_municipios else local
        grupos[conglomerado].extend(valores)
    g = len(grupos)
    if g < 2:
        raise ValueError("O intervalo exige pelo menos dois conglomerados independentes.")
    totais = [(len(valores), fsum(valores)) for valores in grupos.values()]
    n = sum(tamanho for tamanho, _ in totais)
    media = fsum(total for _, total in totais) / n
    gl = g - 1
    quadrados = fsum((total - tamanho * media) ** 2 for tamanho, total in totais)
    ep = sqrt((g / gl) * quadrados) / n
    if not isfinite(ep) or ep <= 0:
        raise ValueError("O erro padrão precisa ser positivo e finito para o TOST.")
    amplitude90 = _critico_t(.05, gl) * ep
    amplitude95 = _critico_t(.025, gl) * ep
    testes = []
    for margem in MARGENS:
        # H01: média ≤ −margem. H02: média ≥ margem.
        p_inferior = _cauda_t((media + margem) / ep, gl)
        p_superior = _cauda_t((margem - media) / ep, gl)
        p_tost = max(p_inferior, p_superior)
        testes.append(dict(margem_pp=margem, p_inferior=p_inferior, p_superior=p_superior,
                           p_tost=p_tost, equivalente_5pct=p_tost < .05))

    return dict(n_secoes=n, n_locais=len(por_local), n_conglomerados=g, graus_liberdade=gl,
                diferenca_pp=media, erro_padrao_pp=ep,
                ic90_pp=[media-amplitude90, media+amplitude90],
                ic95_pp=[media-amplitude95, media+amplitude95],
                limite_superior_95_pp=media+amplitude90,
                margem_limite_tost_pp=abs(media)+amplitude90, tost=testes)


def calcular_equivalencia(pasta_dados_relatorio=DADOS):
    """Calcula a análise principal e as sensibilidades para cada turno separadamente."""
    grupos = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    chaves = set()
    arquivo = Path(pasta_dados_relatorio) / "votos_vizinhas_secoes.csv"
    with arquivo.open(encoding="utf-8-sig", newline="") as f:
        leitor = csv.DictReader(f)
        independente = "excesso_controles_independentes_pp"
        if independente not in (leitor.fieldnames or []):
            raise ValueError(f"Falta a coluna {independente} em {arquivo.name}. Gere o CSV com votos_vizinhas.py.")
        for linha in leitor:
            if linha["situacao"] != "comparavel":
                continue
            turno = linha["turno"]
            local = tuple(linha[k] for k in ("uf", "codigo_municipio", "zona", "local"))
            chave = turno, local[:3], linha["secao"]
            if chave in chaves:
                raise ValueError(f"Seção comparável duplicada no CSV: {chave}")
            chaves.add(chave)
            excesso = float(linha["excesso_pp"])
            grupos[turno]["principal"][local].append(excesso)
            if (linha["amostra_teste_votacao"] == "1" if "amostra_teste_votacao" in linha
                    else GRUPO_ABERTO in linha["grupos"].split(" | ")):
                grupos[turno]["em_aberto"][local].append(excesso)
            if int(linha["n_controles_validos"]) >= 2:
                grupos[turno]["independente"][local].append(float(linha[independente]))
            elif linha[independente]:
                raise ValueError(f"A referência independente exige pelo menos dois controles: {chave}")

    if set(grupos) != {"1", "2"}:
        raise ValueError("A análise conjunta exige seções comparáveis dos dois turnos.")
    saida = {}
    for turno, recortes in sorted(grupos.items()):
        saida[turno] = {nome: _inferir(recortes[nome]) for nome in ("principal", "em_aberto", "independente")}
        saida[turno]["por_municipio"] = _inferir(recortes["principal"], agrupar_municipios=True)
        principal = saida[turno]["principal"]
        amplitude = _critico_t(.05 / (2 * len(grupos)), principal["graus_liberdade"]) * principal["erro_padrao_pp"]
        media = principal["diferenca_pp"]
        principal["ic95_simultaneo_pp"] = [media-amplitude, media+amplitude]
    return saida


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pasta_dados_relatorio", type=Path, nargs="?", default=DADOS)
    args = parser.parse_args()
    print(json.dumps(calcular_equivalencia(args.pasta_dados_relatorio), ensure_ascii=False, allow_nan=False, indent=2))
