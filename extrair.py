"""Extrai as equipes e todas as menções aos seus títulos repetidos em um manifesto.

    python extrair.py
    python extrair.py --etapa equipes --parcial
    python extrair.py --manifesto outro.csv --saida outro-diretorio
    python extrair.py --arquivo urna.jez --titulo 000000000000 --saida conferencia

Usa a biblioteca padrão. O manifesto, em UTF-8/CSV, contém turno, uf,
codigo_municipio, zona, secao, arquivo e, opcionalmente, sha256. Caminhos
relativos apontam para a pasta do manifesto. A mesma rotina aceita um
manifesto mais amplo, inclusive nacional, com uma linha por seção/turno.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
import csv
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import unicodedata
import zipfile
import zlib


BASE = Path(__file__).resolve().parent / "dados"
KEY = ("turno", "uf", "codigo_municipio", "zona", "secao")
TEAM = KEY + ("titulo", "registros", "habilitacoes", "primeiro", "ultimo")
EVENT = KEY + ("titulo", "data_hora", "urna", "tipo", "membro", "linha")
MENTION = KEY + ("titulo", "grafia", "data_hora", "nivel", "urna", "modulo",
                 "mensagem", "autenticador", "membro", "linha", "arquivo", "sha256", "linha_original")
DATES = {"1": {"04/10/2026", "05/10/2026"}, "2": {"25/10/2026", "26/10/2026"}}
# Localiza só os eventos e as declarações de contexto relevantes. As mensagens
# são decodificadas por fragmento; a urna pode usar Latin-1 ou UTF-8.
INTEREST = re.compile(rb"\t(?:SCUE|GAP|VOTA)\t(?:Fase da UE:|Munic|Zona Eleitoral:|Se.{1,5}o Eleitoral:|Iniciando aplica|Mes.{1,3}rio [0-9]{12} (?:registrado|habilitou o eleitor)\t)")
TITLE_LABEL = rb"(?:[Mm]es.{1,3}rio|[Tt].{1,3}tulo(?: digitado para encerramento)?)[ :]+([0-9]{1,12})\b"
INTEREST_EXTENDED = re.compile(INTEREST.pattern + b"|" + TITLE_LABEL)
SUPPLEMENT = re.compile(TITLE_LABEL)
TITLE_EVENT = re.compile(r"Mesário ([0-9]{12}) (registrado|habilitou o eleitor)", re.I)
LOCATION = {"municipio": 0, "zona eleitoral": 1, "secao eleitoral": 2}
TURN = re.compile(r"\b([12])\s*[°ºo]?\s*turno\b")
TOKEN = re.compile(rb"\b[0-9]{12}\b")
UNPADDED = re.compile(rb"(?:[Mm](?i:es.{1,3}rio)|[Tt](?i:.{1,3}tulo(?: digitado para encerramento)?))[ :]+([0-9]{1,11})\b")
TITLE_SET: set[bytes] = set()


def norm(value):
    return "".join(c for c in unicodedata.normalize("NFD", value.lower()) if not unicodedata.combining(c))


def open_logs(content, prefix="", budget=None, depth=0):
    if budget is None:
        budget = [0, 0]
    if depth > 6:
        raise ValueError("excesso de níveis no pacote")
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        # Registros históricos ou rotacionados costumam estar nos pacotes internos.
        members = sorted((m for m in archive.infolist() if not m.is_dir()),
                         key=lambda m: (m.filename.lower().endswith("logd.dat"), m.filename))
        for member in members:
            budget[0] += 1
            budget[1] += member.file_size
            if budget[0] > 512 or budget[1] > 256 * 1024 * 1024:
                raise ValueError("limite de descompactação excedido")
            name = member.filename.lower()
            if name.endswith((".jez", ".zip")):
                yield from open_logs(archive.read(member), prefix + member.filename + "/", budget, depth + 1)
            elif name.endswith("logd.dat"):
                yield prefix + member.filename, archive.read(member)


def encoding(raw):
    try:
        raw.decode("utf-8")
    except UnicodeDecodeError:
        return "latin-1"
    return "utf-8"


def identify(row):
    return (str(int(row["turno"])), row["uf"].upper(), str(int(row["codigo_municipio"])).zfill(5),
            str(int(row["zona"])), str(int(row["secao"])))


def read_package(row):
    path = Path(row["_path"])
    content = path.read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    expected = row.get("sha256") or row.get("sha256_referencia")
    if expected and digest != expected.lower():
        raise ValueError("SHA-256 diverge da referência")
    members = [(path.name, content)] if path.suffix.lower() == ".dat" else list(open_logs(content))
    if not members:
        raise ValueError("nenhum logd.dat no pacote")
    return digest, members


def selected_lines(raw, regex):
    """Obtém linhas físicas com LF. CR é removido só quando termina a linha."""
    previous_start = 0
    end = -1
    number = 1
    for match in regex.finditer(raw):
        if match.start() <= end:
            continue
        start = raw.rfind(b"\n", 0, match.start()) + 1
        end = raw.find(b"\n", match.end())
        if end == -1:
            end = len(raw)
        number += raw.count(b"\n", previous_start, start)
        previous_start = start
        yield number, raw[start:end].removesuffix(b"\r")


def team_scan(row):
    digest, members = read_package(row)
    turno, _, mun, zona, secao = identify(row)
    target_location = tuple(map(int, (mun, zona, secao)))
    events = []
    supplemental = {}
    excluded = Counter()
    seen = set()
    for member, raw in members:
        charset = encoding(raw)
        machines = defaultdict(lambda: {"location": [None, None, None], "phase": "", "turn": ""})
        # Nas seções de locais distintos e suas contrapartes, procura também
        # tentativas, pedidos de biometria e identificação no encerramento.
        extended = str(row.get("prioridade", "0")) in ("0", "1")
        for number, line in selected_lines(raw, INTEREST_EXTENDED if extended else INTEREST):
            fields = line.decode(charset).split("\t")
            if len(fields) != 6:
                continue
            stamp, _, machine, app, message, _ = fields
            ctx = machines[machine]
            event = TITLE_EVENT.fullmatch(message) if app == "VOTA" else None
            label = SUPPLEMENT.search(fields[4].encode(charset)) if extended and app == "VOTA" else None
            if event or label:
                if stamp[:10] not in DATES[turno]:
                    continue
                if ctx["phase"] != "oficial" or tuple(ctx["location"]) != target_location or ctx["turn"] != turno:
                    reason = "fase" if ctx["phase"] != "oficial" else "identidade" if tuple(ctx["location"]) != target_location else "turno"
                    if event:
                        excluded[reason] += 1
                    continue
                if line not in seen:
                    if event:
                        title, verb = event.groups()
                        kind = "registro" if verb.lower() == "registrado" else "habilitacao"
                        events.append((title, stamp, machine, kind, member, number))
                    if label:
                        title = label[1].decode().zfill(12)
                        kind = re.sub(r"[0-9]+", "#", message)
                        item = supplemental.setdefault(title, [0, stamp, stamp, set(), member, number])
                        item[0] += 1
                        if stamp < item[1]:
                            item[1], item[4], item[5] = stamp, member, number
                        item[2] = max(item[2], stamp)
                        item[3].add(kind)
                    seen.add(line)
                continue
            message = norm(message)
            if message.startswith("iniciando aplicacao"):
                turn_match = TURN.search(message)
                if turn_match:
                    ctx["turn"] = turn_match[1]
                if any(word in message for word in ("simulad", "treinamento", "demonstracao")):
                    ctx["phase"] = "simulado"
            else:
                label, _, value = message.partition(":")
                if label == "fase da ue":
                    ctx["phase"] = value.strip()
                elif label in LOCATION and value.strip().isdigit():
                    ctx["location"][LOCATION[label]] = int(value.strip())
    for item in supplemental.values():
        item[3] = " | ".join(sorted(item[3]))
    return digest, len(members), events, dict(excluded), supplemental


def set_titles(titles):
    global TITLE_SET
    TITLE_SET = {x.encode("ascii") for x in titles}


def mention_scan(row):
    digest, members = read_package(row)
    found = []
    for member, raw in members:
        charset = encoding(raw)
        # Primeiro localiza todas as grafias de 12 dígitos em qualquer tipo
        # de mensagem. Aceita grafia curta quando o rótulo identifica o título.
        lines = dict(selected_lines(raw, TOKEN))
        lines.update(selected_lines(raw, UNPADDED))
        for number, original in sorted(lines.items()):
            fields = original.split(b"\t")
            # O número de série e o autenticador da linha não são mensagens.
            message = fields[4] if len(fields) >= 5 else original
            spellings = {m[0] for m in TOKEN.finditer(message)}
            spellings.update(m[1] for m in UNPADDED.finditer(message))
            hits = sorted((s.zfill(12), s) for s in spellings if s.zfill(12) in TITLE_SET)
            if hits:
                full = original.decode(charset)
                parts = full.split("\t")
                info = parts[:6] if len(parts) >= 5 else ["", "", "", "", full, ""]
                if len(info) == 5:
                    info.append("")
                for title, spelling in hits:
                    found.append((title.decode(), spelling.decode(), *info, member, number, row["arquivo"], digest, full))
    return digest, found


def manifest_rows(path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    keys = set()
    for row in rows:
        key = identify(row)
        if key in keys:
            raise ValueError(f"seção duplicada no manifesto: {key!r}")
        keys.add(key)
        row["_path"] = str((path.parent / row["arquivo"]).resolve())
    return rows


def read_cache(path):
    db = sqlite3.connect(path)
    db.execute("""CREATE TABLE IF NOT EXISTS secao
      (chave TEXT PRIMARY KEY, caminho TEXT, tamanho INTEGER, mtime INTEGER, sha TEXT, dados BLOB)""")
    return db


def group_team(events):
    stats = {}
    for title, stamp, _, kind, _, _ in events:
        line = stats.setdefault(title, [0, 0, "", ""])
        if kind == "registro":
            line[0] += 1
            line[2] = min(line[2] or stamp, stamp)
            line[3] = max(line[3] or stamp, stamp)
        else:
            line[1] += 1
    return {t: s for t, s in stats.items() if s[0]}


def map_tasks(fun, jobs, pool):
    if pool:
        return pool.map(fun, jobs, chunksize=4)
    return map(fun, jobs)


def csv_out(path, header):
    f = path.open("w", newline="", encoding="utf-8-sig")
    writer = csv.writer(f)
    writer.writerow(header)
    return f, writer


def stage_team(rows, out, workers):
    db = read_cache(out / "indice_extracao.sqlite3")
    jobs = []
    cached = dict((key, (path, size, t, sha)) for key, path, size, t, sha in
                  db.execute("SELECT chave,caminho,tamanho,mtime,sha FROM secao"))
    present = []
    for row in rows:
        path = Path(row["_path"])
        if not path.is_file():
            continue
        stat = path.stat()
        key = "|".join(identify(row))
        fp = (str(path), stat.st_size, stat.st_mtime_ns)
        captured = cached.get(key)
        if not captured or captured[:3] != fp or ((row.get("sha256") or row.get("sha256_referencia")) and
                captured[3] != (row.get("sha256") or row.get("sha256_referencia"))):
            jobs.append((row, key, fp))
        present.append((row, key))
    pool = ProcessPoolExecutor(workers) if workers > 1 and jobs else None
    try:
        for i, ((_, key, fp), (digest, members, events, excluded, supplemental)) in enumerate(
                zip(jobs, map_tasks(team_scan, (item[0] for item in jobs), pool)), 1):
            blob = zlib.compress(json.dumps([members, events, excluded, supplemental], separators=(",", ":")).encode(), 1)
            db.execute("INSERT OR REPLACE INTO secao VALUES(?,?,?,?,?,?)", (key, *fp, digest, blob))
            if i % 500 == 0:
                db.commit()
                print(f"Equipes: {i}/{len(jobs)} novos pacotes", flush=True)
        db.commit()
    finally:
        if pool:
            pool.shutdown()
    teams_by_title = defaultdict(Counter)
    excluded_total = Counter()
    members_total = 0
    events_by_turn = defaultdict(Counter)
    ft, team_writer = csv_out(out / "equipes.csv.tmp", TEAM)
    fe, event_writer = csv_out(out / "registros_qualificados.csv.tmp", EVENT)
    fs, supplement_writer = csv_out(out / "titulos_suplementares.csv.tmp",
        KEY + ("titulo", "eventos", "primeiro", "ultimo", "tipos", "membro", "linha"))
    fc, coverage_writer = csv_out(out / "cobertura_extracao.csv.tmp",
        KEY + ("arquivo", "sha256", "fragmentos", "titulos_registrados", "descartes_fase", "descartes_identidade", "descartes_turno"))
    with ft, fe, fc, fs:
        for row, code in present:
            key = identify(row)
            digest, blob = db.execute("SELECT sha,dados FROM secao WHERE chave=?", (code,)).fetchone()
            row["sha256"] = digest
            members, events, excluded, supplemental = json.loads(zlib.decompress(blob))
            members_total += members
            excluded_total.update(excluded)
            stats = group_team(events)
            for title, values in sorted(stats.items()):
                team_writer.writerow((*key, title, *values))
                teams_by_title[title][key[0]] += 1
            for event in events:
                event_writer.writerow((*key, *event))
                events_by_turn[key[0]][event[3]] += 1
            for title, item in sorted(supplemental.items()):
                supplement_writer.writerow((*key, title, *item))
            coverage_writer.writerow((*key, row["arquivo"], digest, members, len(stats),
                                      *(excluded.get(k, 0) for k in ("fase", "identidade", "turno"))))
    db.close()
    for name in ("equipes.csv", "registros_qualificados.csv", "cobertura_extracao.csv", "titulos_suplementares.csv"):
        (out / (name + ".tmp")).replace(out / name)
    targets = {t for t, per_turn in teams_by_title.items() if max(per_turn.values()) > 1}
    f, writer = csv_out(out / "titulos_alvo.csv.tmp", ("titulo", "secoes_turno_1", "secoes_turno_2"))
    with f:
        for t in sorted(targets):
            writer.writerow((t, teams_by_title[t]["1"], teams_by_title[t]["2"]))
    (out / "titulos_alvo.csv.tmp").replace(out / "titulos_alvo.csv")
    summary = dict(pacotes_manifesto=len(rows), pacotes_lidos=len(present), fragmentos=members_total,
                   eventos_qualificados=events_by_turn, eventos_fora_do_contexto=excluded_total,
                   titulos_alvo=len(targets), repetidos_por_turno={
                       t: sum(per_turn[t] > 1 for per_turn in teams_by_title.values()) for t in ("1","2")})
    return targets, summary, [r for r, _ in present]


def stage_mentions(rows, titles, out, workers):
    pool = ProcessPoolExecutor(workers, initializer=set_titles, initargs=(titles,)) if workers > 1 else None
    set_titles(titles)
    total = 0
    physical_lines = 0
    in_window = 0
    short_mentions = 0
    titles_seen = set()
    try:
        with gzip.open(out / "mencoes.csv.gz.tmp", "wt", newline="", encoding="utf-8-sig", compresslevel=3) as f:
            writer = csv.writer(f)
            writer.writerow(MENTION)
            for i, (row, (_, matches)) in enumerate(zip(rows, map_tasks(mention_scan, rows, pool)), 1):
                key = identify(row) if row.get("turno") else ("",) * len(KEY)
                writer.writerows((*key, *match) for match in matches)
                line_keys = {(m[8], m[9]) for m in matches}
                physical_lines += len(line_keys)
                in_window += len({(m[8], m[9]) for m in matches if m[2][:10] in DATES.get(key[0], ())})
                short_mentions += sum(len(m[1]) < 12 for m in matches)
                titles_seen.update(m[0] for m in matches)
                total += len(matches)
                if i % 1000 == 0:
                    print(f"Menções: {i}/{len(rows)} pacotes", flush=True)
        (out / "mencoes.csv.gz.tmp").replace(out / "mencoes.csv.gz")
    finally:
        if pool:
            pool.shutdown()
    return dict(linhas_por_titulo=total, linhas_fisicas_com_mencao=physical_lines,
                linhas_fisicas_na_janela_do_turno=in_window, mencoes_com_grafia_curta=short_mentions,
                titulos_encontrados=len(titles_seen))


def stage_context(rows, out):
    """Referencia a origem dos registros em pacotes que incluem mais de um log."""
    def read(name):
        with (out / name).open(encoding="utf-8-sig", newline="") as f:
            yield from csv.DictReader(f)

    keys = {identify(r): r["sha256"] for r in read("cobertura_extracao.csv") if int(r["fragmentos"]) > 1}
    events = defaultdict(lambda: defaultdict(list))
    for r in read("registros_qualificados.csv"):
        key = identify(r)
        if key in keys:
            events[key][r["membro"]].append(r)
    marker = re.compile(rb"\t(?:SCUE|GAP|VOTA)\t(?:Se.{1,5}o Eleitoral:|Registrando mes|Gerando arquivo de resultado \[)")
    fields = EVENT + ("etapa", "secoes_declaradas_ate_evento", "zero_precedeu_evento",
                      "geracao_bu_mesma_data_serie_fragmento", "membro_principal")
    fp, writer = csv_out(out / "contexto_contingencias.csv.tmp", fields)
    with fp:
        for row in rows:
            key = identify(row)
            if key not in events:
                continue
            _, members = read_package({**row, "sha256": keys[key]})
            for member, raw in members:
                if member not in events[key]:
                    continue
                charset = encoding(raw)
                markers = []
                bu = set()
                for n, line in selected_lines(raw, marker):
                    parts = line.decode(charset).split("\t")
                    if len(parts) != 6:
                        continue
                    stamp, _, serial, app, msg, _ = parts
                    msg = norm(msg)
                    if msg.startswith("secao eleitoral:"):
                        section = msg.split(":", 1)[1].strip()
                        if section.isdigit():
                            markers.append((n, serial, "secao", str(int(section))))
                    elif app == "VOTA" and msg.startswith("registrando mesarios"):
                        for word, stage in (("antes", "abertura"), ("durante", "durante"), ("apos", "fechamento")):
                            if word in msg:
                                markers.append((n, (stamp[:10], serial), "etapa", stage))
                    elif app == "VOTA" and "[bu.dat]" in msg and "[termino]" in msg:
                        bu.add((stamp[:10], serial))
                stages = {}
                sections = defaultdict(set)
                index = 0
                for item in sorted(events[key][member], key=lambda r: int(r["linha"])):
                    while index < len(markers) and markers[index][0] < int(item["linha"]):
                        _, subject, field, value = markers[index]
                        if field == "secao":
                            sections[subject].add(value)
                        else:
                            stages[subject] = value
                        index += 1
                    machine = item["urna"]
                    pair = (item["data_hora"][:10], machine)
                    writer.writerow((*[item[k] for k in EVENT], stages.get(pair, "indeterminada"),
                        " ".join(sorted(sections[machine], key=int)), int("0" in sections[machine]),
                        int(pair in bu), int(member.lower() == "logd.dat")))
    (out / "contexto_contingencias.csv.tmp").replace(out / "contexto_contingencias.csv")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifesto", type=Path, default=BASE / "manifesto.csv")
    parser.add_argument("--saida", type=Path, help="Pasta de saída. Consulta individual usa dados/consulta_titulo por padrão.")
    parser.add_argument("--arquivo", type=Path, help="Inspeciona diretamente um DAT, ZIP ou JEZ.")
    parser.add_argument("--titulo", action="append", help="Título escolhido, com ou sem zeros iniciais.")
    parser.add_argument("--etapa", choices=("todas", "equipes", "contingencias"), default="todas")
    parser.add_argument("--parcial", action="store_true", help="Processa só arquivos disponíveis no manifesto.")
    parser.add_argument("--processos", type=int, default=min(6, os.cpu_count() or 1))
    args = parser.parse_args()
    if args.saida is None:
        args.saida = BASE / "consulta_titulo" if args.arquivo or args.titulo else BASE
    args.saida.mkdir(parents=True, exist_ok=True)
    if args.processos < 1:
        parser.error("--processos deve ser positivo")
    if args.titulo and any(not re.fullmatch(r"[0-9]{1,12}", s) for s in args.titulo):
        parser.error("título precisa ter de 1 a 12 algarismos")
    if args.arquivo:
        if not args.titulo:
            parser.error("--arquivo requer --titulo")
        rows = [{"_path": str(args.arquivo.resolve()), "arquivo": str(args.arquivo)}]
        titles = {s.zfill(12) for s in args.titulo}
        result = stage_mentions(rows, titles, args.saida, 1)
        print(f"{result['linhas_por_titulo']} menções em {args.saida / 'mencoes.csv.gz'}")
        return
    rows = manifest_rows(args.manifesto)
    if args.etapa == "contingencias":
        stage_context(rows, args.saida)
        return
    missing = sum(not Path(row["_path"]).is_file() for row in rows)
    if missing and not args.parcial:
        parser.error(f"{missing}/{len(rows)} pacotes ausentes; execute fontes.py ou use --parcial.")
    titles, summary, present = stage_team(rows, args.saida, args.processos)
    summary["sha256_manifesto"] = hashlib.sha256(args.manifesto.read_bytes()).hexdigest()
    if args.etapa == "todas":
        stage_context(present, args.saida)
        if args.titulo:
            titles = {s.zfill(12) for s in args.titulo}
        summary["titulos_pesquisados"] = len(titles)
        summary.update(stage_mentions(present, titles, args.saida, args.processos))
    (args.saida / "extracao.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
