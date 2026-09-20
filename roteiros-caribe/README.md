# Rota Caribe

Aplicação pessoal para montar roteiros saindo de Belo Horizonte, sem conta de API. O coletor abre o Google Flights localmente, grava os resultados em SQLite e a página apenas lê esse banco.

## Primeiro uso

```bash
cd roteiros-caribe
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

## Fazer as buscas

O servidor não faz scraping ao abrir a página. Execute o coletor manualmente:

```bash
playwright install --with-deps chromium
python collect.py --year 2026

# Todos os dias das três janelas: cerca de 362 consultas únicas

Em containers Linux sem permissão para instalar bibliotecas do sistema, o Playwright pode falhar ao abrir o Chromium com erro de biblioteca como `libatk-1.0.so.0`. Nesse caso, execute a instalação em um ambiente com permissão de administrador ou rode o coletor no seu computador pessoal.
python collect.py --year 2026 --complete
```

O navegador roda em segundo plano. Para acompanhar visualmente:

```bash
python collect.py --year 2026 --complete --headed
```

Se o Google mostrar CAPTCHA ou verificação antirobô, o coletor para e informa o problema; ele não tenta contornar a verificação. Depois da coleta, execute `python server.py` e abra <http://127.0.0.1:8000>. A página mostra a data/hora da última coleta concluída.

Os resultados são salvos em `flights.sqlite3` por seis horas. Para refazer tudo, remova esse arquivo ou use `FLIGHT_CACHE_TTL=0`.

## Hospedagem manual

Na página, informe o valor médio por pessoa e por noite para cada destino. A opção `incluir no ranking` é opcional e soma a hospedagem ao preço dos voos. O cálculo usa noites inteiras arredondadas para cima: 90 horas resultam em 4 noites e 160 horas em 7 noites.

## Saídas por São Paulo

Além das rotas diretas a partir de CNF, a aplicação testa rotas via GRU e soma todos os trechos:

- ida: CNF → GRU, espera de 3 a 10 horas, GRU → Caribe;
- volta: Caribe → GRU, espera de 3 a 10 horas, GRU → CNF.

Os trechos de posicionamento entram no preço e nos links exibidos. Nesta versão, São Paulo usa GRU (Guarulhos); isso pode ser expandido para CGH em uma próxima etapa.