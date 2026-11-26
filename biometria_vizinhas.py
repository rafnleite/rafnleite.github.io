"""Liberações após falha biométrica no BWeb oficial, uma contagem por seção/turno.

O campo QT_ELEI_BIOM_SEM_HABILITACAO do dicionário do TSE conta os eleitores
com biometria que compareceram e foram habilitados por outra forma. O valor se
repete nas linhas por votável. O script compara essas linhas e usa o valor uma
única vez. O denominador é o comparecimento presidencial do mesmo BU.

Para reproduzir, baixe os ZIPs de boletins por UF e turno (e, se desejado, os
SHA-512 publicados ao lado deles) em
https://dadosabertos.tse.jus.br/dataset/resultados-2026-boletim-de-urna .
Execute: python biometria_vizinhas.py --fontes DIRETORIO_DOS_ZIPS
Use --cadastro se eleitorado_local_votacao_2026.zip não estiver em dados/.
O cadastro por turno identifica o estabelecimento atual e o de origem das
seções transferidas. Se o BWeb usa o código de origem, o CSV conserva ambos.
"""

import argparse
import csv
import hashlib
import os
import re
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from io import BufferedReader, TextIOWrapper
from operator import itemgetter
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZipFile

from boletins_vizinhas import EXTRATO as BOLETINS, carregar_boletins
from universo_vizinhas import DADOS, DIGEST, chave_secao


EXTRATO = BOLETINS.with_name("votos_vizinhas_biometria.csv")
CADASTRO = DADOS / "eleitorado_local_votacao_2026.zip"
CHAVE = ("turno", "uf", "codigo_municipio", "zona", "secao")
CAMPOS = (*CHAVE, "local", "marcada", "comparecimento", "liberacoes_apos_falha",
          "status", "local_bweb", "local_original_conferido", "comparecimento_bweb", "arquivo_tse")
ARQUIVO = re.compile(r"bweb_([12])t_([A-Z]{2})_\d{12}\.zip")
SEM_VALOR = {"", "#NULO#", "-1", "-3"}


def _linhas_presidenciais(texto):
    """Pré-seleciona registros inteiros, preservando campos CSV com quebras de linha."""
    for linha in texto:
        if linha.count('"') % 2:
            partes = [linha]
            for outra in texto:
                partes.append(outra)
                if outra.count('"') % 2:
                    break
            else:
                raise ValueError("Registro CSV incompleto no BWeb")
            linha = "".join(partes)
        if ';"Presidente";' in linha:
            yield linha


def _ler_uf(tarefa):
    arquivo, turno, uf, pedidas = tarefa
    resultado = {}
    with ZipFile(arquivo) as z, z.open(arquivo.stem + ".csv") as entrada:
        texto = TextIOWrapper(BufferedReader(entrada, 2**20), encoding="latin1", newline="")
        cabecalho = next(csv.reader([texto.readline()], delimiter=";"))
        campos = ("ANO_ELEICAO", "CD_PLEITO", "NR_TURNO", "SG_UF", "CD_CARGO_PERGUNTA",
                  "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "NR_LOCAL_VOTACAO",
                  "QT_COMPARECIMENTO", "QT_ELEI_BIOM_SEM_HABILITACAO",
                  "DT_ABERTURA", "DT_ENCERRAMENTO", "NR_JUNTA_APURADORA", "NR_TURMA_APURADORA")
        indices = [cabecalho.index(c) for c in campos]
        identidade = ("2026", {"1": "3220", "2": "3221"}[turno], turno, uf, "1")
        for valores in csv.reader(_linhas_presidenciais(texto), delimiter=";"):
            (ano, pleito, t, estado, cargo, mun, zona, secao, local, comparecimento,
             falhas, abertura, encerramento, junta, turma) = (valores[i] for i in indices)
            if (ano, pleito, t, estado, cargo) != identidade:
                raise ValueError(f"Identificação presidencial inválida em {arquivo.name}")
            k = (int(mun), int(zona), int(secao))
            if k not in pedidas:
                continue
            # DadosSA traz junta/turma em vez dos horários de votação. Não usar
            # um zero de apresentação do BWeb como observação biométrica nesse caso.
            apuracao = (abertura in SEM_VALOR or encerramento in SEM_VALOR
                        or junta not in SEM_VALOR or turma not in SEM_VALOR)
            n = int(falhas) if falhas not in SEM_VALOR and not apuracao else None
            medidas = (int(local), int(comparecimento), n)
            if n is not None and not 0 <= n <= medidas[1]:
                raise ValueError(f"Liberações fora dos limites em {arquivo.name}: {k}")
            if resultado.setdefault(k, medidas) != medidas:
                raise ValueError(f"Contagens divergentes entre votáveis em {arquivo.name}: {k}")
    return (turno, uf), arquivo.name, resultado


def _locais_originais(divergencias, cadastro):
    if not divergencias:
        return {}
    with cadastro.open("rb") as f:
        if hashlib.file_digest(f, "sha256").hexdigest() != DIGEST:
            raise ValueError("A versão do cadastro difere da usada para definir as seções vizinhas")
    campos = ("NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO",
              "NR_LOCAL_VOTACAO", "NR_LOCAL_VOTACAO_ORIGINAL")
    originais = {}
    with ZipFile(cadastro) as z, z.open("eleitorado_local_votacao_2026_BRASIL.csv") as f:
        leitor = csv.reader(TextIOWrapper(f, encoding="latin1", newline=""), delimiter=";")
        cabecalho = next(leitor)
        selecionar = itemgetter(*(cabecalho.index(c) for c in campos))
        for linha in leitor:
            turno, uf, mun, zona, secao, atual, original = selecionar(linha)
            chave = chave_secao(turno, uf, mun, zona, secao)
            if chave in divergencias:
                if int(atual) != divergencias[chave] or chave in originais:
                    raise ValueError(f"Cadastro do local de votação inconsistente: {chave}")
                originais[chave] = int(original) if original not in SEM_VALOR else None
    return originais


def extrair(fontes, boletins=BOLETINS, destino=EXTRATO, processos=4, cadastro=CADASTRO):
    bus = carregar_boletins(boletins)
    por_uf = defaultdict(dict)
    for chave, bu in bus.items():
        turno, uf, mun, zona, secao = chave
        por_uf[turno, uf][int(mun), int(zona), int(secao)] = (chave, bu)

    arquivos = {}
    for p in Path(fontes).glob("bweb_*t_*.zip"):
        identificacao = ARQUIVO.fullmatch(p.name)
        if identificacao and identificacao.groups() in por_uf:
            k = identificacao.groups()
            if k in arquivos:
                raise ValueError(f"Duas versões do BWeb para {k}")
            arquivos[k] = p
    if ausentes := por_uf.keys() - arquivos.keys():
        raise FileNotFoundError(f"Faltam ZIPs do BWeb para {sorted(ausentes)}")
    tarefas = [(p, *k, set(por_uf[k])) for k, p in arquivos.items()]
    tarefas.sort(key=lambda item: item[0].stat().st_size, reverse=True)
    cobertura = Counter()
    with ProcessPoolExecutor(max_workers=processos) as executor:
        encontrados = {(chave, nome): registros for chave, nome, registros
                       in executor.map(_ler_uf, tarefas)}
    divergencias = {}
    for (periodo, _), medidas in encontrados.items():
        for k, (local_bweb, _, _) in medidas.items():
            chave, bu = por_uf[periodo][k]
            local = int(bu["local"][-1])
            if local_bweb != local:
                divergencias[chave] = local
    originais = _locais_originais(divergencias, cadastro)
    with NamedTemporaryFile(mode="w", dir=destino.parent, encoding="utf-8-sig",
                            newline="", delete=False) as temporario:
        caminho = Path(temporario.name)
        try:
            saida = csv.DictWriter(temporario, fieldnames=CAMPOS)
            saida.writeheader()
            for ((turno, uf), nome), medidas in sorted(encontrados.items()):
                for k, (chave, bu) in sorted(por_uf[turno, uf].items()):
                    local, comparecimento = int(bu["local"][-1]), bu["comparecimento"]
                    n = local_bweb = comp_bweb = None
                    if k not in medidas:
                        status = "ausente_no_bweb"
                    else:
                        local_bweb, comp_bweb, n = medidas[k]
                        if comp_bweb != comparecimento:
                            status, n = "comparecimento_divergente", None
                        elif local_bweb != local and local_bweb != originais.get(chave):
                            status, n = "local_divergente", None
                        else:
                            status = "disponivel" if n is not None else "sem_detalhamento"
                    cobertura[turno, status] += 1
                    saida.writerow(dict(zip(CHAVE, chave), local=local, marcada=int(bu["marcada"]),
                                        comparecimento=comparecimento, liberacoes_apos_falha=n,
                                        status=status, local_bweb=local_bweb,
                                        local_original_conferido=originais.get(chave),
                                        comparecimento_bweb=comp_bweb, arquivo_tse=nome))
            temporario.close()
            os.replace(caminho, destino)
        finally:
            temporario.close()
            caminho.unlink(missing_ok=True)
    return cobertura


def carregar_biometria(bus, caminho=EXTRATO):
    """Contagens observadas para os BUs de entrada. Zeros são preservados."""
    saida = {}
    vistas = set()
    with Path(caminho).open(encoding="utf-8-sig", newline="") as arquivo:
        for r in csv.DictReader(arquivo):
            chave = chave_secao(*(r[c] for c in CHAVE))
            if chave not in bus:
                continue
            if chave in vistas:
                raise ValueError(f"Seção duplicada no extrato de biometria: {chave}")
            vistas.add(chave)
            comparecimento = int(r["comparecimento"])
            if comparecimento != bus[chave]["comparecimento"]:
                raise ValueError(f"Comparecimento divergente no extrato biométrico: {chave}")
            if r["status"] == "disponivel":
                if (r["local_bweb"] not in {r["local"], r["local_original_conferido"]}
                        or int(r["comparecimento_bweb"]) != comparecimento):
                    raise ValueError(f"Seção sem conciliação entre BWeb e cadastro: {chave}")
                n = int(r["liberacoes_apos_falha"])
                if not 0 <= n <= comparecimento:
                    raise ValueError(f"Liberações fora dos limites: {chave}")
                saida[chave] = n
            elif (r["status"] not in {"sem_detalhamento", "ausente_no_bweb", "local_divergente",
                                     "comparecimento_divergente"} or r["liberacoes_apos_falha"]):
                raise ValueError(f"Disponibilidade biométrica inconsistente: {chave}")
    if vistas != bus.keys():
        raise ValueError(f"O extrato de biometria não inclui {len(bus.keys() - vistas)} BUs")
    return saida


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fontes", type=Path, required=True)
    parser.add_argument("--boletins", type=Path, default=BOLETINS)
    parser.add_argument("--cadastro", type=Path, default=CADASTRO)
    parser.add_argument("--destino", type=Path, default=EXTRATO)
    parser.add_argument("--processos", type=int, default=4)
    args = parser.parse_args()
    print(dict(sorted(extrair(args.fontes, args.boletins, args.destino, args.processos, args.cadastro).items())))
