"""Recalcula a comparação presidencial por seção e turno a partir dos CSVs do relatório.

Execute python votos_vizinhas.py (Python 3.12). O pacote inclui o cadastro
dos locais estudados e os votos dos boletins necessários para a comparação.
"""
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean

from biometria_vizinhas import carregar_biometria
from boletins_vizinhas import NOMES_CANDIDATOS, carregar_boletins
from estatistica_vizinhas import MIN_COMPARECIMENTO, analisar_turno
from universo_vizinhas import carregar_universo


RAIZ = Path(__file__).resolve().parent
PASTA = RAIZ / "dados" / "relatorio"
SEMENTE = 20261125
PERMUTACOES = 1999


def classificacoes():
    categorias = {}
    with (PASTA / "desfechos.csv").open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            chave = r["turno"], r["titulo"]
            if chave in categorias:
                raise ValueError(f"Caso classificado mais de uma vez: {chave}")
            categorias[chave] = r["conclusao"], r["id_caso"]
    return categorias


def amostra_teste():
    """Lê os casos sem explicação específica da triagem logística vigente."""
    casos = {}
    with (PASTA / "em_aberto.csv").open(encoding="utf-8-sig", newline="") as f:
        for linha in csv.DictReader(f):
            chave = linha["turno"], linha["titulo"]
            if chave in casos:
                raise ValueError(f"Caso em aberto duplicado: {chave}")
            casos[chave] = linha["id_caso"]
    return casos


def gravar_amostra_teste(amostra):
    with (PASTA / "votos_vizinhas_amostra_teste.csv").open("w", encoding="utf-8-sig", newline="") as f:
        escritor = csv.writer(f)
        escritor.writerow(("turno", "titulo", "id_caso"))
        escritor.writerows((turno, titulo, id_caso) for (turno, titulo), id_caso in sorted(amostra.items()))


def validar_amostra(amostra, categorias):
    for chave, id_caso in amostra.items():
        if chave not in categorias or categorias[chave][1] != id_caso:
            raise ValueError(f"Caso em aberto sem correspondência na triagem: {chave}")


def atualizar_grupos():
    """Atualiza apenas os rótulos de classificação de cada seção, conservando todas as medidas dos BUs."""
    from tempfile import NamedTemporaryFile
    categorias, amostra = classificacoes(), amostra_teste()
    validar_amostra(amostra, categorias)
    arquivo = PASTA / "votos_vizinhas_secoes.csv"
    presentes = set()
    with arquivo.open(encoding="utf-8-sig", newline="") as origem, NamedTemporaryFile(
            mode="w", dir=PASTA, encoding="utf-8-sig", newline="", delete=False) as out:
        tmp = Path(out.name)
        try:
            leitor = csv.DictReader(origem)
            colunas = list(dict.fromkeys([*leitor.fieldnames, "amostra_teste_votacao"]))
            escritor = csv.DictWriter(out, fieldnames=colunas)
            escritor.writeheader()
            for r in leitor:
                chaves = [(r["turno"], t) for t in r["titulos_repetidos"].split(" | ")]
                grupos, ids = zip(*(categorias[k] for k in chaves))
                if set(ids) != set(r["casos"].split(" | ")):
                    raise ValueError(f"Vínculo divergente entre caso e seção: {ids}")
                presentes.update(chaves)
                r["grupos"] = " | ".join(sorted(set(grupos)))
                r["amostra_teste_votacao"] = int(any(k in amostra for k in chaves))
                escritor.writerow(r)
            if presentes != categorias.keys() or not amostra.keys() <= presentes:
                raise ValueError("A classificação cobriu um universo diferente do CSV por seção.")
        except BaseException:
            out.close()
            tmp.unlink(missing_ok=True)
            raise
    try:
        tmp.replace(arquivo)
    finally:
        tmp.unlink(missing_ok=True)
    gravar_amostra_teste(amostra)


def calcular(amostra=None):
    universo, bus, categorias = carregar_universo(), carregar_boletins(), classificacoes()
    if amostra is None:
        amostra = amostra_teste()
    validar_amostra(amostra, categorias)
    falhas = carregar_biometria(bus)
    if {(s[0], t) for s, titulos in universo.marcadas.items() for t in titulos} != categorias.keys():
        raise ValueError("Os casos do relatório e as seções marcadas não coincidem")
    afetados = {universo.locais[s] for s in universo.marcadas}
    por_local = defaultdict(list)
    for s, local in universo.locais.items():
        if local in afetados:
            por_local[local].append(s)

    linhas, resumos = [], {}
    for turno in ("1", "2"):
        nominais = tuple(NOMES_CANDIDATOS[int(turno)])
        candidatos = tuple(c for c in nominais if not (turno == "1" and c == "28"))
        locais, locais_brutos, participacao_controles, situacoes = {}, {}, {}, Counter()
        biometria_controles = {}
        for local, secoes in por_local.items():
            if local[0] != turno:
                continue
            grupo, bruto = {}, {}
            for s in secoes:
                if s in universo.suplementares and s not in universo.marcadas:
                    situacoes["suplementares_exclusivas_no_recorte"] += 1
                    continue
                if s in bus:
                    b = bus[s]
                    marcada = s in universo.marcadas
                    votos = {c:b["votos"].get(c, 0) for c in candidatos}
                    grupo[s] = (marcada, votos, b["brancos"], b["nulos"] + (b["votos"].get("28",0) if turno=="1" else 0))
                    if turno == "1" and sum(votos.values()):
                        bruto[s] = (marcada, b["votos"], b["brancos"], b["nulos"])
                elif s not in universo.marcadas:
                    situacoes["vizinhas_sem_bu"] += 1
            if any(v[0] for v in grupo.values()):
                locais[local] = grupo
                if bruto:
                    locais_brutos[local] = bruto
                controles = [s for s, (marcada, v, _, _) in grupo.items()
                             if not marcada and sum(v.values()) and bus[s]["comparecimento"] >= MIN_COMPARECIMENTO]
                participacao_controles[local] = (sum(bus[s]["comparecimento"] for s in controles),
                                                 sum(bus[s]["aptos"] for s in controles))
                com_biometria = [s for s in controles if s in falhas]
                biometria_controles[local] = (len(com_biometria), sum(falhas[s] for s in com_biometria),
                                              sum(bus[s]["comparecimento"] for s in com_biometria))
        registros, resumo = analisar_turno(locais, candidatos, permutacoes=PERMUTACOES, semente=SEMENTE + int(turno))
        abertas = {s for s, titulos in universo.marcadas.items() if s[0] == turno
                   and any((turno, t) in amostra for t in titulos)}
        locais_abertos = {universo.locais[s] for s in abertas}
        grupos_abertos = {k: {s: v for s,v in locais[k].items() if not v[0] or s in abertas}
                          for k in locais_abertos if k in locais}
        sub_registros, sub = analisar_turno(
            grupos_abertos, candidatos, permutacoes=PERMUTACOES, semente=SEMENTE + 100 + int(turno)
        )
        resumo["casos_em_aberto"] = {k: sub[k] for k in (
            "n_comparaveis", "n_locais_comparaveis", "distancia", "referencia", "extremos", "permutacao"
        )}
        resumo["casos_em_aberto"]["n_marcadas"] = len(abertas)
        casos_abertos = {chave for chave in amostra if chave[0] == turno}
        secoes_comparaveis = {r["secao"] for r in sub_registros if r["situacao"] == "comparavel"}
        casos_comparaveis = {(turno, t) for s in secoes_comparaveis for t in universo.marcadas[s]}
        resumo["casos_em_aberto"]["n_casos"] = len(casos_abertos)
        resumo["casos_em_aberto"]["n_casos_comparaveis"] = len(casos_abertos & casos_comparaveis)
        if locais_brutos:
            _, BU = analisar_turno(locais_brutos, nominais, permutacoes=0)
            resumo["todos_nominais_bu"] = {k:BU[k] for k in ("n_comparaveis","distancia","referencia","extremos")}
        por_secao = {r["secao"]: r for r in registros}
        chaves = sorted(s for s in universo.marcadas if s[0] == turno)
        resumo["n_marcadas_universo"] = len(chaves)
        resumo["n_casos"] = sum(t == turno for t, _ in categorias)
        resumo["n_locais_marcados"] = sum(local[0] == turno for local in afetados)
        resumo["n_sem_bu"] = sum(s not in bus for s in chaves)
        resumo["controles_suplementares_excluidos"] = situacoes["suplementares_exclusivas_no_recorte"]
        resumo["vizinhas_sem_bu"] = situacoes["vizinhas_sem_bu"]
        linhas_turno = []
        locais_com_par_biometrico = set()
        for s in chaves:
            local = universo.locais[s]
            grupos, ids = set(), []
            for titulo in sorted(universo.marcadas[s]):
                categoria, caso = categorias[turno, titulo]
                grupos.add(categoria)
                ids.append(caso)
            cidade, estabelecimento = universo.nomes[local]
            linha = dict(turno=turno, uf=s[1], codigo_municipio=s[2], municipio=cidade, zona=s[3], secao=s[4],
                         local=local[4], estabelecimento=estabelecimento, grupos=" | ".join(sorted(grupos)),
                         casos=" | ".join(ids), titulos_repetidos=" | ".join(sorted(universo.marcadas[s])),
                         amostra_teste_votacao=int(s in abertas),
                         url_bu=bus.get(s, {}).get("url", ""))
            resultado = por_secao.get(s)
            if resultado is None and s in bus:
                raise ValueError(f"Seção com BU sem resultado da análise: {s}")
            if resultado:
                linha.update({k: v for k, v in resultado.items() if k not in ("local", "secao")})
            else:
                linha["situacao"] = "sem_bu"
            linha["comparecimento_secao_pct"] = linha["comparecimento_vizinhas_pct"] = None
            linha["falha_biometria_secao"] = falhas.get(s)
            linha["comparecimento_biometria_secao"] = bus[s]["comparecimento"] if s in falhas else None
            linha["n_vizinhas_com_biometria"] = None
            linha["falha_biometria_vizinhas"] = linha["comparecimento_biometria_vizinhas"] = None
            linha["falha_biometria_secao_pct"] = linha["falha_biometria_vizinhas_pct"] = None
            linha["falha_biometria_diferenca_pp"] = None
            if linha["situacao"] == "comparavel":
                comparecimento, aptos = participacao_controles[local]
                if aptos and bus[s]["aptos"]:
                    linha["comparecimento_secao_pct"] = 100 * bus[s]["comparecimento"] / bus[s]["aptos"]
                    linha["comparecimento_vizinhas_pct"] = 100 * comparecimento / aptos
                n_vizinhas, liberacoes, presentes = biometria_controles[local]
                linha["n_vizinhas_com_biometria"] = n_vizinhas
                if n_vizinhas:
                    linha["falha_biometria_vizinhas"] = liberacoes
                    linha["comparecimento_biometria_vizinhas"] = presentes
                if s in falhas and presentes:
                    linha["falha_biometria_secao_pct"] = 100 * falhas[s] / bus[s]["comparecimento"]
                    linha["falha_biometria_vizinhas_pct"] = 100 * liberacoes / presentes
                    linha["falha_biometria_diferenca_pp"] = linha["falha_biometria_secao_pct"] - linha["falha_biometria_vizinhas_pct"]
                    locais_com_par_biometrico.add(local)
            linhas_turno.append(linha)
        if sum(r["situacao"]=="comparavel" for r in linhas_turno) != resumo["n_comparaveis"]:
            raise ValueError("Cobertura de seções comparáveis divergente")
        c = [r for r in linhas_turno if r["comparecimento_secao_pct"] is not None]
        resumo["comparecimento"] = dict(n=len(c), media_secao_pct=mean(r["comparecimento_secao_pct"] for r in c),
                                        media_vizinhas_pct=mean(r["comparecimento_vizinhas_pct"] for r in c),
                                        diferenca_media_pp=mean(r["comparecimento_secao_pct"]-r["comparecimento_vizinhas_pct"] for r in c))
        pares = [r for r in linhas_turno if r["falha_biometria_diferenca_pp"] is not None]
        resumo["falha_biometria"] = dict(
            n=len(pares), n_controles=sum(biometria_controles[local][0] for local in locais_com_par_biometrico),
            media_secao_pct=mean(r["falha_biometria_secao_pct"] for r in pares) if pares else None,
            media_vizinhas_pct=mean(r["falha_biometria_vizinhas_pct"] for r in pares) if pares else None,
            diferenca_media_pp=mean(r["falha_biometria_diferenca_pp"] for r in pares) if pares else None)
        resumos[turno] = resumo
        linhas.extend(linhas_turno)
    return linhas, resumos


def gravar_dados():
    amostra = amostra_teste()
    linhas, resumos = calcular(amostra)
    gravar_amostra_teste(amostra)
    colunas = dict.fromkeys(k for r in linhas for k in r)
    with (PASTA / "votos_vizinhas_secoes.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=colunas)
        w.writeheader()
        w.writerows({k: round(v, 7) if isinstance(v, float) else v for k, v in r.items()} for r in linhas)
    from equivalencia_vizinhas import calcular_equivalencia
    equivalencia = calcular_equivalencia(PASTA)
    with (PASTA / "votos_vizinhas_equivalencia.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(("turno", "analise", "secoes", "conglomerados", "diferenca_pp", "erro_padrao_pp",
                    "ic90_inf_pp", "ic90_sup_pp", "ic95_inf_pp", "ic95_sup_pp", "ic_simultaneo95_inf_pp",
                    "ic_simultaneo95_sup_pp", "margem_pp", "p_inferior", "p_superior", "p_tost", "equivalente_a_5pct"))
        for turno, grupos in equivalencia.items():
            resumos[turno]["equivalencia"] = grupos
            for nome, grupo in grupos.items():
                for teste in grupo["tost"]:
                    w.writerow((turno, nome, grupo["n_secoes"], grupo["n_conglomerados"], grupo["diferenca_pp"],
                                grupo["erro_padrao_pp"], *grupo["ic90_pp"], *grupo["ic95_pp"],
                                *grupo.get("ic95_simultaneo_pp", ("", "")), teste["margem_pp"],
                                teste["p_inferior"], teste["p_superior"], teste["p_tost"], int(teste["equivalente_5pct"])))
    (PASTA / "votos_vizinhas_resumo.json").write_text(json.dumps(resumos, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    for t, r in resumos.items():
        print(t, r["n_marcadas_universo"], r["n_comparaveis"], r["distancia"], r["referencia"], r["permutacao"])


if __name__ == "__main__":
    from relatorio_votos_vizinhas import gerar
    gravar_dados()
    gerar()
