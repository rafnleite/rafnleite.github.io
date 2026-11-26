"""Conta exatamente os resultados de cinco erros de digitação em títulos de eleitor.

python teste_exaustivo_dv.py                gera os dois CSVs do universo completo
python teste_exaustivo_dv.py --conferir     verifica por enumeração e gera os CSVs
python teste_exaustivo_dv.py --titulo 163237360213   testa apenas o título informado

Os oito dígitos da sequência admitem 00000000 a 99999999. Todos os 28 códigos
de UF têm o mesmo peso. O cálculo dos DVs segue nota_dv.py. Tentativas são
ponderadas pelas posições e pelos dígitos sorteados, mesmo quando duas
tentativas diferentes produzem a mesma cadeia. Os índices internos começam em
zero; as posições nos CSVs começam em 1.
"""
import argparse
import csv
from collections import Counter, defaultdict
from dataclasses import dataclass
from functools import lru_cache
from itertools import combinations, product
from math import prod
from pathlib import Path

from nota_dv import calcular, digito


DIGITOS = tuple(range(10))
DOMINIOS = (DIGITOS,) * 8
UFS = tuple(f"{u:02}" for u in range(1, 29))
MOD = 11
ZERO = -1
SAIDA = Path(__file__).resolve().parent / "dados" / "relatorio"
CONTAGENS = ("tentativas", "outro_valido", "inalterado", "invalido")
PRIMEIROS = {(uf, dv): tuple(r for r in range(MOD) if digito(r, uf) == dv)
             for uf in UFS for dv in DIGITOS}


@dataclass
class Alteracao:
    nome: str
    posicoes: tuple
    mapa: tuple
    substituicoes: dict

    @property
    def variaveis_novas(self):
        return tuple(token for token in self.mapa if token >= 12)


def alteracoes():
    base = tuple(range(12))
    for tamanho in (1, 2):
        for posicoes in combinations(base, tamanho):
            mapa = list(base)
            substituicoes = {}
            for nova, posicao in enumerate(posicoes, start=12):
                mapa[posicao] = nova
                substituicoes[nova] = posicao
            yield Alteracao(f"substituicao_{tamanho}", posicoes, tuple(mapa), substituicoes)
    for p in range(11):
        yield Alteracao("transposicao", (p, p+1), base[:p] + (p+1, p) + base[p+2:], {})
    for p in base:
        yield Alteracao("omissao", (p,), (ZERO,) + base[:p] + base[p+1:], {})
    for p in base:
        yield Alteracao("insercao", (p,), base[:p] + (12,) + base[p:11], {})


def combinar(tabela, contribuicoes):
    """Convolução de contagens inteiras nos dois resíduos módulo 11."""
    saida = Counter()
    for (a, b), n in tabela.items():
        for (da, db), m in contribuicoes.items():
            saida[(a + da) % MOD, (b + db) % MOD] += n * m
    return saida


def pesos_do_miolo(op, dominios):
    """Conta (soma original, soma após a operação) dos algarismos livres.

    Um algarismo movido para UF/DVs precisa permanecer explícito e fica fora
    da convolução. Uma substituição na sequência entra com o par (velho,novo),
    cuja segunda componente tem exatamente nove escolhas.
    """
    pesos = {token: j+2 for j, token in enumerate(op.mapa[:8]) if token != ZERO}
    troca = {pos: nova for nova, pos in op.substituicoes.items()}
    tabela = {(0, 0): 1}
    for i, dominio in enumerate(dominios):
        if i in op.mapa[8:]:
            continue
        contrib = Counter()
        for original in dominio:
            antes = (i+2) * original
            if i in troca:
                for novo in DIGITOS:
                    if novo != original:
                        contrib[antes % MOD, (pesos[troca[i]] * novo) % MOD] += 1
            else:
                contrib[antes % MOD, (pesos.get(i, 0) * original) % MOD] += 1
        tabela = combinar(tabela, contrib)
    for nova in op.variaveis_novas:
        if nova in pesos and nova not in op.substituicoes:
            tabela = combinar(tabela, Counter((0, (pesos[nova] * x) % MOD) for x in DIGITOS))
    return tabela


def sufixo_original(uf, resto):
    a, b = map(int, uf)
    d = digito(resto, uf)
    return a, b, d, digito(7*a + 8*b + 9*d, uf)


def quantos_validos(op, dominios, ufs):
    """Inclui as operações cuja saída é idêntica à entrada."""
    tabela = pesos_do_miolo(op, dominios)
    saida = 0
    livres = [i for i in op.mapa[8:] if 0 <= i < 8 or i >= 12]
    # Agora só restam o sufixo conhecido (UF,DVs), um possível dígito da
    # sequência que foi deslocado até a UF e as novas teclas usadas no sufixo.
    for uf, resto in product(ufs, range(MOD)):
        base = {ZERO: 0, **dict(enumerate(sufixo_original(uf, resto), start=8))}
        escolhas = []
        for i in livres:
            if i < 8:
                escolhas.append(dominios[i])
            elif i in op.substituicoes:
                escolhas.append([x for x in DIGITOS if x != base[op.substituicoes[i]]])
            else:
                escolhas.append(DIGITOS)
        for valores in product(*escolhas):
            conhecidos = {**base, **dict(zip(livres, valores))}
            u, v, d, e = (conhecidos[i] for i in op.mapa[8:])
            uf_nova = str(u) + str(v)
            if uf_nova not in UFS or e != digito(7*u + 8*v + 9*d, uf_nova):
                continue
            antes = sum((i+2) * conhecidos[i] for i in livres if i < 8)
            depois = sum((j+2) * conhecidos[i] for j, i in enumerate(op.mapa[:8]) if i in conhecidos)
            for resto_novo in PRIMEIROS[uf_nova, d]:
                saida += tabela.get(((resto-antes) % MOD, (resto_novo-depois) % MOD), 0)
    return saida


@lru_cache(maxsize=None)
def somas_livres(blocos):
    """Distribuição da soma original sujeita a grupos de algarismos iguais."""
    anterior = [1] + [0] * 10
    for peso, dominio in blocos:
        nova = [0] * MOD
        for r, quantidade in enumerate(anterior):
            for x in dominio:
                nova[(r + peso*x) % MOD] += quantidade
        anterior = nova
    return anterior


def quantos_iguais(op, dominios, ufs):
    if op.substituicoes:
        return 0
    # xi deve coincidir com a variável que ocupa i depois da operação.
    grupos = [{i} for i in {ZERO, *range(12), *op.variaveis_novas}]
    for i, token in enumerate(op.mapa):
        a = next(g for g in grupos if i in g)
        b = next(g for g in grupos if token in g)
        if a is not b:
            grupos.remove(b)
            a.update(b)
    fixos, livres = [], []
    for grupo in grupos:
        prefixo = sorted(i for i in grupo if 0 <= i < 8)
        peso = sum(i+2 for i in prefixo)
        dominio = set(DIGITOS)
        for i in prefixo:
            dominio.intersection_update(dominios[i])
        constantes = [i for i in grupo if i == ZERO or 8 <= i < 12]
        if constantes:
            fixos.append((peso, dominio, constantes))
        else:
            livres.append((peso, tuple(sorted(dominio))))
    distribuicao = somas_livres(tuple(livres))
    iguais = 0
    for uf, r in product(ufs, range(MOD)):
        valores = {ZERO: 0, **dict(enumerate(sufixo_original(uf, r), start=8))}
        soma = 0
        for peso, dominio, indices in fixos:
            referencias = {valores[i] for i in indices}
            if len(referencias) != 1 or not referencias <= dominio:
                break
            soma += peso * valores[indices[0]]
        else:
            iguais += distribuicao[(r-soma) % MOD]
    return iguais


def linha(op, total, validos, iguais):
    assert 0 <= iguais <= validos <= total
    return dict(operacao=op.nome, posicao_1=op.posicoes[0]+1,
                posicao_2=op.posicoes[1]+1 if len(op.posicoes)>1 else "",
                tentativas=total, outro_valido=validos-iguais,
                inalterado=iguais, invalido=total-validos)


def contar(dominios=DOMINIOS, ufs=UFS):
    origens = prod(map(len, dominios)) * len(ufs)
    for op in alteracoes():
        teclas = prod(9 if i in op.substituicoes else 10 for i in op.variaveis_novas)
        yield linha(op, origens * teclas, quantos_validos(op, dominios, ufs), quantos_iguais(op, dominios, ufs))


def resumir(linhas):
    grupos = defaultdict(Counter)
    for r in linhas:
        grupos[r["operacao"]].update({k: r[k] for k in CONTAGENS})
    return [dict(operacao=nome, **contagens) for nome, contagens in grupos.items()]


def valido(t):
    return len(t) == 12 and t.isascii() and t.isdigit() and t[8:10] in UFS and calcular(t[:8], t[8:10])[2] == t[10:]


def enumerar(titulos):
    """Oráculo direto. Aplica alterações de strings, sem usar a aritmética da contagem."""
    for op in alteracoes():
        p = op.posicoes[0]
        total = val = iguais = 0
        for t in titulos:
            if op.nome == "substituicao_1":
                candidatos = (t[:p]+a+t[p+1:] for a in "0123456789" if a != t[p])
            elif op.nome == "substituicao_2":
                q = op.posicoes[1]
                candidatos = (t[:p]+a+t[p+1:q]+b+t[q+1:] for a, b in product("0123456789", repeat=2)
                              if a != t[p] and b != t[q])
            elif op.nome == "transposicao":
                candidatos = [t[:p]+t[p+1]+t[p]+t[p+2:]]
            elif op.nome == "omissao":
                candidatos = ["0"+t[:p]+t[p+1:]]
            else:
                candidatos = ((t[:p]+a+t[p:])[:12] for a in "0123456789")
            for candidato in candidatos:
                total += 1
                iguais += candidato == t
                val += valido(candidato)
        yield linha(op, total, val, iguais)


def conferir():
    dominios = ((0, 7), (0,), (0,), (0,), (1,), (9,), (0, 2), (0, 8))
    titulos = []
    for algarismos, uf in product(product(*dominios), UFS):
        seq = "".join(map(str, algarismos))
        titulos.append(seq + uf + calcular(seq, uf)[2])
    for direto, compacto in zip(enumerar(titulos), contar(dominios, UFS), strict=True):
        if direto != compacto:
            raise AssertionError((direto, compacto))
    print(f"Conferência direta aprovada nas 113 escolhas de posições para {len(titulos)} títulos.")


def salvar(nome, linhas):
    with (SAIDA / nome).open("w", encoding="utf-8-sig", newline="") as f:
        gravador = csv.DictWriter(f, fieldnames=linhas[0].keys())
        gravador.writeheader()
        gravador.writerows(linhas)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--conferir", action="store_true")
    ap.add_argument("--titulo", help="exibir probabilidades para um título de 12 dígitos")
    args = ap.parse_args()
    if args.conferir:
        conferir()
    if args.titulo:
        if not valido(args.titulo):
            ap.error("O título deve ter 12 dígitos, UF entre 01 e 28 e os dois DVs corretos.")
        resumo = resumir(enumerar([args.titulo]))
    else:
        linhas = list(contar())
        resumo = resumir(linhas)
        SAIDA.mkdir(parents=True, exist_ok=True)
        salvar("teste_dv_por_posicao.csv", linhas)
        salvar("teste_dv_resumo.csv", resumo)
    for r in resumo:
        print(r["operacao"], r["outro_valido"], "/", r["tentativas"],
              f"({100*r['outro_valido']/r['tentativas']:.8f}%)", "inalterados", r["inalterado"])


if __name__ == "__main__":
    main()
