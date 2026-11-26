"""Liga as seções do relatório ao cadastro dos locais de votação de cada turno.

No ZIP portátil, carregar_universo() usa dados/relatorio/votos_vizinhas_boletins.csv:
o extrato inclui todas as seções principais dos locais afetados, mesmo sem BU.
Para reconstruir o cruzamento nacional, coloque o arquivo
eleitorado_local_votacao_2026.zip em auditoria_mesarios/dados, ao lado de
todos_casos.csv, secoes_por_caso.csv e repeticoes_adicionais.csv. Na versão
portátil essa pasta é dados/, ao lado deste script. O cadastro oficial está em
https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip
e a edição de 25/10/2026 é conferida por SHA-256. Na pasta do script, é possível
baixá-lo com:

    curl.exe -fL https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip -o dados/eleitorado_local_votacao_2026.zip
"""
from collections import Counter, defaultdict
import csv
from dataclasses import dataclass
import hashlib
from io import TextIOWrapper
from operator import itemgetter
from pathlib import Path
from sys import intern
from zipfile import ZipFile

from geografia import SHA256_CADASTRO_LOCAIS as DIGEST, URL_CADASTRO_LOCAIS as URL


DADOS = Path(__file__).resolve().parent / "dados"
Chave = tuple[str, str, str, str, str]


def chave_secao(turno, uf, codigo_municipio, zona, secao) -> Chave:
    """Chave TSE usada no projeto: turno/UF/município com 5 dígitos/zona/seção."""
    return (intern(str(int(turno))), intern(uf.upper()), intern(f"{int(codigo_municipio):05d}"),
            intern(str(int(zona))), intern(str(int(secao))))


@dataclass
class Universo:
    marcadas: dict[Chave, frozenset[str]]
    casos: dict[tuple[str, str], str]
    suplementares: frozenset[Chave]
    locais: dict[Chave, Chave]
    nomes: dict[Chave, tuple[str, str]]
    agregadas: dict[Chave, Chave]
    escopo_locais: str


def _referencias(turno, texto):
    for referencia in texto.split(" | "):
        uf, municipio, zona, secao = referencia.split("/")
        yield chave_secao(turno, uf, municipio, zona.removeprefix("Z"), secao.removeprefix("S"))


def _casos(pasta):
    casos = {}
    por_caso = {}
    with (pasta / "todos_casos.csv").open(encoding="utf-8-sig", newline="") as arquivo:
        for linha in csv.DictReader(arquivo):
            chave = linha["turno"], linha["titulo"]
            refs = set(_referencias(chave[0], linha["referencias_secoes"]))
            if chave in casos or len(refs) < 2 or len(refs) != int(linha["secoes"]):
                raise ValueError(f"Caso repetido ou conjunto de seções inconsistente: {chave}")
            por_caso[chave] = refs
            casos[chave] = linha["id_caso"]
    if Counter(turno for turno, titulo in casos) != {"1": 7092, "2": 4774}:
        raise ValueError("O universo diverge dos 11.866 casos do relatório.")
    marcadas = defaultdict(set)
    with (pasta / "secoes_por_caso.csv").open(encoding="utf-8-sig", newline="") as arquivo:
        for linha in csv.DictReader(arquivo):
            caso = linha["turno"], linha["titulo"]
            s = chave_secao(linha["turno"], linha["uf"], linha["codigo_municipio"], linha["zona"], linha["secao"])
            if casos[caso] != linha["id_caso"] or s not in por_caso[caso] or int(linha["registros"]) < 1:
                raise ValueError(f"Vínculo sem confirmação entre o caso e o registro de presença: {caso}, {s}")
            por_caso[caso].remove(s)
            marcadas[s].add(linha["titulo"])
    if any(por_caso.values()):
        raise ValueError("Há seções sem registro no extrato dos casos do relatório.")
    suplementares = set()
    with (pasta / "repeticoes_adicionais.csv").open(encoding="utf-8-sig", newline="") as arquivo:
        for linha in csv.DictReader(arquivo):
            if (linha["turno"], linha["titulo"]) in casos:
                raise ValueError("Um caso suplementar também está no universo principal.")
            suplementares.update(_referencias(linha["turno"], linha["referencias_secoes"]))
    return {s: frozenset(ts) for s, ts in marcadas.items()}, casos, frozenset(suplementares)


def _locais_do_extrato(arquivo, marcadas, suplementares):
    locais, nomes = {}, {}
    with arquivo.open(encoding="utf-8-sig", newline="") as entrada:
        for r in csv.DictReader(entrada):
            s = chave_secao(r["turno"], r["uf"], r["codigo_municipio"], r["zona"], r["secao"])
            if s in locais:
                raise ValueError(f"Seção duplicada no extrato de votos: {s}")
            if (r["marcada"] != str(int(s in marcadas)) or r["suplementar"] != str(int(s in suplementares))
                    or set(r["titulos_repetidos"].split()) != marcadas.get(s, frozenset())):
                raise ValueError(f"Exposição no extrato diferente dos registros de presença: {s}")
            local = (*s[:-1], intern(str(int(r["local"]))))
            locais[s] = local
            nome = (r["municipio"], r["nome_local"])
            if nomes.setdefault(local, nome) != nome:
                raise ValueError(f"Nome divergente no extrato para {local}")
    faltantes = (marcadas.keys() | suplementares) - locais.keys()
    if faltantes:
        raise ValueError(f"Falta cadastro para {len(faltantes)} seção(ões) com repetição: {sorted(faltantes)[:5]}")
    if {locais[s] for s in marcadas} != nomes.keys():
        raise ValueError("O extrato contém locais sem nenhuma seção do universo principal.")
    # Totais de seções principais nos locais expostos, validados no cadastro nacional.
    if Counter(s[0] for s in locais) != {"1": 47266, "2": 25651}:
        raise ValueError("A cobertura do extrato diverge do cadastro, inclusive as seções sem BU.")
    return locais, nomes


def carregar_universo(pasta_dados=DADOS):
    """Retorna os casos, as urnas principais por local e o mapa das seções agregadas.

    `locais` mapeia a seção principal para (turno, UF, município, zona, local).
    `nomes[local]` contém (município, estabelecimento); a associação usa códigos,
    independentemente de geocodificação. `agregadas[secao]` identifica a seção
    principal da mesma zona que recebeu a votação da agregada. O código de
    local da seção principal prevalece mesmo se o da agregada divergir. No modo
    portátil, `escopo_locais == "locais_com_repeticao"`, `locais` contém só as
    principais desses estabelecimentos e `agregadas` fica vazio.
    """
    pasta = Path(pasta_dados)
    marcadas, casos, suplementares = _casos(pasta)
    caminho = pasta / "eleitorado_local_votacao_2026.zip"
    if not caminho.is_file():
        extrato = pasta / "relatorio" / "votos_vizinhas_boletins.csv"
        if not extrato.is_file():
            raise FileNotFoundError(f"Extrato portátil ausente em {extrato}. Salve o cadastro em {caminho}. Fonte: {URL}")
        locais, nomes = _locais_do_extrato(extrato, marcadas, suplementares)
        return Universo(marcadas, casos, suplementares, locais, nomes, {}, "locais_com_repeticao")
    with caminho.open("rb") as arquivo:
        if hashlib.file_digest(arquivo, "sha256").hexdigest() != DIGEST:
            raise ValueError("O arquivo de locais diverge do cadastro de 25/10/2026 usado no relatório.")
    locais, agregadas, nomes = {}, {}, {}
    # Muitas seções compartilham o mesmo local. Conserve uma única tupla por estabelecimento.
    chaves_locais = {}
    campos = ("NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO",
              "CD_TIPO_SECAO_AGREGADA", "NR_SECAO_PRINCIPAL", "NR_LOCAL_VOTACAO",
              "NM_MUNICIPIO", "NM_LOCAL_VOTACAO")
    with ZipFile(caminho) as z, z.open("eleitorado_local_votacao_2026_BRASIL.csv") as dados:
        leitor = csv.reader(TextIOWrapper(dados, encoding="latin1", newline=""), delimiter=";")
        cabecalho = next(leitor)
        extrair = itemgetter(*(cabecalho.index(c) for c in campos))
        for linha in leitor:
            turno, uf, municipio, zona, secao, tipo, principal, local, cidade, nome = extrair(linha)
            if uf == "ZZ":
                continue
            s = chave_secao(turno, uf, municipio, zona, secao)
            if s in locais or s in agregadas:
                raise ValueError(f"Seção duplicada no cadastro: {s}")
            if tipo == "2":
                agregadas[s] = (*s[:-1], intern(str(int(principal))))
            elif tipo == "1":
                candidato = (*s[:-1], intern(str(int(local))))
                chave_local = chaves_locais.setdefault(candidato, candidato)
                locais[s] = chave_local
                if nomes.setdefault(chave_local, (intern(cidade), nome)) != (cidade, nome):
                    raise ValueError(f"Nome divergente para o local {chave_local}")
            else:
                raise ValueError(f"Tipo de agregação desconhecido: {s}, {tipo}")
    if any(p not in locais for p in agregadas.values()):
        raise ValueError("Seção agregada sem a respectiva principal na mesma zona e turno.")
    if (marcadas.keys() | suplementares) - locais.keys():
        raise ValueError("Há seção marcada ou suplementar fora das principais do cadastro.")
    return Universo(marcadas, casos, suplementares, locais, nomes, agregadas, "nacional")
