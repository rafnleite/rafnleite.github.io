"""Publica os casos em aberto com os trajetos, horários e registros das equipes."""
import csv
from collections import Counter, defaultdict
from html import escape
from pathlib import Path

from logistica import CURTO, EXTREMO, INCERTO
from listas_equipes import carregar_listas
from previa_equipes import atributo, botao, componentes


ROOT = Path(__file__).resolve().parent
DATA = ROOT / "dados"
NOMES = {EXTREMO: "Incompatibilidade extrema", CURTO: "Intervalo menor que a rota", INCERTO: "Trajeto sem estimativa"}
GRUPOS_GEOGRAFICOS = ("Mesmo município ou mesma zona eleitoral", "Municípios e zonas eleitorais diferentes")
GRUPOS_ESTADUAIS = ("Mesmo estado", "Estados diferentes")
ANCORAS_GEOGRAFICAS = ("mesmo-municipio-ou-zona", "municipio-e-zona-distintos")
FICHAS_INTERESTADUAIS = {"M-D811615A470E": "caso-mogi-petropolis", "M-9E8E183333B2": "caso-barrocas-patrocinio"}


def geografia_das_secoes(locais):
    municipios, zonas = set(), set()
    for uf, codigo_municipio, zona, _ in locais:
        municipios.add((uf, int(codigo_municipio)))
        zonas.add((uf, int(zona)))
    if not municipios:
        raise ValueError("Cada caso deve ter pelo menos uma seção identificada.")
    mesmo_municipio = len(municipios) == 1
    mesma_zona = len(zonas) == 1
    grupo_estadual = ""
    if not (mesmo_municipio or mesma_zona):
        ufs = {uf for uf, _ in municipios}
        grupo_estadual = GRUPOS_ESTADUAIS[0] if len(ufs) == 1 else GRUPOS_ESTADUAIS[1]
    return dict(grupo_geografico=GRUPOS_GEOGRAFICOS[0 if mesmo_municipio or mesma_zona else 1],
                grupo_estadual=grupo_estadual, mesmo_municipio=int(mesmo_municipio), mesma_zona=int(mesma_zona))


def ler(nome):
    with (DATA / (nome + ".csv")).open(encoding="utf-8-sig", newline="") as arq:
        yield from csv.DictReader(arq)


def chave(r):
    return r["turno"], r["titulo"]


def tempo(segundos):
    h, resto = divmod(round(float(segundos)), 3600)
    m, s = divmod(resto, 60)
    return (f"{h}h{m:02}min{s:02}s" if h else f"{m}min{s:02}s" if m else f"{s}s")


def decimal(v, casas=1):
    return f"{float(v):,.{casas}f}".replace(",", "_").replace(".", ",").replace("_", ".")


def secao(t, lado):
    return (f"{t['municipio_'+lado].title()}/{t['uf_'+lado]} · "
            f"Z{t['zona_'+lado]} S{t['secao_'+lado]}")


def trecho_principal(trechos, classe):
    candidatos = [t for t in trechos if t["avaliacao_logistica"] == classe]
    if classe == EXTREMO:
        return max(candidatos, key=lambda t: float(t["distancia_km"]) / (int(t["intervalo_s"])+120))
    if classe == CURTO:
        return max(candidatos, key=lambda t: float(t["tempo_trajeto_s"])-int(t["intervalo_s"]))
    return min(candidatos, key=lambda t: int(t["intervalo_s"]))


NOTAS = {
    "M-D811615A470E": (
        "O número 000000000400, ou 400, tem formato válido e foi o primeiro registro nas duas aberturas do 1º turno. "
        "Não consta nos respectivos encerramentos nem nos registros de mesário do 2º turno dessas seções. "
        "Três entradas inválidas precederam seu cadastro em Mogi Mirim, onde sete habilitações de eleitores foram atribuídas ao número. "
        "Considero mais provável o mau uso da função de cadastro. Em Mogi Mirim, considero 177371350183 o título pretendido mais provável. "
        "Foi o primeiro registro nas duas etapas do 2º turno, e os outros três títulos aparecem nas quatro listas. "
        "Os números diferem em 11 das 12 posições, o que afasta um simples erro de digitação. Se esse era o título pretendido, "
        "o registro de 400 foi um erro de operação da urna ao cadastrar o mesário. Uma mudança de integrante entre os turnos "
        "também poderia explicar a diferença entre as equipes."),
    "M-9E8E183333B2": "Em Barrocas, o título de Patrocínio Paulista foi o quinto da abertura (linha 6002). Antes dele houve quatro entradas inválidas e uma tentativa de repetir um cadastro. Depois houve mais sete entradas inválidas e três tentativas de repetir cadastros. Só os quatro primeiros títulos reaparecem no encerramento. Essa sequência é evidência de mau uso da função de cadastro. Em Patrocínio Paulista, o número aparece na abertura e no encerramento dos dois turnos.",
    "M-36DBCD935AE6": "Quatro Pontes tem uma hipótese concreta fora do limite de duas operações. Na seção 52, às 08:00:54, figurava 109699530604 na abertura (linha 6953). Às 17:01:51, no encerramento, aparece 109644590604 (linha 10996). Mudaram os dígitos das posições 5, 6 e 8 (9→4, 9→4, 3→9). Os outros três títulos da equipe permaneceram. No primeiro turno, 109699530604 aparece nas duas etapas da seção paranaense. Em São Paulo, o número repetido consta nas duas etapas dos dois turnos.",
    "M-6991E2FC1BB9": "Em São Paulo Z257 S168, 333501420108 na abertura e 355001420108 no encerramento ficam a três edições. Houve duas mudanças no quarteto. O outro par também é próximo: omitir um 7 de 311676790116 reproduz 031167690116 após o zero inicial. O padrão sustenta a hipótese de erros no registro da equipe.",
    "M-7D65F5D2F1F5": "Em Santa Teresa Z11 S55, 013588941406 foi o único dos cinco títulos da abertura que não voltou no encerramento do 2º turno. O número 013587111406 consta nas quatro listas de Santa Teresa. A troca do bloco 711 por 894 reproduz o título usado em Vila Velha nos dois turnos.",
    "M-9F780E3B9681": "Na seção 106 de Quixadá, os dois números a três edições aparecem juntos na abertura e no encerramento dos dois turnos. A semelhança nessa mesa deixa em aberto a ocorrência na seção 232.",
    "M-2D3BB916DE19": "Caso da capital paulista, zona 254. O título passou pelas seções 75 e 178 com dez segundos entre registros e 1,71 km em linha reta. Foram dez endereços no primeiro turno e zero habilitações atribuídas ao título.",
}


def coletar(casos, cenarios):
    from sankey_casos import INDICIO, SEM_EVIDENCIA
    abertos = {chave(r):r for r in casos if r["grupo"] in (SEM_EVIDENCIA, INDICIO)}
    testes = {chave(r):r for r in ler("duas_edicoes_casos")}
    originais = {chave(r):r for r in ler("logistica_por_caso")}
    catalogo = {chave(r):r for nome in ("comparacao_casos","revisao_comparacao_casos") for r in ler(nome)}
    secoes = defaultdict(list)
    for nome in ("comparacao_secoes","revisao_comparacao_secoes"):
        for r in ler(nome):
            secoes[chave(r)].append(f"{r['municipio'].title()}/{r['uf']} Z{r['zona']} S{r['secao']}")
    evidencias = {r["id_caso"]:r for r in ler("conferencia_coordenadas")}
    campos_local = ("uf","codigo_municipio","zona","secao")
    logs = {(r["turno"], *(r[c] for c in campos_local)):r["url_log"]
            for nome in ("downloads","revisao_manifesto") for r in ler(nome)}
    ambos = {chave(r):r for r in ler("logistica_por_caso_revisao")}
    if set(ambos) != set(testes) or set(ambos) != set(catalogo):
        raise ValueError("Universos de comparação e geografia diferentes")
    saida = []
    for k, r in ambos.items():
        classe = r["avaliacao"]
        if k not in abertos:
            continue
        ident = catalogo[k]["id_caso"]
        teste = cenarios[k]
        trecho = teste["trecho_referencia"]
        notas = [abertos[k]["contexto"], evidencias.get(ident, {}).get("interpretacao", "")]
        nota = " ".join(dict.fromkeys(s for s in notas if s))
        seg = trecho["tempo_trajeto_s"]
        falta = teste["deficit_referencia_s"]
        referencia = {}
        for lado in ("origem","destino"):
            referencia["log_"+lado]=logs[(k[0],*(trecho[c+"_"+lado] for c in campos_local))]
            referencia["membro_"+lado]=trecho["membro_"+lado]
            referencia["linha_"+lado]=trecho["linha_"+lado]
        saida.append(dict(grupo=abertos[k]["grupo"], desfecho=abertos[k]["desfecho"],
                          resultado_relogios=teste["resultado"], margem_entre_relogios_s=teste["margem_total_s"],
                          avaliacao_anterior=classe, criterio=teste["motivo"], tipo_referencia=teste["tipo_referencia"],
                          grupo_geografico=abertos[k]["grupo_geografico"], grupo_estadual=abertos[k]["grupo_estadual"],
                          mesmo_municipio=abertos[k]["mesmo_municipio"],
                          mesma_zona=abertos[k]["mesma_zona"], turno=k[0], titulo=k[1], id_caso=ident, todas_secoes=" | ".join(secoes[k]),
                          origem=secao(trecho,"origem"), destino=secao(trecho,"destino"),
                          hora_origem=trecho["hora_origem"], hora_destino=trecho["hora_destino"],
                          evento_origem=trecho["evento_origem"], evento_destino=trecho["evento_destino"],
                          distancia_reta_km=trecho["distancia_km"], intervalo_s=trecho["intervalo_s"],
                          modo=trecho["modo"], trajeto_estimado_s=seg, deficit_s=falta,
                          classificacao_arvor=originais[k]["avaliacao"] if k in originais else "Mesmo local cadastrado",
                          nota=nota, **referencia, ficha=f"relatorio_tecnico.html#f-{k[0]}-{ident.lower()}",
                          listas_equipes=f"relatorio_tecnico.html#equipes-{k[0]}-{ident.lower()}"))
    if {chave(r) for r in saida} != abertos.keys():
        raise ValueError("A lista de casos em aberto diverge dos desfechos do Sankey.")
    saida.sort(key=lambda r:(r["turno"], GRUPOS_GEOGRAFICOS.index(r["grupo_geografico"]),
                            r["origem"], r["destino"], r["id_caso"]))
    return saida


def linha_html(r):
    distancia = decimal(r["distancia_reta_km"],2)+" km" if r["distancia_reta_km"] else "Sem coordenada"
    estim = tempo(r["trajeto_estimado_s"])+" · "+escape(r["modo"]) if r["trajeto_estimado_s"] else "Sem estimativa"
    if r["deficit_s"] and r["trajeto_estimado_s"] != "":
        estim += f"<small>Excede o intervalo registrado + 10 min em {tempo(r['deficit_s'])}, no sentido indicado.</small>"
    nota = f"<p>{escape(r['nota'])}</p>" if r["nota"] else ""
    if ancora := FICHAS_INTERESTADUAIS.get(r["id_caso"]):
        nota += f"<p><a href='relatorio.html#{ancora}'>Ver a sequência de registros e as fontes deste caso</a>.</p>"
    fontes = " → ".join(f"<a href='{escape(r['log_'+lado])}'>{r['hora_'+lado]} ({r['evento_'+lado]}) · "
                        f"{escape(r['membro_'+lado])}, linha {r['linha_'+lado]}</a>" for lado in ("origem","destino"))
    info = f"<details><summary>Seções e logs originais</summary><p>{escape(r['todas_secoes'])}</p><p>{fontes}</p></details>"
    ver_equipes = botao(r, f"Ver os títulos de abertura e encerramento das {r['numero_secoes']} seções", r["listas_equipes"])
    desfecho = escape(r["grupo"])
    return (f"<tr><td>{r['turno']}º</td><td><a href='{escape(r['ficha'])}' {atributo(r)}><strong><code>{escape(r['titulo'])}</code></strong></a>"
            f"<br>{escape(r['origem'])} → {escape(r['destino'])}<small>{desfecho} · {escape(r['id_caso'])}</small>{nota}"
            f"<p>{ver_equipes}</p>{info}</td>"
            f"<td>{distancia}</td><td>{tempo(r['intervalo_s'])}</td><td>{estim}</td>"
            f"<td><strong>{r['maximo_no_turno']}</strong><small>{int(r['numero_secoes_mais_de_4'])} de {r['numero_secoes']} seções com mais de quatro</small></td></tr>")


def publicar():
    from nota_mesario import leitura_casos_em_aberto
    from relogios import IMPROVAVEL, avaliar
    from sankey_casos import aplicar_margem, obter
    casos, _ = obter()
    cenarios = avaliar()
    casos = aplicar_margem(casos, cenarios)
    lista = coletar(casos, cenarios)
    estilo_previa, controles_previa = componentes(carregar_listas(), map(chave,lista))
    equipes = {chave(r):r for r in ler("relatorio/equipes_em_aberto_casos")}
    if equipes.keys() != {chave(r) for r in lista}:
        raise ValueError("Regerar o CSV de equipes para a lista atual de casos sem explicação.")
    for r in lista:
        e = equipes[chave(r)]
        r.update({k:e[k] for k in ("numero_secoes", "maximo_no_turno", "numero_secoes_mais_de_4", "secoes_mais_de_4")})
    with (DATA/"lista_casos_em_aberto.csv").open("w",encoding="utf-8-sig",newline="") as out:
        w=csv.DictWriter(out,fieldnames=list(lista[0]))
        w.writeheader()
        w.writerows(lista)
    improvaveis = Counter(r["turno"] for r in casos if r["situacao_relogios"] == IMPROVAVEL)
    turnos = Counter(r["turno"] for r in lista)
    mais_quatro = Counter(r["turno"] for r in lista if int(r["numero_secoes_mais_de_4"]) > 0)
    por_ciclo = {quando: sum(int(e["secoes_mais_de_4_em_"+quando]) > 0 for e in equipes.values())
                 for quando in ("um_ciclo", "uma_abertura", "um_encerramento")}
    inconclusivos = sum(r["desfecho"] == "Indício numérico inconclusivo" for r in lista)
    nota_indicios = f" Em {inconclusivos} há indício numérico inconclusivo de erro de digitação." if inconclusivos else ""
    por_geografia = Counter(r["grupo_geografico"] for r in lista)
    tabelas=[]
    for turno in ("1", "2"):
        tabelas.append(f"<section id='turno-{turno}'><h2>{turno}º turno · {turnos[turno]} casos em aberto</h2>")
        for grupo, ancora in zip(GRUPOS_GEOGRAFICOS, ANCORAS_GEOGRAFICAS):
            linhas = [r for r in lista if r["turno"] == turno and r["grupo_geografico"] == grupo]
            tabelas.append(f"<h3 id='turno-{turno}-{ancora}'>{grupo} · {len(linhas)} casos</h3>")
            subgrupos = GRUPOS_ESTADUAIS if grupo == GRUPOS_GEOGRAFICOS[1] else ("",)
            for subgrupo in subgrupos:
                casos_subgrupo = [r for r in linhas if r["grupo_estadual"] == subgrupo]
                if not casos_subgrupo:
                    continue
                if subgrupo:
                    qtd = len(casos_subgrupo)
                    tabelas.append(f"<h4>{subgrupo} · {qtd} {'caso' if qtd == 1 else 'casos'}</h4>")
                tabelas.append("<div class='largo'><table><thead><tr><th>Turno</th><th>Título registrado e trecho</th>"
                               "<th>Linha reta</th><th>Intervalo</th><th>Rota estimada</th>"
                               "<th>Máximo de títulos numa seção no turno</th></tr></thead>"
                               f"<tbody>{''.join(map(linha_html, casos_subgrupo))}</tbody></table></div>")
        tabelas.append("</section>")
    html = f"""<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quais casos permanecem em aberto? · Mesários 2026</title>
<style>*{{box-sizing:border-box}}body{{margin:0;color:#223532;font:16px/1.5 'Segoe UI',Arial,sans-serif;background:#fafbf7}}main{{max-width:1150px;margin:auto;padding:24px clamp(16px,4vw,52px) 50px}}h1,h2{{font-family:Georgia,serif;font-weight:500;color:#143f38;line-height:1.15}}h1{{font-size:clamp(2em,5vw,3.5em)}}h2{{margin-top:1.5em}}p{{max-width:88ch}}a,summary{{color:#07574d}}a{{text-underline-offset:3px}}nav{{display:flex;flex-wrap:wrap;gap:8px 20px}}.largo{{overflow-x:auto}}table{{width:100%;border-collapse:collapse;font-size:.91rem}}td,th{{padding:10px 8px;border-bottom:1px solid #c3d0c9;text-align:left;vertical-align:top}}th{{background:#e9f1eb}}td:nth-child(2){{min-width:230px;width:57%}}small{{display:block;color:#4c625a}}td p{{max-width:80ch;margin:.4em 0}}details{{margin-top:.35em}}summary{{cursor:pointer}}code{{white-space:nowrap}}.intro{{background:#eef4ec;border-left:3px solid #186452;padding:6px 16px;margin:12px 0}}@media print{{.largo{{overflow:visible}}nav{{display:none}}tr{{break-inside:avoid}}}}</style>
{estilo_previa}
<main><nav><a href="relatorio.html">Relatório ilustrado</a><a href="dados/lista_casos_em_aberto.csv">Lista completa em CSV</a></nav>
<h1>Quais casos permanecem em aberto?</h1>
<div class="intro"><p>Admiti até <strong>dez minutos de diferença entre os relógios das urnas</strong>. Dos <strong>{sum(improvaveis.values())} casos de deslocamento improvável</strong>, {improvaveis['1']} ocorreram no primeiro turno e {improvaveis['2']} no segundo. Após comparar os títulos das equipes, <strong>{len(lista)} casos seguem em aberto</strong>, sendo {turnos['1']} no primeiro turno e {turnos['2']} no segundo.{nota_indicios} <a href="relatorio.html#cenario-relogios">Ver os critérios de horário</a>.</p>
<p>Em <strong>{por_geografia[GRUPOS_GEOGRAFICOS[0]]} casos</strong>, todas as seções pertencem ao mesmo município ou à mesma zona eleitoral. Nos outros <strong>{por_geografia[GRUPOS_GEOGRAFICOS[1]]}</strong>, as seções envolvem municípios e zonas eleitorais diferentes. A comparação usa os códigos do cadastro do TSE e leva em conta a UF de cada seção. O agrupamento indica onde ocorreram os registros. A avaliação do deslocamento leva em conta o tempo entre eles.</p></div>
{leitura_casos_em_aberto()}
<p>Em <strong>{sum(int(e['secoes_com_repetido_apos_quatro_no_turno']) > 0 for e in equipes.values())} dos {len(lista)} casos</strong>, o próprio título repetido apareceu pela primeira vez na seção depois do cadastro de quatro ou mais títulos distintos no turno. <a href="relatorio.html#equipes">Ver a contagem por turno</a> · <a href="relatorio.html#interestaduais">Ler as duas análises interestaduais</a>.</p>
<p><strong>{sum(mais_quatro.values())} dos {len(lista)} casos</strong> têm pelo menos uma seção com mais de quatro títulos distintos em registros de presença no turno, sendo {mais_quatro['1']} no primeiro e {mais_quatro['2']} no segundo. A contagem reúne os registros da mesma seção ao longo do turno. Um mesmo número presente na abertura e no encerramento conta uma vez. Títulos distintos também podem resultar de substituição ou erro de digitação. <a href="dados/relatorio/equipes_em_aberto_casos.csv" download>Conferir a contagem por caso</a>.</p>
<p>Em <strong>{por_ciclo['um_ciclo']} casos</strong>, pelo menos uma seção já ultrapassava quatro títulos dentro de uma única sequência de registro da equipe. Isso ocorreu em {por_ciclo['uma_abertura']} casos na abertura e em {por_ciclo['um_encerramento']} no encerramento. <a href="dados/relatorio/equipes_em_aberto_secoes.csv" download>Ver títulos, etapas e linhas do log por seção</a>.</p>
<p>Cada linha mostra um trecho de referência na ordem dos horários dos logs. A avaliação de cada caso considera os trajetos entre todos os registros em ordem cronológica e mantém um ajuste fixo no relógio de cada urna. Em alguns casos, cada trecho isolado cabe com dez minutos adicionais, mas os ajustes necessários para os vários trechos são incompatíveis entre si. Os horários na tabela são os que a urna registrou. <a href="dados/relatorio/relogios_10min_trechos.csv" download>Baixar os trechos e os horários testados</a>.</p>
<nav><a href="#turno-1">1º turno · {turnos['1']} casos</a><a href="#turno-2">2º turno · {turnos['2']} casos</a></nav>
{''.join(tabelas)}
<nav><a href="relatorio.html#possiveis">Deslocamentos possíveis</a><a href="sankey_turnos.html">Sankey por turno</a><a href="dados/duas_edicoes_pares.csv">Pares de títulos</a><a href="dados/trajetos_por_evento_revisao.csv">Trajetos e horários</a><a href="dados/conferencia_coordenadas.csv">Coordenadas complementares</a><a href="casos_em_aberto.py">Script da lista</a></nav>
</main>{controles_previa}</html>"""
    (ROOT/"casos_em_aberto.html").write_text(html,encoding="utf-8")
    print("Casos em aberto por turno:", dict(turnos), "· mais de quatro títulos em pelo menos uma seção:", dict(mais_quatro))


if __name__=="__main__":
    publicar()
