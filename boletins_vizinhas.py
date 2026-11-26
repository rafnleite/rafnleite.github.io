"""Extrai os BUs presidenciais das seções principais nos locais com títulos repetidos.

O CSV publicado em dados/relatorio basta para carregar_boletins(). Para reconstruí-lo,
execute este script com o cadastro nacional e as exportações de logs-urnas/exportar_bus.py.
Use --fontes para indicar o diretório dos dois arquivos presidencia_2026_{1,2}t_secoes.csv.
As URL e o SHA-256 de cada arquivo bu.dat do TSE ficam na linha da seção e do turno.
Para confrontar o extrato com a totalização, passe --conferir-totalizacao e o ZIP do recurso
https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/votacao_secao_2026_BR.zip
"""
import argparse
from collections import Counter
import csv
import hashlib
from io import TextIOWrapper
import json
import os
from operator import itemgetter
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
from zipfile import ZipFile

from universo_vizinhas import carregar_universo, chave_secao


RAIZ = Path(__file__).resolve().parent
EXTRATO = RAIZ / "dados/relatorio/votos_vizinhas_boletins.csv"
CONFERENCIA = EXTRATO.with_name("votos_vizinhas_conferencia.json")
FONTES = RAIZ.parent / "logs-urnas/dados-bu"
URL_SECOES = "https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/votacao_secao_2026_BR.zip"
URL_RESULTADO = "https://cdn.tse.jus.br/estatistica/sead/odsele/relatorio_resultado_totalizacao/Relatorio_Resultado_Totalizacao_2026_BR.zip"
PRIMEIRO = {
    "13": "Lula", "14": "Renan Santos", "16": "Hertz Dias", "21": "Edmilson Costa",
    "22": "Flávio Bolsonaro", "27": "Clariana Barão", "28": "Leonardo Avalanche",
    "29": "Rui Costa Pimenta", "30": "Romeu Zema", "35": "Wilson Grassi",
    "55": "Ronaldo Caiado", "70": "Augusto Cury", "80": "Samara Martins",
}
NOMES_CANDIDATOS = {1: PRIMEIRO, 2: {n: PRIMEIRO[n] for n in ("13", "22")}}
CONTAGENS = {
    "aptos": "eleitores_aptos", "comparecimento": "comparecimento", "abstencoes": "abstencoes",
    "nominais": "votos_nominais", "brancos": "votos_brancos", "nulos": "votos_nulos",
    "legenda": "votos_legenda", "sem_candidato": "votos_sem_candidato", "total": "total_apurado",
}
IDENTIFICACAO = ("turno", "uf", "codigo_municipio", "municipio", "zona", "secao", "local",
                 "nome_local", "marcada", "suplementar", "titulos_repetidos")
VOTOS = tuple("votos_" + codigo for codigo in PRIMEIRO)
DESTINACAO = ("validos_totalizacao", "nulos_tecnicos", "nulos_totalizacao")
CAMPOS = (*IDENTIFICACAO, "status_bu", "situacao_tse", *CONTAGENS, *VOTOS, *DESTINACAO, "url", "sha256")


def _resultado(linha):
    """Lê apenas campos preenchidos e confere a composição do resultado presidencial."""
    turno = int(linha["turno"])
    codigos = NOMES_CANDIDATOS[turno]
    votos = {n: int(linha["votos_" + n]) for n in codigos}
    contagens = {nome: int(linha[nome]) for nome in CONTAGENS}
    url, sha = linha["url"], linha["sha256"]
    uf = linha["uf"].lower()
    mun, zona, secao = (int(linha[c]) for c in ("codigo_municipio", "zona", "secao"))
    codigo = {1: "3220", 2: "3221"}[turno]
    prefixo = f"https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/{codigo}/dados/{uf}/{mun:05d}/{zona:04d}/{secao:04d}/"
    final = f"/o0{codigo}{uf}{mun:05d}{zona:04d}{secao:04d}-bu.dat"
    if not url.startswith(prefixo) or not url.endswith(final) or not re.fullmatch("[0-9a-f]{64}", sha):
        raise ValueError(f"Fonte do BU incompatível com sua seção: {url}")
    if (min(*votos.values(), *contagens.values()) < 0
            or any(linha.get("votos_" + n) for n in PRIMEIRO.keys() - codigos.keys())
            or contagens["legenda"] or contagens["sem_candidato"]
            or sum(votos.values()) != contagens["nominais"]
            or contagens["nominais"] + contagens["brancos"] + contagens["nulos"] != contagens["total"]
            or contagens["total"] != contagens["comparecimento"]
            or contagens["comparecimento"] + contagens["abstencoes"] != contagens["aptos"]):
        raise ValueError(f"Totais presidenciais incompatíveis: {url}")
    # O nº 28 consta nos BUs do 1º turno, mas seus votos entram em nulos técnicos no SISTOT.
    tecnicos = votos.get("28", 0)
    validos = contagens["nominais"] - tecnicos
    return dict(votos=votos, **contagens, validos=validos, validos_totalizacao=validos,
                nulos_tecnicos=tecnicos, nulos_totalizacao=contagens["nulos"] + tecnicos,
                url=url, sha256=sha, situacao_tse=linha["situacao_tse"])


def _secao_extrato(universo, chave):
    turno, uf, municipio, zona, secao = chave
    local = universo.locais[chave]
    nome_municipio, nome_local = universo.nomes[local]
    titulos = universo.marcadas.get(chave, ())
    return dict(turno=turno, uf=uf, codigo_municipio=municipio, municipio=nome_municipio, zona=zona,
                secao=secao, local=local[-1], nome_local=nome_local, marcada=int(bool(titulos)),
                suplementar=int(chave in universo.suplementares), titulos_repetidos=" ".join(sorted(titulos)))


def gerar_extrato(fontes=FONTES, destino=EXTRATO):
    universo = carregar_universo()
    locais = {universo.locais[chave] for chave in universo.marcadas}
    pedidas = {secao for secao, local in universo.locais.items() if local in locais}
    vistas = set()
    cobertura = Counter()
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporario = NamedTemporaryFile("w", dir=destino.parent, encoding="utf-8-sig", newline="", delete=False)
    try:
        with temporario as saida:
            gravador = csv.DictWriter(saida, fieldnames=CAMPOS)
            gravador.writeheader()
            for turno, candidatos in NOMES_CANDIDATOS.items():
                origem = fontes / f"presidencia_2026_{turno}t_secoes.csv"
                with origem.open(encoding="utf-8-sig", newline="") as arq:
                    leitor = csv.DictReader(arq, delimiter=";")
                    prefixo = "votos_candidato_"
                    if {c.removeprefix(prefixo) for c in leitor.fieldnames if c.startswith(prefixo)} != candidatos.keys():
                        raise ValueError(f"Colunas de candidatos inesperadas em {origem}")
                    for r in leitor:
                        chave = chave_secao(r["turno"], r["uf"], r["municipio_codigo_tse"], r["zona"], r["secao"])
                        if chave not in pedidas:
                            continue
                        if chave in vistas or r["ano"] != "2026" or chave[0] != str(turno):
                            raise ValueError(f"Chave duplicada ou fora da eleição em {origem}: {chave}")
                        vistas.add(chave)
                        linha = _secao_extrato(universo, chave)
                        linha["situacao_tse"] = r["situacao_tse"]
                        if r["bu_disponivel"] != "1":
                            linha["status_bu"] = "indisponivel"
                        elif r["dados_atualizados"] != "1":
                            linha["status_bu"] = "desatualizado"
                        else:
                            linha.update(status_bu="disponivel", url=r["url_bu"], sha256=r["sha256_bu"])
                            linha.update({nome: r[coluna] for nome, coluna in CONTAGENS.items()})
                            linha.update({"votos_" + n: r[prefixo + n] for n in candidatos})
                            resultado = _resultado(linha)
                            linha.update({campo: resultado[campo] for campo in DESTINACAO})
                        cobertura[turno, linha["status_bu"]] += 1
                        gravador.writerow(linha)
            for chave in sorted(pedidas - vistas):
                gravador.writerow(dict(_secao_extrato(universo, chave), status_bu="ausente_da_exportacao"))
                cobertura[int(chave[0]), "ausente_da_exportacao"] += 1
        os.replace(temporario.name, destino)
    finally:
        Path(temporario.name).unlink(missing_ok=True)
    return cobertura


def carregar_boletins(caminho=EXTRATO):
    """Mapa de seção-turno para votos e proveniência. BUs indisponíveis ficam fora do mapa."""
    resultados = {}
    vistas = set()
    with caminho.open(encoding="utf-8-sig", newline="") as arq:
        leitor = csv.DictReader(arq)
        if leitor.fieldnames != list(CAMPOS):
            raise ValueError(f"Colunas inesperadas em {caminho}")
        for r in leitor:
            chave = chave_secao(r["turno"], r["uf"], r["codigo_municipio"], r["zona"], r["secao"])
            if chave in vistas:
                raise ValueError(f"Mais de uma linha para a seção {chave}")
            vistas.add(chave)
            if r["status_bu"] != "disponivel":
                if r["status_bu"] not in {"ausente_da_exportacao", "indisponivel", "desatualizado"} or any(r[c] for c in (*CONTAGENS, *VOTOS, *DESTINACAO)):
                    raise ValueError(f"Status ou votos inconsistentes para BU indisponível: {chave}")
                continue
            resultado = _resultado(r)
            if any(resultado[c] != int(r[c]) for c in DESTINACAO):
                raise ValueError(f"Destinação de votos incompatível: {chave}")
            resultados[chave] = dict(resultado, local=(*chave[:-1], r["local"]), municipio=r["municipio"],
                                     nome_local=r["nome_local"], marcada=r["marcada"] == "1",
                                     suplementar=r["suplementar"] == "1", titulos_repetidos=tuple(r["titulos_repetidos"].split()))
    return resultados


def conferir_totalizacao(arquivo, caminho=EXTRATO, destino=CONFERENCIA):
    """Compara cada opção do extrato com o CSV de totalização, inclusive os códigos 95 e 96."""
    bus = carregar_boletins(caminho)
    oficiais = {}
    totais_nacionais = {"1": Counter(), "2": Counter()}
    campos = ("NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "CD_CARGO",
              "NR_VOTAVEL", "QT_VOTOS")
    with ZipFile(arquivo) as z, z.open("votacao_secao_2026_BR.csv") as dados:
        leitor = csv.reader(TextIOWrapper(dados, encoding="latin1", newline=""), delimiter=";")
        cabecalho = next(leitor)
        extrair = itemgetter(*(cabecalho.index(campo) for campo in campos))
        for linha in leitor:
            turno, uf, municipio, zona, secao, cargo, numero, votos = extrair(linha)
            if cargo != "1":
                continue
            votos = int(votos)
            totais_nacionais[turno][numero] += votos
            if uf == "ZZ":
                continue
            chave = chave_secao(turno, uf, municipio, zona, secao)
            if chave not in bus:
                continue
            opcoes = oficiais.setdefault(chave, {})
            if numero in opcoes:
                raise ValueError(f"Votável duplicado na totalização: {chave} / {numero}")
            opcoes[numero] = votos
    resumo = Counter()
    for chave, bu in bus.items():
        esperado = {**bu["votos"], "95": bu["brancos"], "96": bu["nulos"]}
        observado = oficiais.get(chave)
        if observado is None:
            resumo[chave[0], "ausente_na_totalizacao"] += 1
        elif ({n: v for n, v in esperado.items() if v}
              != {n: v for n, v in observado.items() if v}):
            resumo[chave[0], "votacao_divergente"] += 1
        else:
            resumo[chave[0], "identica"] += 1
    identicas = [resumo[str(t), "identica"] for t in (1, 2)]
    marcadas_28 = sum(b["nulos_tecnicos"] for b in bus.values() if b["marcada"])
    total_28 = sum(b["nulos_tecnicos"] for b in bus.values())
    inteiro = lambda n: format(n, ",").replace(",", ".")
    divergentes = sum(resumo.values()) - sum(identicas)
    ressalva = (f"Há resultados divergentes ou ausentes em {inteiro(divergentes)} boletins. "
                if divergentes else "")
    # Resumo geral do Brasil, p. 3 de cada relatório do SISTOT, edições de 07/10 e 25/10.
    oficiais_sistot = {"1": (119300788, 2300798, 3669003, 5246),
                       "2": (124082273, 1430496, 2723305, 0)}
    for t, c in totais_nacionais.items():
        concorrentes = NOMES_CANDIDATOS[int(t)].keys() - {"28"}
        if (sum(c[n] for n in concorrentes), c["95"], c["96"], c["28"]) != oficiais_sistot[t]:
            raise ValueError(f"A votação do turno {t} diverge da destinação nacional do relatório do SISTOT consultado.")
    registro = {
        "arquivo_votacao_secao_tse": URL_SECOES,
        "pagina_recurso_votacao_secao_tse": "https://dadosabertos.tse.jus.br/pt_BR/dataset/resultados-2026/resource/01ea4ccd-f443-469c-9f29-c69ff97f7d4c",
        "arquivo_relatorio_resultado_totalizacao_tse": URL_RESULTADO,
        "pagina_recurso_relatorio_resultado_tse": "https://dadosabertos.tse.jus.br/pt_BR/dataset/resultados-2026/resource/361abf94-f9e9-44f7-b3a8-59e6514b314e",
        "sha256_zip_relatorio_resultado_consultado": "705d6270af9f2f3b359fe5e8938e81c032d08df6ba4d018faa18e9b80bae9fd0",
        "referencia_sistot": "Nos dois PDFs presidenciais do ZIP do SISTOT, p. 3 discrimina votos válidos e nulos técnicos e p. 4 enumera os candidatos que receberam votos válidos.",
        "por_turno": {t: {"identicos": resumo[t, "identica"], "votacao_divergente": resumo[t, "votacao_divergente"],
                         "ausentes": resumo[t, "ausente_na_totalizacao"],
                         "codigos_validos_sistot": [n for n in NOMES_CANDIDATOS[int(t)] if n != "28"],
                         "votos_por_codigo_tse_brasil_e_exterior": dict(sorted(c.items()))}
                     for t, c in totais_nacionais.items()},
        "codigo_28_nos_locais_analisados": {"total": total_28, "em_secoes_marcadas": marcadas_28,
                                           "em_outras_secoes": total_28 - marcadas_28},
        "texto_relatorio": f"As contagens dos boletins, incluindo votos nominais, brancos e nulos, coincidem com as do arquivo oficial de votação por seção do TSE "
                           f"em {inteiro(identicas[0])} boletins do primeiro turno e {inteiro(identicas[1])} do segundo. "
                           f"{ressalva}"
                           f"O resultado oficial inclui 12 candidaturas com votos válidos no primeiro turno e duas no segundo. "
                           f"O número 28 recebeu {inteiro(totais_nacionais['1']['28'])} votos no país e no exterior, contabilizados como nulos técnicos. "
                           f"Nos locais analisados foram {inteiro(total_28)}, dos quais {inteiro(marcadas_28)} nas seções com repetição."
    }
    with arquivo.open("rb") as f:
        registro["sha256_zip_votacao_secao"] = hashlib.file_digest(f, "sha256").hexdigest()
    with caminho.open("rb") as f:
        registro["sha256_extrato_boletins"] = hashlib.file_digest(f, "sha256").hexdigest()
    destino.write_text(json.dumps(registro, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return resumo


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fontes", type=Path, default=FONTES)
    parser.add_argument("--conferir-totalizacao", type=Path, metavar="ZIP")
    args = parser.parse_args()
    contagens = conferir_totalizacao(args.conferir_totalizacao) if args.conferir_totalizacao else gerar_extrato(args.fontes)
    print(dict(sorted(contagens.items())))
