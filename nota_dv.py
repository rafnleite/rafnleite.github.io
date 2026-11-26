"""Explicação e experimento reprodutível dos dígitos verificadores do título eleitoral."""
import csv
from collections import Counter
from pathlib import Path


RAIZ = Path(__file__).resolve().parent
NORMA = "https://www.tse.jus.br/legislacao/compilada/res/2021/resolucao-no-23-659-de-26-de-outubro-de-2021"
OBMEP = "https://clubes.obmep.org.br/blog/a-matematica-nos-documentos-titulo-de-eleitor/"
ARVOR = "https://brasil.arvor.co/auditoria-2026/mesarios/relatorio.html"
ROTULOS = {
    "substituicao": "Substituir um algarismo por outro",
    "transposicao": "Inverter dois vizinhos diferentes",
    "omissao": "Omitir um algarismo e repor um zero à esquerda",
}


def digito(soma, uf):
    resto = soma % 11
    if resto == 10:
        return 0
    if resto == 0 and uf in ("01", "02"):
        return 1
    return resto


def calcular(sequencia, uf):
    soma = sum(peso * int(algarismo) for peso, algarismo in enumerate(sequencia, 2))
    primeiro = digito(soma, uf)
    soma_final = 7 * int(uf[0]) + 8 * int(uf[1]) + 9 * primeiro
    return soma, soma_final, f"{primeiro}{digito(soma_final, uf)}"


def alteracoes(sequencia):
    for i, atual in enumerate(sequencia):
        for novo in "0123456789":
            if novo != atual:
                yield "substituicao", sequencia[:i] + novo + sequencia[i+1:]
        if i+1 < len(sequencia) and sequencia[i+1] != atual:
            yield "transposicao", sequencia[:i] + sequencia[i+1] + atual + sequencia[i+2:]
        omitida = "0" + sequencia[:i] + sequencia[i+1:]
        if omitida != sequencia:
            yield "omissao", omitida


def testar_mutacoes():
    with (RAIZ / "dados" / "todos_casos.csv").open(encoding="utf-8-sig", newline="") as arquivo:
        titulos = {r["titulo"] for r in csv.DictReader(arquivo)}
    totais = {tipo: Counter() for tipo in ROTULOS}
    for titulo in titulos:
        seq, uf, dv = titulo[:8], titulo[8:10], titulo[10:]
        if not (len(titulo)==12 and titulo.isascii() and titulo.isdigit() and 1 <= int(uf) <= 28
                and calcular(seq, uf)[2] == dv):
            raise ValueError(f"Origem incompatível com o teste de DV: {titulo}")
        # Esquecer qualquer 3 de um mesmo bloco 33 produz uma única sequência.
        for tipo, alternativa in set(alteracoes(seq)):
            detectada = calcular(alternativa, uf)[2] != dv
            totais[tipo]["detectadas" if detectada else "passaram"] += 1
    return len(titulos), totais


def numero(valor):
    return f"{valor:,}".replace(",", ".")


def porcento(parte, total):
    return f"{100*parte/total:.2f}".replace(".", ",") + "%"


def secao_dv():
    """Devolve um <section> autocontido; recalcula o quadro usando os dados da pasta."""
    from painel_dv_exaustivo import ler_csv, quadro_resumo
    n, totais = testar_mutacoes()
    experimento = quadro_resumo(ler_csv("teste_dv_resumo.csv"))
    linhas = []
    for tipo, rotulo in ROTULOS.items():
        detectadas = totais[tipo]["detectadas"]
        passaram = totais[tipo]["passaram"]
        total = detectadas + passaram
        linhas.append(f"<tr><th scope='row'>{rotulo}</th><td>{numero(total)}</td>"
                      f"<td>{numero(passaram)}</td><td>{porcento(detectadas, total)}</td></tr>")
    return f"""<section id="dv"><h2>Como funciona o dígito verificador</h2>
<p>O título eleitoral tem três partes. Em <code>16323736 | 02 | 13</code>, os primeiros oito dígitos são a sequência, <code>02</code> indica Minas Gerais como UF de origem da inscrição e <code>13</code> são os dois dígitos verificadores (DVs). A pessoa pode trabalhar em outro estado. O art. 36 determina o módulo 11 e prevê que a emissão pode desprezar zeros iniciais. <a href="{NORMA}">Resolução TSE nº 23.659/2021, art. 36</a>.</p>
<p>O primeiro DV usa a soma dos oito dígitos multiplicados, da esquerda para a direita, pelos pesos <code>2 3 4 5 6 7 8 9</code>. O segundo usa os dois dígitos da UF e o primeiro DV, com pesos <code>7 8 9</code>. Em cada etapa toma-se o resto da divisão por 11. O resto 10 vira 0. Na variante para títulos de origem paulista ou mineira, o resto 0 vira 1. Os pesos e a variante usados nesta conferência estão descritos pelos <a href="{OBMEP}">Clubes de Matemática da OBMEP</a>.</p>
<h3 id="teste-exaustivo-dv">Qual a chance de um erro produzir outro título válido?</h3>
<p>O teste abrange todas as posições do título, inclusive os dígitos da UF e os próprios verificadores. A contagem reúne 2,8 bilhões de combinações de sequência e UF com os dois DVs corretos, dando o mesmo peso a cada título. “Outro título válido” significa que o número mudou e ainda satisfaz as três verificações (UF, primeiro DV e segundo DV). A atribuição do número a uma pessoa depende do cadastro eleitoral.</p>
{experimento}
<p>Na simulação de uma omissão, um dos 12 dígitos sai e um zero entra à esquerda. Na inserção, um dígito entra antes de uma das 12 posições e o último original cai. O detalhamento traz os numeradores, os denominadores, os resultados por posição e as probabilidades calculadas separadamente nos títulos dos logs. <a href="teste_dv.html">Abrir o teste completo e a calculadora por título</a>.</p>
<h3>Por que a omissão de Goianésia passou pela conferência</h3>
<div class="scroll"><table><thead><tr><th>Entrada</th><th>Sequência</th><th>UF</th><th>Soma ponderada</th><th>DVs calculados</th></tr></thead><tbody>
<tr><td>Goianésia, 2º turno</td><td><code>16323736</code></td><td><code>02</code></td><td>187</td><td><code>13</code></td></tr>
<tr><td>Omissão do 2 na 4ª posição, como no 1º turno</td><td><code>01633736</code></td><td><code>02</code></td><td>187</td><td><code>13</code></td></tr>
<tr><td>Exemplo de substituição do 2 por 3 na mesma posição</td><td><code>16333736</code></td><td><code>02</code></td><td>192</td><td><code>56</code></td></tr>
</tbody></table></div>
<p>Omitir o <strong>2</strong> retira <code>5 × 2 = 10</code> da soma. Quando o número recebe um zero à esquerda, os três dígitos anteriores à omissão — <strong>1, 6 e 3</strong> — avançam uma posição e ganham uma unidade de peso cada. A soma recupera <code>1 + 6 + 3 = 10</code>. O restante da sequência, a UF e os DVs ficam nas mesmas posições. As duas somas dão <strong>187</strong>, múltiplo de 11. Para a UF 02, isso resulta no primeiro DV 1. A segunda soma é <code>7 × 0 + 8 × 2 + 9 × 1 = 25</code>, com resto 3. As duas grafias, portanto, passam com <strong>13</strong>.</p>
<p>Em Casa Nova, a omissão do 3 e a duplicação do 2 também preservam os DVs. Ali a soma muda de <strong>145 para 134</strong>. A diferença de 11 deixa o mesmo resto 2, a UF continua <code>05</code> e o segundo DV continua 3.</p>
<h3>Teste restrito aos primeiros oito dígitos dos títulos do recorte</h3>
<p>Nos casos de repetição identificados pela Arvor, os logs registram <strong>{numero(n)} títulos diferentes</strong>. Nesse teste, as alterações se limitam aos primeiros oito dígitos de cada título. A UF e os dois DVs conservam os valores originais. A tabela conta uma vez cada resultado diferente do original, por título de origem e tipo de alteração. Uma alteração foi detectada quando o novo cálculo divergiu dos DVs que permaneceram escritos.</p>
<div class="scroll"><table><thead><tr><th>Alteração simulada</th><th>Resultados testados</th><th>Passaram com os mesmos DVs</th><th>Detectados</th></tr></thead><tbody>{''.join(linhas)}</tbody></table></div>
<p>Trocar um algarismo por outro muda o resto da primeira soma. Dois restos podem produzir o mesmo dígito decimal, por isso algumas substituições passam. Na omissão seguida da reposição do zero, várias mudanças de peso podem se compensar e preservar até a soma inteira. O segundo DV também permanece igual sempre que a UF e o primeiro DV são preservados.</p>
<p>O teste detectou a maioria das omissões. A fração que passou foi de <strong>{porcento(totais['omissao']['passaram'],sum(totais['omissao'].values()))}</strong> nas omissões e <strong>{porcento(totais['substituicao']['passaram'],sum(totais['substituicao'].values()))}</strong> nas substituições. Essas porcentagens descrevem as alterações simuladas neste recorte. A frequência real dos erros de digitação e a identidade de quem usou a urna exigem outras evidências. <a href="{ARVOR}">Universo de títulos do relatório da Arvor</a>.</p></section>"""


if __name__ == "__main__":
    quantos, resultado = testar_mutacoes()
    print(f"{numero(quantos)} títulos distintos")
    for tipo, contagem in resultado.items():
        print(ROTULOS[tipo], dict(contagem))
