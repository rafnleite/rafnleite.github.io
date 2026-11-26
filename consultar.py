"""Exporta do CSV de menções todas as linhas de um único título ou ID de auditoria."""
import argparse
import csv
import gzip
from pathlib import Path
import re
import sys

DADOS = Path(__file__).resolve().parent / "dados"


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("identificador", help="Os algarismos do título ou um código M- ou L-")
    cli.add_argument("--saida", type=Path, required=True, help="Destino de um novo CSV descompactado")
    cli.add_argument("--dados", type=Path, default=DADOS)
    args = cli.parse_args()
    busca = args.identificador.strip().upper()
    if re.fullmatch(r"[0-9]{1,12}", busca):
        titulo = busca.zfill(12)
    else:
        with (args.dados / "todos_casos.csv").open(encoding="utf-8-sig",newline="") as origem:
            opcoes = {r["titulo"] for r in csv.DictReader(origem) if busca == r["id_caso"] or
                      busca in r["ids_arvor_possiveis"].split()}
        if len(opcoes) != 1:
            cli.error(f"O código tem {len(opcoes)} correspondências. Consulte todos_casos.csv e pesquise pelos algarismos.")
        titulo = opcoes.pop()
    linhas = 0
    with gzip.open(args.dados / "mencoes.csv.gz", "rt", newline="", encoding="utf-8-sig") as mencoes:
        leitor = csv.DictReader(mencoes)
        try:
            saida = args.saida.open("x",newline="",encoding="utf-8-sig")
        except FileExistsError:
            cli.error("O arquivo de saída já existe. Escolha outro nome.")
        with saida:
            gravar = csv.DictWriter(saida,fieldnames=leitor.fieldnames)
            gravar.writeheader()
            for r in leitor:
                if r["titulo"] == titulo:
                    gravar.writerow(r)
                    linhas += 1
    print(f"{linhas} menções exportadas para {args.saida}.",file=sys.stderr)


if __name__ == "__main__":
    main()
