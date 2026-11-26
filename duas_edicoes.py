"""Verifica se até duas edições nos algarismos de outro título reproduzem o título repetido.

A origem é a sequência publicada com 12 posições. A grafia final pode ter quantidade
diferente de zeros iniciais: com duas edições ela pode ter de 10 a 14 caracteres.
O preenchimento/remoção dos zeros iniciais é feito apenas para comparar o resultado
com o valor do título registrado. As posições nos passos são contadas a partir de 1
na sequência exibida em cada passo. Em uma inserção a posição é a do dígito inserido.
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from itertools import combinations
from pathlib import Path

from comparar import DADOS, TITULO, ler_csv, saidas_temporarias, saida, secao

DIGITOS = "0123456789"
TIPOS = ("omissao", "duplicacao", "insercao", "substituicao", "troca_adjacente", "troca_nao_adjacente")
PREFERENCIA = dict(zip(TIPOS, (1, 0, 3, 2, 1, 4)))
GRUPOS = ("registro_turno", "registro_outro_turno", "mencao_turno", "mencao_outro_turno")
MODELOS = ("usual", "ampliado")
ADICIONAIS = ("escopo", "fonte", "custo_usual", "caminho_usual", "custo_ampliado",
              "caminho_ampliado", "contraste_ampliado_entre_turnos")


@dataclass(frozen=True)
class Passo:
    tipo: str
    antes: str
    depois: str
    posicoes: tuple[int, ...]
    digitos_antes: str
    digitos_depois: str


def passo_inserir(antes, depois, indice):
    digito = depois[indice]
    tipo = "duplicacao" if indice and antes[indice - 1] == digito else "insercao"
    return Passo(tipo, antes, depois, (indice + 1,), "", digito)


def passo_trocar(antes, depois, i, j):
    tipo = "troca_adjacente" if j == i + 1 else "troca_nao_adjacente"
    return Passo(tipo, antes, depois, (i + 1, j + 1),
                 antes[i] + antes[j], depois[i] + depois[j])


def vizinhos(origem):
    """Gera todas as operações de uma tecla e permutas distintas de duas posições."""
    for i, atual in enumerate(origem):
        prefixo, sufixo = origem[:i], origem[i+1:]
        yield Passo("omissao", origem, prefixo + sufixo, (i+1,), atual, "")
        for d in DIGITOS:
            if atual != d:
                yield Passo("substituicao", origem, prefixo + d + sufixo, (i+1,), atual, d)
    for i in range(len(origem) + 1):
        for d in DIGITOS:
            yield passo_inserir(origem, origem[:i] + d + origem[i:], i)
    for i, j in combinations(range(len(origem)), 2):
        if origem[i] != origem[j]:
            resultado = origem[:i] + origem[j] + origem[i+1:j] + origem[i] + origem[j+1:]
            yield passo_trocar(origem, resultado, i, j)


def passo_final(origem, alvo):
    """Operações de custo exatamente um entre duas grafias literais."""
    diferenca = len(alvo) - len(origem)
    if diferenca == -1:
        for i, d in enumerate(origem):
            if origem[:i] + origem[i+1:] == alvo:
                yield Passo("omissao", origem, alvo, (i+1,), d, "")
    elif diferenca == 1:
        for i in range(len(alvo)):
            if alvo[:i] + alvo[i+1:] == origem:
                yield passo_inserir(origem, alvo, i)
    elif diferenca == 0:
        alteradas = [i for i,(a,b) in enumerate(zip(origem,alvo)) if a != b]
        if len(alteradas) == 1:
            i = alteradas[0]
            yield Passo("substituicao", origem, alvo, (i+1,), origem[i], alvo[i])
        elif len(alteradas) == 2:
            i,j = alteradas
            if origem[i] == alvo[j] and origem[j] == alvo[i]:
                yield passo_trocar(origem, alvo, i, j)


def grafias_alvo(origem, destino):
    """Pré-filtros necessários: duas operações podem mudar até dois dígitos de cada contagem."""
    base = destino.lstrip("0") or "0"
    contagem = Counter(origem)
    for tamanho in range(max(len(base), len(origem)-2), len(origem)+3):
        alvo = base.zfill(tamanho)
        outra = Counter(alvo)
        if max((contagem-outra).total(), (outra-contagem).total()) > 2:
            continue
        yield alvo


def preferencia(passos, destino):
    # Somente desempata caminhos igualmente curtos; preserva a grafia final literal e
    # privilegia duplicação do dígito vizinho sobre inserção arbitrária do mesmo dígito.
    return (len(passos), sum(s.tipo == "troca_nao_adjacente" for s in passos),
            abs(len(passos[-1].depois)-len(destino)),
            sum(PREFERENCIA[s.tipo] for s in passos),
            tuple(TIPOS.index(s.tipo) for s in passos), tuple(s.posicoes for s in passos))


def calcular(origem: str, destino: str):
    if not TITULO.fullmatch(origem) or not TITULO.fullmatch(destino) or origem == destino:
        raise ValueError("Os dois títulos precisam ter 12 algarismos e ser distintos.")
    alvos = tuple(grafias_alvo(origem, destino))
    resultados = {m: () for m in MODELOS}
    prioridades = {}

    def aceitar(passos):
        classe = ("ampliado",) if any(s.tipo=="troca_nao_adjacente" for s in passos) else MODELOS
        ordem = preferencia(passos, destino)
        for modelo in classe:
            if modelo not in prioridades or ordem < prioridades[modelo]:
                resultados[modelo] = passos
                prioridades[modelo] = ordem

    for alvo in alvos:
        for ultimo in passo_final(origem, alvo):
            aceitar((ultimo,))
    if alvos and not resultados["usual"]:
        for primeiro in vizinhos(origem):
            for alvo in alvos:
                for ultimo in passo_final(primeiro.depois, alvo):
                    aceitar((primeiro, ultimo))
    return resultados


def serie(valor):
    return json.dumps(valor, ensure_ascii=False, separators=(",", ":"))


def categoria(custos, fonte):
    return min((c for g,c in custos.items() if g.startswith(fonte)), default=None)


def calcular_tabelas(dados):
    arquivos = []
    casos = {}
    repetido_outro_turno = {}
    campos = []
    for nome, prefixo in (("base", ""), ("revisao_adicional", "revisao_")):
        for r in ler_csv(dados / f"{prefixo}comparacao_casos.csv"):
            chave = nome, r["turno"], r["titulo"]
            if chave in casos:
                raise ValueError("Caso duplicado")
            casos[chave] = dict(escopo=nome, turno=r["turno"], titulo=r["titulo"], id_caso=r["id_caso"])
        for r in ler_csv(dados / f"{prefixo}comparacao_secoes.csv"):
            repetido_outro_turno[nome,r["titulo"],secao(r)] = r["repetido_tambem_no_outro_turno"]
        for fonte, sufixo in (("registro", "titulos"), ("mencao", "suplementar")):
            arq = dados / f"{prefixo}comparacao_{sufixo}.csv"
            arquivos.append((nome,fonte,arq))
            with arq.open(encoding="utf-8-sig",newline="") as f:
                for campo in next(csv.reader(f)):
                    if campo not in campos:
                        campos.append(campo)

    custos = defaultdict(dict)
    quantidades = defaultdict(Counter)
    cache = {}
    controle = defaultdict(Counter)
    contrastes = set()
    resumo = {}
    with saidas_temporarias(dados) as (pasta, arquivos_abertos):
        out = saida(pasta, "duas_edicoes_pares.csv", campos+list(ADICIONAIS), arquivos_abertos)
        for escopo, fonte, arquivo in arquivos:
            for r in ler_csv(arquivo):
                chave = escopo, r["turno"], r["titulo"]
                origem, repetido = r["titulo_alternativo"],r["titulo"]
                if chave not in casos:
                    raise ValueError("Comparação sem ficha")
                if (origem,repetido) not in cache:
                    cache[origem,repetido] = calcular(origem, repetido)
                caminhos = cache[origem,repetido]
                if r["operacoes"] and len(caminhos["ampliado"])!=1:
                    raise ValueError("O teste ampliado perdeu uma transformação anteriormente verificada")
                grupo = fonte + ("_turno" if r["turno"]==r["turno_fonte"] else "_outro_turno")
                controle[escopo][grupo] += 1
                linha = dict(r, escopo=escopo, fonte=fonte)
                contexto = repetido_outro_turno[escopo, repetido, secao(r)]
                if fonte == "registro" and contexto != "":
                    combinado = bool(caminhos["ampliado"] and contexto=="0" and
                        r["alternativo_nos_dois_turnos"]=="1" and r["repetido_em_outra_ponta_no_outro_turno"]=="1")
                    linha["contraste_ampliado_entre_turnos"] = int(combinado)
                    if combinado:
                        contrastes.add(chave)
                for modelo, passos in caminhos.items():
                    custo = len(passos)
                    linha["custo_"+modelo] = custo or ""
                    linha["caminho_"+modelo] = serie([asdict(s) for s in passos])
                    if custo:
                        menor = custos[chave,modelo]
                        menor[grupo] = min(custo,menor.get(grupo,3))
                        quantidades[chave,modelo][grupo] += 1
                out.writerow(linha)

        campos_caso = ["escopo","turno","titulo","id_caso","contraste_ampliado_entre_turnos"]
        for modelo in MODELOS:
            campos_caso += [f"custo_{modelo}_{g}" for g in GRUPOS]
            campos_caso += [f"linhas_compativeis_{modelo}_{g}" for g in GRUPOS]
        saida_casos = saida(pasta,"duas_edicoes_casos.csv",campos_caso,arquivos_abertos)
        for chave,r in casos.items():
            r["contraste_ampliado_entre_turnos"] = int(chave in contrastes)
            for modelo in MODELOS:
                escores = custos[chave,modelo]
                for grupo in GRUPOS:
                    r[f"custo_{modelo}_{grupo}"] = escores.get(grupo,"")
                    r[f"linhas_compativeis_{modelo}_{grupo}"] = quantidades[chave,modelo][grupo]
            saida_casos.writerow(r)
        for escopo in controle:
            grupo = [chave for chave in casos if chave[0]==escopo]
            total = dict(casos=len(grupo), comparacoes=dict(controle[escopo]),
                         casos_com_contraste_ampliado_entre_turnos=sum(chave in contrastes for chave in grupo))
            for modelo in MODELOS:
                grupos = Counter()
                for chave in grupo:
                    escores = custos[chave,modelo]
                    registro = categoria(escores,"registro")
                    mencao = categoria(escores,"mencao")
                    if registro:
                        grupos["registro_"+str(registro)] += 1
                        origem_turno = "mesmo_turno" if escores.get("registro_turno")==registro else "so_outro_turno"
                        grupos[f"registro_{registro}_{origem_turno}"] += 1
                    elif mencao:
                        grupos["so_mencao_"+str(mencao)] += 1
                        origem_turno = "mesmo_turno" if escores.get("mencao_turno")==mencao else "so_outro_turno"
                        grupos[f"so_mencao_{mencao}_{origem_turno}"] += 1
                    else:
                        grupos["sem_candidato"] += 1
                total[modelo] = dict(sorted(grupos.items()))
            resumo[escopo] = total
        (pasta/"duas_edicoes_resumo.json").write_text(json.dumps(resumo,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return resumo


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dados",type=Path,default=DADOS)
    print(json.dumps(calcular_tabelas(parser.parse_args().dados),ensure_ascii=False,indent=2))
