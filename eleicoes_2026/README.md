# Relatório das eleições de 2026

Site estático em português, com o padrão editorial do relatório de Rafael Leite de 2022. O relatório e as nove páginas de análise formam um único site para o GitHub Pages, com navegação lateral, identidade visual e arquivos locais compartilhados. A entrada para publicação é `index.html`.

Para uma leitura direta do artigo no computador, abra `leitura-offline.html`: os gráficos e o mapa principais estão incorporados nesse arquivo. Essa cópia é uma alternativa de leitura do relatório principal; o site completo, com todas as análises, é acessado pelo GitHub Pages ou pela visualização local abaixo.

## Ler e conferir

Não abra `index.html` com duplo clique: os navegadores bloqueiam os módulos e dados interativos nesse modo. No Mac, dê duplo clique em `Abrir site no navegador.command`; uma janela do Terminal ficará aberta enquanto você usa o site. Pressione Ctrl+C nessa janela para encerrar a prévia.

Como alternativa, abra o Terminal nesta pasta e execute:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Depois acesse `http://127.0.0.1:8000/`. Não é necessário instalar pacotes ou executar uma compilação. As bibliotecas, os dados das visualizações, as malhas vetoriais e os simuladores estão incluídos. Os mapas usam tiles OSM.de baseados em OpenStreetMap, com atribuição visível e limites estaduais do IBGE. O mapa precisa de conexão; as imagens OSM.de são publicadas sob CC BY-SA 2.0. O site não inclui uma interface de consulta SQLite nem um banco de dados.

As análises funcionam como páginas do próprio site. Não há dependência de outro site de análises, serviço de aplicação ou API privada. Os dados são uma fotografia publicada; as consultas às fontes oficiais permanecem como referências para conferir e obter novas versões dos arquivos.

## Publicar no GitHub Pages

Para manter o site de 2022, copie esta pasta inteira para um novo subdiretório do repositório já usado no GitHub Pages, por exemplo `eleicoes-2026/`. Preserve sua estrutura interna: `index.html`, `assets/`, `dados/` e `analises/`. O relatório ficará em `https://rafnleite.github.io/eleicoes-2026/`, se esse for o caminho escolhido no repositório de usuário. As páginas de análise ficarão sob o mesmo endereço, em `eleicoes-2026/analises/`, com retorno ao relatório pela navegação lateral.

O arquivo `.nojekyll` deve existir na raiz da fonte publicada, especialmente se a publicação usar uma branch. Há uma cópia nesta pasta; se ela for inserida em outro repositório, crie ou preserve também o `.nojekyll` da raiz correspondente. Todos os links internos do relatório são relativos e funcionam em subdiretórios.

Em um repositório novo, coloque o conteúdo desta pasta na raiz e escolha **Settings → Pages → Deploy from a branch → main → /(root)**. Não há servidor de aplicação, banco hospedado ou chave secreta. A publicação é uma fotografia dos dados; ela não acompanha alterações do computador de origem.

O pacote preserva as bases e os downloads detalhados das análises e tem aproximadamente 415 MiB descompactado. Os arquivos individuais ficam abaixo de 100 MiB. Use Git para enviar o conteúdo, pois a interface de upload de arquivos do navegador tem limites menores. A cópia compactada é para transporte: o GitHub Pages precisa do conteúdo extraído, e não apenas do ZIP. A configuração de publicação existente do usuário deve ser preservada ao acrescentar este relatório a um repositório já ativo.

### Páginas de análise incluídas

- `analises/index.html`: distribuição dos horários de encerramento das urnas.
- `analises/votacao.html`: horários dos votos e distribuição geográfica.
- `analises/atraso.html`: análise da votação após as 17h.
- `analises/biometria.html`: identificação biométrica, histograma, apuração acumulada e dispersão por forma de habilitação, mapas por zona e local e comparação histórica.
- `analises/secoes.html`: resultados por seção eleitoral.
- `analises/apuracao-encerramento.html`: soma dos boletins por horário de encerramento.
- `analises/simulacao.html`: simulador de apuração e conjuntos de cenários.
- `analises/fluxos.html`: estimativas dos fluxos entre turnos.
- `analises/auditoria.html`: cobertura e auditoria dos arquivos disponíveis.

Documentação: [fonte de publicação](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) e [limites do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Verificação e reprodução

```sh
python3 scripts/verificar_dados.py
```

O comando confere somas, cortes temporais, categorias, histogramas e cobertura das coordenadas e gera os CSVs e `dados/validacao.json`. Sua aprovação não significa validação criptográfica de todos os arquivos originais nem certificação da eleição.

`scripts/consolidar_horarios_votos.py` atualiza `dados/horarios-votos.json` a partir dos fragmentos locais de votação, conferindo os totais por UF. O relatório carrega esse agregado compacto, sem baixar os dados detalhados por local.

`scripts/classificar_unanimidades.py --shapefile /caminho/tis_poligonais.zip` reproduz `dados/unanimidades-contexto.json`. Use o shapefile “Terras Indígenas no Brasil” disponível na [página de geoprocessamento da FUNAI](https://www.gov.br/funai/pt-br/atuacao/terras-indigenas/geoprocessamento-e-mapas). O script confere que a camada está em SIRGAS 2000, cruza os pontos do cadastro TSE e registra o SHA-256 do ZIP utilizado. As interseções descrevem as coordenadas cadastradas dos locais, não a localização de eleitores.

`scripts/extrair_base.py` reproduz os agregados a partir do banco e dos arquivos de origem. As opções são descritas por `python3 scripts/extrair_base.py --help`. O SQLite de aproximadamente 8,9 GB não foi incorporado ao site. Os insumos e os critérios estão em `dados/proveniencia.json`. Os hashes dos arquivos de dados publicados ficam em `dados/SHA256SUMS.txt`.

O relatório distingue os 34.393 votos posteriores às 17h do levantamento oficial das 34.126 confirmações a partir das 17h na extração local. Também registra a diferença de classificação das seções encerradas após as 19h. Não foi atribuída uma causa sem evidência a essas discrepâncias.

O corte de 17:06:44 é inclusivo e usa todo o exterior no saldo inicial. Os horários são de Brasília. A curva soma BUs completos, e não votos individuais ocorridos até cada segundo; não reconstrói a ordem real de totalização. Sem o saldo inicial do exterior, o marco equivalente dos BUs brasileiros é 17:06:53.

As páginas de simulação preservam a soma das urnas incluídas em cada conjunto. Modos com horários incluem 499.178 BUs; o cenário aleatório sem horários inclui 499.207. Hipóteses de transmissão e modos dirigidos estão descritos na própria ferramenta. Fluxos entre turnos são estimativas ecológicas condicionadas a hipóteses, sem identificar trajetórias individuais.

## Organização

- `index.html`: relatório principal, fontes e metodologia.
- `assets/`: estilo, interação do relatório, perfil do relatório original e quadro contextual do vídeo.
- `dados/`: agregados, quadros oficiais transcritos, CSVs, evidências locais, proveniência e validação.
- `analises/`: páginas interativas integradas ao relatório, seus módulos, bibliotecas e dados locais.
- `scripts/`: verificação e extração dos agregados.

O conteúdo foi preparado para revisão e publicação pelo usuário. Nenhum repositório remoto foi alterado e nenhuma publicação foi realizada nesta tarefa.
