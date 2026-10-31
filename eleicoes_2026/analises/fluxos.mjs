import {integerUrnaFlows} from './fluxos-inteiros.mjs';

const $ = id => document.getElementById(id);
const integer = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 0});
const decimal = new Intl.NumberFormat('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1});
const compact = new Intl.NumberFormat('pt-BR', {notation: 'compact', maximumFractionDigits: 1});
const percentage = value => `${decimal.format(value)}%`;
const number = value => integer.format(value || 0);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const palette = ['#b42332', '#1d4ed8', '#a66b1f', '#3d7a5e', '#90723a', '#7b6697', '#477d86', '#925f56', '#687739', '#806958', '#618094', '#8d6d83', '#79713b'];
let manifest, origins = [], destinations = [], worker, chart, currentResult, requestId = 0, debounce;
let requestedScope, requestedLabel = 'Brasil';
let urnaRequestId = 0;
const urnaPresentation = new WeakMap();

function displayedResult(result) {
  if (requestedScope.secao === 'ALL') return result;
  if (!urnaPresentation.has(result)) urnaPresentation.set(result, {...result,
    flows: integerUrnaFlows(result.flows, result.originTotals, result.destinationTotals)});
  return urnaPresentation.get(result);
}

function category(entry, i) {
  const item = typeof entry === 'object' && entry !== null ? entry : {id: entry};
  const id = String(item.id ?? item.codigo ?? i);
  const known = {lula: 'Lula', flavio: 'Flávio', brancos: 'Brancos', nulos: 'Nulos', abstencoes: 'Abstenções', entradas: 'Ajuste de entrada', saidas: 'Ajuste de saída', '13': 'Lula', '22': 'Flávio'};
  let label = item.label || item.nome || known[id] || (/^\d+$/.test(id) ? `Candidato ${id}` : id);
  if (id === 'entrada_cadastro' || id === 'ajuste_entrada') label = 'Ajuste de entrada';
  if (id === 'saida_cadastro' || id === 'ajuste_saida') label = 'Ajuste de saída';
  const key = `${id} ${label}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const major = /\blula\b|\bflavio\b|^(?:candidato[_-]?)?13\b|^(?:candidato[_-]?)?22\b/.test(key);
  const adjustment = /entrad|said/.test(key);
  const candidate = !/branc|nul|absten|entrad|said|outr/.test(key);
  let color = item.color || palette[i % palette.length];
  if (/lula|^(?:candidato[_-]?)?13\b/.test(key)) color = item.color || '#b42332';
  if (/flavio|^(?:candidato[_-]?)?22\b/.test(key)) color = item.color || '#1d4ed8';
  if (/branc/.test(key)) color = item.color || '#8a9590';
  if (/nul/.test(key)) color = item.color || '#765399';
  if (/absten/.test(key)) color = item.color || '#475569';
  if (adjustment) color = item.color || '#0f766e';
  return {id, label, color, major, candidate, adjustment};
}

function setStatus(message, error = false) {
  $('flowStatus').textContent = message;
  $('flowStatus').classList.toggle('error', error);
  $('flowRetry').hidden = !error;
}

function setOptions(select, initial, entries) {
  select.replaceChildren(new Option(initial, 'ALL'));
  for (const [value, label] of entries) select.add(new Option(label, value));
}

function stateRecord() {
  return manifest?.ufs.find(entry => entry.uf === $('flowState').value);
}

function updateStates() {
  const previous = $('flowState').value;
  const exterior = $('flowExterior').checked;
  setOptions($('flowState'), exterior ? 'Brasil e exterior' : 'Brasil', manifest.ufs
    .filter(entry => exterior || entry.uf !== 'ZZ')
    .map(entry => [entry.uf, entry.uf === 'ZZ' ? 'Exterior' : `${entry.uf} · ${entry.nome || entry.estado || entry.uf}`]));
  $('flowState').value = manifest.ufs.some(entry => entry.uf === previous && (exterior || entry.uf !== 'ZZ')) ? previous : 'ALL';
  $('flowState').disabled = false;
  updateMunicipalities();
}

function updateMunicipalities() {
  const state = stateRecord();
  setOptions($('flowMunicipality'), 'Todos os municípios', (state?.municipios || [])
    .map(entry => [String(entry.codigo), entry.nome || String(entry.codigo)])
    .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')));
  $('flowMunicipality').disabled = !state;
  updateZones();
}

function updateZones() {
  const municipality = stateRecord()?.municipios.find(entry => String(entry.codigo) === $('flowMunicipality').value);
  setOptions($('flowZone'), 'Todas as zonas', (municipality?.zonas || [])
    .slice().sort((a, b) => Number(a) - Number(b)).map(zone => [String(zone), `Zona ${zone}`]));
  $('flowZone').disabled = !municipality;
  resetUrnas();
}

function resetUrnas() {
  urnaRequestId++;
  setOptions($('flowUrna'), 'Todas as urnas', []);
  $('flowUrna').disabled = true;
  $('flowUrnaHint').textContent = 'Escolha município e zona para selecionar uma urna.';
  $('flowUrnaHint').classList.remove('error');
  $('flowUrnaRetry').hidden = true;
}

function urnaListFailed(message) {
  setOptions($('flowUrna'), 'Urnas indisponíveis', []);
  $('flowUrna').disabled = true;
  $('flowUrnaHint').textContent = message;
  $('flowUrnaHint').classList.add('error');
  $('flowUrnaRetry').hidden = false;
}

function requestUrnas() {
  resetUrnas();
  const scope = {uf: $('flowState').value, municipio: $('flowMunicipality').value, zona: $('flowZone').value};
  if (Object.values(scope).includes('ALL')) return;
  setOptions($('flowUrna'), 'Carregando urnas…', []);
  $('flowUrnaHint').textContent = `Carregando as urnas da zona ${scope.zona}. O primeiro carregamento pode levar alguns segundos.`;
  try {
    ensureWorker();
    worker.postMessage({type: 'listUrnas', requestId: ++urnaRequestId, scope, includeExterior: $('flowExterior').checked});
  } catch (error) {urnaListFailed(error.message || 'Não foi possível carregar a lista de urnas.');}
}

function scopeLabel() {
  const state = stateRecord();
  if (!state) return $('flowExterior').checked ? 'Brasil e exterior' : 'Brasil';
  const municipality = state.municipios.find(entry => String(entry.codigo) === $('flowMunicipality').value);
  const label = municipality ? `${municipality.nome} · ${state.uf}` : state.uf === 'ZZ' ? 'Exterior' : state.nome || state.estado || state.uf;
  const territory = $('flowZone').value === 'ALL' ? label : `${label} · Zona ${$('flowZone').value}`;
  return $('flowUrna').value === 'ALL' ? territory : `${territory} · Seção ${$('flowUrna').value}`;
}

function ensureWorker() {
  if (worker) return;
  worker = new Worker(new URL('./fluxos-worker.mjs?v=8', import.meta.url), {type: 'module'});
  worker.onmessage = event => {
    const message = event.data;
    if (message.type === 'urnas' || message.type === 'urnasError') {
      if (message.requestId !== urnaRequestId) return;
      if (message.type === 'urnasError') {urnaListFailed(message.message); return;}
      setOptions($('flowUrna'), 'Todas as urnas', message.sections.map(secao => [String(secao), `Seção ${secao}`]));
      $('flowUrna').disabled = !message.sections.length;
      $('flowUrnaHint').textContent = message.sections.length
        ? `${integer.format(message.sections.length)} urnas disponíveis nesta zona e município. Selecione uma seção para ver sua matriz individual.`
        : 'Nenhuma urna com resultados pré-calculados nesta zona e município.';
      return;
    }
    if (message.requestId !== requestId) return;
    if (message.type === 'progress') setStatus(message.message || 'Somando os resultados pré-calculados…');
    if (message.type === 'error') fail(message.message || 'Não foi possível carregar este recorte.');
    if (message.type === 'result') render(message.result);
  };
  worker.onerror = () => {
    worker?.terminate();
    worker = null;
    if ($('flowZone').value !== 'ALL') urnaListFailed('Não foi possível carregar as urnas. Tente novamente.');
    fail('Não foi possível carregar os resultados. Tente novamente.');
  };
}

function fail(message) {
  $('flowResults').hidden = true;
  $('flowUnavailable').hidden = true;
  $('flowChart').removeAttribute('aria-busy');
  setStatus(message, true);
}

function analyze() {
  if (!manifest) return;
  clearTimeout(debounce);
  requestId++;
  currentResult = null;
  requestedScope = {uf: $('flowState').value, municipio: $('flowMunicipality').value, zona: $('flowZone').value, secao: $('flowUrna').value};
  requestedLabel = scopeLabel();
  $('flowResults').hidden = true;
  $('flowUnavailable').hidden = true;
  $('flowChart').setAttribute('aria-busy', 'true');
  setStatus(`Carregando os resultados para ${requestedLabel}…`);
  try {
    ensureWorker();
    worker.postMessage({type: 'analyze', requestId, scope: requestedScope, includeExterior: $('flowExterior').checked});
  } catch (error) {
    fail(error.message || 'O navegador não conseguiu carregar os resultados.');
  }
}

function queueAnalysis() {
  clearTimeout(debounce);
  requestId++;
  currentResult = null;
  $('flowResults').hidden = true;
  $('flowUnavailable').hidden = true;
  setStatus(`Carregando os resultados para ${scopeLabel()}…`);
  debounce = setTimeout(analyze, 150);
}

function bounds(result, origin, destination) {
  if (!Array.isArray(result.scenarioFlows) || !result.scenarioFlows.length) return [undefined, undefined];
  const originIndices = Array.isArray(origin) ? origin : [origin];
  const destinationIndices = Array.isArray(destination) ? destination : [destination];
  const sumGroup = matrix => originIndices.reduce((sum, i) => sum
    + destinationIndices.reduce((subtotal, j) => subtotal + matrix?.[i]?.[j], 0), 0);
  const values = [result.flows, ...result.scenarioFlows].map(sumGroup);
  if (values.some(value => !Number.isFinite(value))) return [undefined, undefined];
  return [Math.min(...values), Math.max(...values)];
}

function sensitivityText(result, origin, destination) {
  const [lower, upper] = bounds(result, origin, destination);
  return Number.isFinite(lower) && Number.isFinite(upper)
    ? `Faixa de sensibilidade: ${number(lower)} a ${number(upper)} eleitores. Não é intervalo de confiança.` : '';
}

function logicalBounds(result, indices, destination) {
  const destinationIndices = Array.isArray(destination) ? destination : [destination];
  const lower = indices.reduce((sum, i) => sum + destinationIndices.reduce((subtotal, j) => subtotal + (result.lowerBounds?.[i]?.[j] || 0), 0), 0);
  const upper = indices.reduce((sum, i) => sum + destinationIndices.reduce((subtotal, j) => subtotal + (result.upperBounds?.[i]?.[j] || 0), 0), 0);
  const originTotal = indices.reduce((sum, i) => sum + result.originTotals[i], 0);
  const destinationTotal = destinationIndices.reduce((sum, j) => sum + result.destinationTotals[j], 0);
  const electorate = result.electorate ?? result.originTotals.reduce((sum, value) => sum + value, 0);
  return [Math.max(0, lower, originTotal + destinationTotal - electorate), Math.min(upper, originTotal, destinationTotal)];
}

function logicalText(result, indices, destination) {
  const destinationIndices = Array.isArray(destination) ? destination : [destination];
  const [lower, upper] = logicalBounds(result, indices, destinationIndices);
  return `${indices.length === 1 && destinationIndices.length === 1 ? 'Limites pelas margens' : 'Limites conservadores do grupo'}: ${number(lower)} a ${number(upper)}. Não são intervalo de confiança.`;
}

function displayGroups(categories, groupCandidates = false) {
  const groups = [];
  let others, invalid;
  categories.forEach((entry, i) => {
    if (/^(brancos|nulos)$/.test(entry.id)) {
      if (!invalid) {
        invalid = {id: 'group-brancos-nulos', label: 'Brancos e nulos', color: '#8a9590', indices: []};
        groups.push(invalid);
      }
      invalid.indices.push(i);
    } else if (groupCandidates && entry.candidate && !entry.major) {
      if (!others) {
        others = {id: 'group-other-candidates', label: 'Demais candidatos', color: '#b7791f', indices: []};
        groups.push(others);
      }
      others.indices.push(i);
    } else groups.push({...entry, indices: [i]});
  });
  return groups;
}

function presentation(result) {
  const groups = displayGroups(origins, $('flowDetail').value === 'grouped');
  const destinationGroups = displayGroups(destinations);
  return {groups, destinationGroups,
    totals: groups.map(group => group.indices.reduce((sum, i) => sum + result.originTotals[i], 0)),
    destinationGroupTotals: destinationGroups.map(group => group.indices.reduce((sum, j) => sum + result.destinationTotals[j], 0)),
    flows: groups.map(group => destinationGroups.map(destination => group.indices.reduce((sum, i) =>
      sum + destination.indices.reduce((subtotal, j) => subtotal + result.flows[i][j], 0), 0)))};
}

function bandName(label, mobile = false) {
  return label.replace('Demais candidatos', 'Demais').replace('Brancos e nulos', 'Br./nul.')
    .replace('Abstenções', 'Abst.').replace('Ajuste de entrada', 'Entrada')
    .replace('Ajuste de saída', 'Saída').replace('Candidato ', 'Cand. ');
}

function renderBandLabels(groups, destinationGroups, links, mobile) {
  const series = chart.getModel().getSeriesByIndex(0);
  const graph = series.getGraph();
  const layout = series.layoutInfo;
  const candidates = [];
  const nodeRects = [];
  graph.eachNode(node => {
    const n = node.getLayout();
    nodeRects.push({x: layout.x + n.x - 4, y: layout.y + n.y - 4, width: n.dx + 8, height: n.dy + 8});
  });
  graph.eachEdge(edge => {
    const link = links[edge.dataIndex];
    if (link && link.value >= .5) candidates.push({edge, link});
  });
  candidates.sort((a, b) => b.link.value - a.link.value);
  const accepted = [], elements = [];
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const intersects = (a, b, gap = 5) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
  const bezier = (a, b, c, d, t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
  const maxLabels = mobile ? 6 : 11;
  for (let rank = 0; rank < candidates.length && accepted.length < maxLabels; rank++) {
    const {edge, link} = candidates[rank];
    const source = edge.node1.getLayout(), target = edge.node2.getLayout(), e = edge.getLayout();
    const extent = Math.max(1, e.dy);
    const x1 = layout.x + source.x + source.dx, x2 = layout.x + target.x;
    const y1 = layout.y + source.y + e.sy + extent / 2, y2 = layout.y + target.y + e.ty + extent / 2;
    const curvature = .48;
    const cp1 = x1 * (1 - curvature) + x2 * curvature, cp2 = x1 * curvature + x2 * (1 - curvature);
    const route = `${bandName(groups[link.origin].label, mobile)} → ${bandName(destinationGroups[link.destination].label, mobile)}`;
    const amount = compact.format(link.value);
    const text = `${route} · ${amount}`;
    const fontSize = mobile ? 8 : 9;
    context.font = `500 ${fontSize}px Arial`;
    const width = context.measureText(text).width + 6;
    const height = mobile ? 14 : 15;
    const initial = [.28, .5, .72][rank % 3];
    const positions = [initial, .28, .5, .72];
    if (rank < 3) for (let t = .16; t <= .84; t += .025) positions.push(t);
    let chosen;
    for (const t of positions) {
      const x = bezier(x1, cp1, cp2, x2, t), y = bezier(y1, y1, y2, y2, t);
      const rect = {x: x - width / 2, y: y - height / 2, width, height};
      if (rect.x < x1 + 3 || rect.x + width > x2 - 3 || rect.y < 4 || rect.y + height > chart.getHeight() - 4) continue;
      if (accepted.some(other => intersects(rect, other)) || nodeRects.some(node => intersects(rect, node, 2))) continue;
      chosen = {x, y, rect};
      break;
    }
    if (!chosen) continue;
    accepted.push({...chosen.rect, rank});
    elements.push({type: 'group', id: `flow-route-${edge.dataIndex}`, x: chosen.x, y: chosen.y, silent: true, z: 30,
      children: [
        {type: 'rect', shape: {x: -width / 2, y: -height / 2, width, height, r: 3},
          style: {fill: 'rgba(255,255,255,.85)'}},
        {type: 'text', style: {x: 0, y: 0, text,
          align: 'center', verticalAlign: 'middle', fontFamily: 'Arial', fontSize, fontWeight: 500,
          lineHeight: mobile ? 12 : 13, fill: '#34443a'}}
      ]});
  }
  chart.setOption({graphic: [{type: 'group', id: 'flow-band-labels', children: elements}]});
  $('flowChart').dataset.routeLabelCount = String(accepted.length);
  $('flowChart').dataset.largestRoutesLabeled = String(accepted.filter(label => label.rank < 3).length);
  const summary = $('flowLabelSummary');
  if (summary) summary.textContent = `${accepted.length} fluxos rotulados; detalhes de todos os fluxos no cursor e na tabela.`;
}

function nodeLabel(label, value, mobile) {
  let short = label;
  if (mobile) short = short.replace('Candidato ', 'Cand. ').replace('Demais candidatos', 'Demais cand.');
  short = short.replace(/^Ajuste de (entrada|saída)$/i, 'Ajuste de\n$1');
  return `${short}\n${compact.format(value)}`;
}

function renderChart(result) {
  if (!window.echarts) throw new Error('Não foi possível carregar o diagrama. Recarregue a página.');
  const {groups, destinationGroups, totals, destinationGroupTotals, flows} = presentation(result);
  const mobile = window.innerWidth < 620;
  $('flowChart').style.height = `${Math.max(mobile ? 580 : 550, groups.length * (mobile ? 49 : 52) + 70)}px`;
  chart ||= echarts.init($('flowChart'), null, {renderer: 'canvas'});
  const nodes = [
    ...groups.map((group, i) => ({name: `origin-${i}`, depth: 0, value: totals[i], itemStyle: {color: group.color}, label: {formatter: nodeLabel(group.label, totals[i], mobile), position: 'left'}})),
    ...destinationGroups.map((entry, j) => ({name: `destination-${j}`, depth: 1, value: destinationGroupTotals[j], itemStyle: {color: entry.color}, label: {formatter: nodeLabel(entry.label, destinationGroupTotals[j], mobile), position: 'right'}}))
  ];
  const links = [];
  groups.forEach((group, i) => destinationGroups.forEach((entry, j) => {
    const value = flows[i][j];
    if (value > 0) links.push({source: `origin-${i}`, target: `destination-${j}`, value, origin: i, destination: j});
  }));
  const tooltip = params => {
    if (params.dataType !== 'edge') {
      const origin = params.name.startsWith('origin-');
      const index = Number(params.name.split('-')[1]);
      const label = origin ? groups[index].label : destinationGroups[index].label;
      const adjustment = (origin ? groups[index] : destinationGroups[index]).adjustment;
      return `<div class="flow-tooltip"><b>${escapeHtml(label)}</b><br>${number(params.value)} ${adjustment ? 'no ajuste de eleitorado<br><span class="tooltip-muted">A soma dos ajustes não conta eleitores únicos.</span>' : 'eleitores'}</div>`;
    }
    const {origin: i, destination: j, value} = params.data;
    const group = groups[i];
    const destination = destinationGroups[j];
    const adjustment = group.adjustment || destination.adjustment;
    const pct = totals[i] ? percentage(value / totals[i] * 100) : '—';
    const sensitivity = sensitivityText(result, group.indices, destination.indices);
    return `<div class="flow-tooltip"><b>${escapeHtml(group.label)} → ${escapeHtml(destination.label)}</b><br>${number(value)} ${adjustment ? 'no ajuste de eleitorado' : 'eleitores estimados'}<br>${pct} da origem${sensitivity ? `<hr><span class="tooltip-muted">${escapeHtml(sensitivity)}</span>` : ''}<hr><span class="tooltip-muted">${escapeHtml(logicalText(result, group.indices, destination.indices))}</span>${adjustment ? '<hr><span class="tooltip-muted">Diferença de eleitorado da seção, compatível com movimentação ou voto em trânsito. Não identifica ligações entre seções nem conta eleitores únicos.</span>' : ''}</div>`;
  };
  chart.setOption({animation: false, aria: {enabled: true, description: 'Fluxos estimados entre turnos, com brancos e nulos agrupados visualmente nos dois lados. Consulte a matriz abaixo para os valores separados.'},
    textStyle: {fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif'},
    tooltip: {trigger: 'item', confine: true, borderColor: '#d8dfda', backgroundColor: '#fff', padding: 12, formatter: tooltip},
    series: [{type: 'sankey', left: mobile ? 90 : 155, right: mobile ? 90 : 140, top: mobile ? 28 : 30, bottom: mobile ? 30 : 36,
      nodeWidth: mobile ? 10 : 14, nodeGap: groups.length > 10 ? (mobile ? 33 : 38) : mobile ? 26 : 30, nodeAlign: 'justify', layoutIterations: 0,
      draggable: false, emphasis: {focus: 'adjacency', lineStyle: {opacity: .7}}, data: nodes, links,
      label: {fontSize: mobile ? 10 : 12, lineHeight: mobile ? 15 : 18, color: '#34443a', distance: mobile ? 7 : 10},
      edgeLabel: {show: false},
      lineStyle: {color: 'source', opacity: .26, curveness: .48}, itemStyle: {borderWidth: 0}}]
  }, true);
  chart.resize();
  renderBandLabels(groups, destinationGroups, links, mobile);
}

function renderTable(result) {
  const {groups, destinationGroups, totals, destinationGroupTotals, flows} = presentation(result);
  const header = document.createElement('tr');
  for (const text of ['Origem · 1º turno', ...destinationGroups.map(entry => entry.label), 'Total da origem']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = text;
    header.append(th);
  }
  $('flowTableHead').replaceChildren(header);
  const rows = groups.map((entry, i) => {
    const tr = document.createElement('tr');
    if (entry.adjustment) tr.className = 'flow-adjustment-row';
    const heading = document.createElement('th');
    heading.scope = 'row';
    const marker = document.createElement('span');
    marker.className = 'flow-origin';
    marker.style.setProperty('--origin-color', entry.color);
    const swatch = document.createElement('i');
    swatch.setAttribute('aria-hidden', 'true');
    marker.append(swatch, document.createTextNode(entry.label));
    heading.append(marker);
    tr.append(heading);
    destinationGroups.forEach((destination, j) => {
      const td = document.createElement('td');
      const value = flows[i][j];
      const fraction = totals[i] ? value / totals[i] : 0;
      const sensitivity = sensitivityText(result, entry.indices, destination.indices);
      td.title = `${sensitivity} ${logicalText(result, entry.indices, destination.indices)}`.trim();
      const strong = document.createElement('strong');
      strong.textContent = number(value);
      const small = document.createElement('small');
      small.textContent = totals[i] ? percentage(fraction * 100) : '—';
      td.style.setProperty('--cell-tint', `rgba(36,99,78,${Math.min(.14, fraction * .16)})`);
      td.append(strong, small);
      tr.append(td);
    });
    const total = document.createElement('td');
    total.className = 'flow-origin-total';
    total.textContent = number(totals[i]);
    tr.append(total);
    return tr;
  });
  $('flowTableBody').replaceChildren(...rows);
  const foot = document.createElement('tr');
  const heading = document.createElement('th');
  heading.scope = 'row';
  heading.textContent = 'Total · 2º turno + ajuste';
  foot.append(heading);
  for (const value of [...destinationGroupTotals, result.electorate ?? totals.reduce((sum, value) => sum + value, 0)]) {
    const td = document.createElement('td');
    td.textContent = number(value);
    foot.append(td);
  }
  $('flowTableFoot').replaceChildren(foot);
}

function selectedStates() {
  return manifest.ufs.filter(entry => (requestedScope.uf === 'ALL' || entry.uf === requestedScope.uf) && ($('flowExterior').checked || entry.uf !== 'ZZ'));
}

function renderDownloads() {
  const links = [];
  for (const state of selectedStates()) {
    const file = state.arquivoUrnas || state.arquivo_urnas;
    if (!file) continue;
    const link = document.createElement('a');
    link.className = 'button secondary';
    const url = new URL(file, new URL('./dados/fluxos/', import.meta.url));
    url.searchParams.set('v', state.sha256Urnas);
    link.href = url.href;
    link.download = `fluxos-2026-trocas5pct-${state.uf}-secoes.csv.gz`;
    link.textContent = `${state.uf === 'ZZ' ? 'Exterior' : state.uf} · por urna`;
    links.push(link);
  }
  $('flowUrnaLinks').replaceChildren(...links);
  $('flowUrnaDownloads').hidden = !links.length;
  $('flowUrnaDownloads').open = requestedScope.uf !== 'ALL';
}

function renderCoverage(result) {
  const singleUrna = requestedScope.secao !== 'ALL';
  const isWholeState = !singleUrna && requestedScope.municipio === 'ALL' && requestedScope.zona === 'ALL';
  const registered = selectedStates().reduce((sum, entry) => sum + (entry.secoes_cadastradas || 0), 0);
  $('flowCoverage').textContent = isWholeState && registered
    ? `Cobertura: ${integer.format(result.sectionCount)} urnas com boletins dos dois turnos, de ${integer.format(registered)} cadastradas (${percentage(result.sectionCount / registered * 100)}). As urnas fora do treino também recebem projeções.`
    : singleUrna ? `Recorte: ${requestedLabel}. Matriz individual pré-calculada, com os resultados dos dois turnos desta urna.`
      : `Recorte: ${requestedLabel}. ${integer.format(result.sectionCount)} urnas com boletins dos dois turnos. Os filtros somam matrizes pré-calculadas, sem treinar um modelo para este recorte.`;
  const notices = [];
  if (Number.isFinite(result.trainingCount) && Number.isFinite(result.outOfTrainingCount)) notices.push(`${integer.format(result.trainingCount)} urnas do recorte atendem ao critério de treino; ${integer.format(result.outOfTrainingCount)} ficam fora e recebem projeção.`);
  if (manifest.participation?.hypothesis_not_observed) {
    notices.push(`Cenário condicionado a trocas de 5% dos votantes do 1º turno. ${integer.format(result.participationCappedCount || 0)} urnas deste recorte exigem redução pela margem disponível.`);
  } else if (!result.sensitivity) notices.push(manifest.status === 'sensibilidade_em_processamento'
    ? 'O ajuste central está concluído; os cenários de sensibilidade estão em processamento.'
    : 'Faixa de sensibilidade indisponível para este recorte.');
  const diagnostics = result.diagnostics || {};
  if (Number.isFinite(diagnostics.rmse)) notices.push(`Erro de validação: ${decimal.format(diagnostics.rmse)}${diagnostics.rmseUnit ? ` ${diagnostics.rmseUnit}` : ''}.`);
  $('flowDiagnostics').textContent = notices.join(' ');
  const date = new Date(manifest.gerado_em || manifest.created_at || manifest.atualizado);
  $('flowSnapshot').textContent = Number.isNaN(date.getTime()) ? ''
    : `Resultados pré-calculados em ${new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'}).format(date)} (Brasília). Fonte: boletins de urna · Presidência 2026.`;
  renderDownloads();
}

function render(result) {
  $('flowChart').removeAttribute('aria-busy');
  if (!result || result.status === 'empty' || result.status === 'insufficient' || !Array.isArray(result.flows) || !result.sectionCount) {
    $('flowResults').hidden = true;
    $('flowUnavailable').hidden = false;
    $('flowUnavailableTitle').textContent = 'Nenhum resultado disponível neste recorte';
    $('flowUnavailableMessage').textContent = result?.message || 'Não há urnas com resultados pré-calculados para os filtros selecionados.';
    setStatus(`${requestedLabel} · ${integer.format(result?.sectionCount || 0)} urnas.`);
    return;
  }
  if (result.flows.length !== origins.length || result.destinationTotals?.length !== destinations.length) return fail('O catálogo e os resultados usam categorias diferentes. Recarregue a página.');
  currentResult = result;
  $('flowUnavailable').hidden = true;
  $('flowResults').hidden = false;
  $('flowSections').textContent = integer.format(result.sectionCount);
  $('flowTraining').textContent = Number.isFinite(result.trainingCount) ? integer.format(result.trainingCount) : '—';
  $('flowOutsideTraining').textContent = Number.isFinite(result.outOfTrainingCount) ? `${integer.format(result.outOfTrainingCount)} fora do treino · com projeção` : 'Projeções também para urnas fora do treino';
  $('flowElectorate').textContent = number(result.totalElectorate1);
  $('flowElectorate2').textContent = `2º turno: ${number(result.totalElectorate2)} eleitores`;
  try {
    const displayed = displayedResult(result);
    renderTable(displayed);
    renderChart(displayed);
    const exits = displayed.flows.slice(0, 15).reduce((sum, row) => sum + row[4] + row[5], 0);
    const entrants = displayed.flows.slice(15).reduce((sum, row) => sum + row.slice(0, 4).reduce((a, b) => a + b, 0), 0);
    $('flowSwaps').textContent = number(requestedScope.secao === 'ALL' ? result.participationSwaps : Math.min(exits, entrants));
    $('flowParticipation').textContent = `${number(exits)} saídas · ${number(entrants)} entradas no grupo de votantes`;
    $('flowPrecisionNote').textContent = requestedScope.secao === 'ALL'
      ? 'Valores arredondados para apresentação. Os cálculos e o CSV preservam as frações. Este é um cenário condicionado a 5% de trocas, limitadas às margens de cada urna; não há intervalo de confiança para os fluxos individuais.'
      : 'Nesta urna, gráfico e tabela apresentam inteiros ajustados aos totais dos dois turnos. Os cálculos de zona, município, estado e Brasil, assim como o CSV, preservam as frações originais do modelo.';
    renderCoverage(result);
    setStatus(requestedScope.secao !== 'ALL'
      ? `${requestedLabel} · estimativa pré-calculada desta urna.`
      : `${requestedLabel} · resultados pré-calculados. Filtros aplicados à soma das matrizes.`);
  } catch (error) {
    fail(error.message);
  }
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function download() {
  const result = currentResult;
  if (!result) return;
  const {groups, destinationGroups, totals, flows} = presentation(result);
  const rows = [['recorte', 'origem_1t_ou_ajuste', 'destino_2t_ou_ajuste', 'eleitores_estimados', 'percentual_da_origem', 'sensibilidade_inferior', 'sensibilidade_superior', 'limite_logico_inferior', 'limite_logico_superior', 'total_origem', 'urnas', 'urnas_treino', 'urnas_fora_treino', 'eleitorado_1t', 'eleitorado_2t', 'apresentacao', 'natureza', 'modelo', 'hipotese_taxa_trocas', 'trocas_pareadas']];
  groups.forEach((entry, i) => destinationGroups.forEach((destination, j) => {
    const [lower, upper] = bounds(result, entry.indices, destination.indices);
    const [logicalLower, logicalUpper] = logicalBounds(result, entry.indices, destination.indices);
    rows.push([requestedLabel, entry.label, destination.label, flows[i][j],
      totals[i] ? 100 * flows[i][j] / totals[i] : '', lower, upper,
      logicalLower, logicalUpper, totals[i], result.sectionCount, result.trainingCount, result.outOfTrainingCount,
      result.totalElectorate1, result.totalElectorate2,
      $('flowDetail').value === 'grouped' ? 'Demais candidatos agrupados; brancos e nulos agrupados' : 'Candidatos separados; brancos e nulos agrupados',
      'Estimativa condicionada à hipótese de trocas de participação; ajustes de eleitorado não identificam pessoas ou movimentos entre seções.',
      manifest.modelVersion, manifest.participation?.rate, result.participationSwaps]);
  }));
  const blob = new Blob(['\ufeff', rows.map(row => row.map(csvCell).join(';')).join('\r\n')], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `fluxos-2026-trocas5pct-${requestedScope.uf}-${requestedScope.municipio}-${requestedScope.zona}${requestedScope.secao === 'ALL' ? '' : `-secao-${requestedScope.secao}`}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function initialize() {
  setStatus('Carregando o catálogo dos resultados pré-calculados…');
  try {
    const response = await fetch(new URL('./dados/fluxos/manifest.json?v=trocas5', import.meta.url));
    if (!response.ok) throw new Error('Não foi possível carregar o catálogo das urnas.');
    manifest = await response.json();
    if (!Array.isArray(manifest.ufs) || !Array.isArray(manifest.origens) || !Array.isArray(manifest.destinos)) throw new Error('O catálogo dos resultados está incompleto.');
    $('flowCappedTotal').textContent = integer.format(manifest.participation.audit.capped_sections);
    origins = manifest.origens.map(category);
    destinations = manifest.destinos.map(category);
    if (manifest.comparisonPrevious) {
      const comp = manifest.comparisonPrevious;
      $('flowComparisonBody').innerHTML = [
        ['Brancos/nulos → Lula', 'brancos_nulos_lula_pct'],
        ['Abstenção → Lula', 'abstencao_lula_pct'],
        ['Flávio → abstenção', 'flavio_abstencao_pct']
      ].map(([label, field]) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${percentage(comp.anterior[field])}</td><td>${percentage(comp.hipotese_atual[field])}</td></tr>`).join('');
    }
    const validation = manifest.validacaoHierarquica;
    const rmse = validation?.global_?.rmse_hierarquico_pp;
    if (Number.isFinite(rmse)) {
      const precise = new Intl.NumberFormat('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      $('flowValidation').textContent = `Comparação do RMSE das margens previstas: ajuste estadual ${precise.format(rmse)} p.p.; ajuste nacional ${precise.format(validation.global_.rmse_nacional_pp)} p.p.; referência de distribuição constante ${precise.format(validation.global_.rmse_baseline_pp)} p.p.`;
    }
    updateStates();
    $('flowExterior').disabled = false;
    analyze();
  } catch (error) {
    fail(error.message || 'Não foi possível carregar a base.');
  }
}

$('flowState').addEventListener('change', () => {updateMunicipalities(); queueAnalysis();});
$('flowMunicipality').addEventListener('change', () => {updateZones(); queueAnalysis();});
$('flowZone').addEventListener('change', () => {requestUrnas(); queueAnalysis();});
$('flowUrna').addEventListener('change', queueAnalysis);
$('flowUrnaRetry').addEventListener('click', requestUrnas);
$('flowExterior').addEventListener('change', () => {updateStates(); queueAnalysis();});
$('flowDetail').addEventListener('change', () => {
  if (currentResult) {const displayed = displayedResult(currentResult); renderTable(displayed); renderChart(displayed);}
});
$('flowRetry').addEventListener('click', () => manifest ? analyze() : initialize());
$('flowDownload').addEventListener('click', download);
document.querySelector('a[href="#metodo"]')?.addEventListener('click', () => {$('metodo').open = true;});
if (location.hash === '#metodo') $('metodo').open = true;
let resizeTimer;
window.addEventListener('resize', () => {clearTimeout(resizeTimer); resizeTimer = setTimeout(() => currentResult && renderChart(displayedResult(currentResult)), 100);});
initialize();
