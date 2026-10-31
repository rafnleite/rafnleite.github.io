import {zoomYRange} from './chart-y-zoom.mjs?v=1';
import { aggregateHistogram, formatMinute, formatCoveragePercent, inScope, minuteToDateTime, validateDataset, VOTES, MIN_INTERVAL, MAX_INTERVAL } from './histogram.mjs';
import { zoomBinWindow, histogramZoomView, histogramDataExtent } from './chart-zoom.mjs?v=filtered-axes-1';

const $ = id => document.getElementById(id);
const integer = new Intl.NumberFormat('pt-BR');
const cumulativePercent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const UF_NAMES = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins', ZZ: 'Exterior' };
const metrics = [
  { key: 'urnas', element: 'histogramChart', name: 'Urnas encerradas', unit: 'Número de urnas' },
  { key: 'eleitores', element: 'histogramChart', name: 'Eleitores aptos nessas urnas', unit: 'Número de eleitores' },
  { key: 'votos', element: 'histogramChart', name: 'Votos nessas urnas', unit: 'Número de votos' },
];
const state = { data: null, origin: 'network', metric: 'urnas', turn: 2, territory: 'brazil', uf: 'ALL', interval: 1, vote: 'total', window: 'all', customRange: [990, 1200], histogram: null, loading: false, tableLimit: 200, timer: null, chartZoom: null, chartZoomKey: null, chartViewport: null, chartYZoom: null, chartYZoomRight: null };
const VOTE_COLORS = { total: '#c39b57', lula: '#d73027', flavio: '#2166ac', nulos: '#7b8085', brancos: '#a4b8ad' };
const svgNamespace = 'http://www.w3.org/2000/svg';
const activeMetric = () => metrics.find(metric => metric.key === state.metric);
const cumulativeLabel = value => value === null || value === undefined ? '—' : cumulativePercent.format(value);

function text(id, value) { $(id).textContent = value; }
function message(value, error = false) {
  $('message').hidden = !value;
  $('message').classList.toggle('error', error);
  $('message').textContent = value || '';
}
function safeDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'data não informada' : `${dateTime.format(parsed)} (Brasília)`;
}
function electionDate() { return state.data.elections[String(state.turn)].date; }
function scopeLabel() {
  if (state.uf !== 'ALL') return `${UF_NAMES[state.uf] || state.uf}${state.uf === 'ZZ' ? '' : ` · ${state.uf}`}`;
  return { all: 'Brasil e exterior', brazil: 'Brasil · exterior excluído', exterior: 'Somente exterior' }[state.territory];
}
function selectedCoverage() { return state.data.coverage.filter(item => item.turno === state.turn && inScope(item.uf, state.territory, state.uf)); }

function renderUFs() {
  const codes = state.data ? [...new Set([...state.data.coverage.map(item => item.uf), ...state.data.rows.map(row => row[1])])] : Object.keys(UF_NAMES);
  const available = codes.filter(code => inScope(code, state.territory)).sort((a, b) => (UF_NAMES[a] || a).localeCompare(UF_NAMES[b] || b, 'pt-BR'));
  if (!available.includes(state.uf)) state.uf = 'ALL';
  $('uf').replaceChildren(new Option(state.territory === 'exterior' ? 'Exterior (ZZ)' : 'Todas as UFs', 'ALL'), ...available.filter(code => state.territory !== 'exterior').map(code => new Option(`${code} · ${UF_NAMES[code] || code}`, code)));
  $('uf').value = state.uf;
  $('uf').disabled = state.territory === 'exterior';
}

function setData(value, origin = 'network') {
  state.data = validateDataset(value);
  state.origin = origin;
  renderUFs();
  render();
  clearInterval(state.timer);
  if (value.mode === 'live' && origin === 'network') {
    state.timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60000);
  }
}

async function refresh() {
  if (state.loading) return;
  if (location.protocol === 'file:') {
    message('Para atualizar automaticamente, abra a página pelo servidor local. Você também pode usar “Importar arquivo JSON” para explorar um arquivo de dados salvo.');
    if (!state.data) $('histogramChart').replaceChildren(Object.assign(document.createElement('p'), { className: 'chart-placeholder', textContent: 'Importe o arquivo JSON dos horários para começar.' }));
    text('updatedAt', state.data ? `Arquivo gerado em ${safeDate(state.data.generatedAt)}` : 'Nenhum arquivo de dados carregado');
    return;
  }
  state.loading = true;
  $('refreshButton').disabled = true;
  $('refreshButton').setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('./data.json', { cache: 'no-store' });
    const value = await response.json();
    if (!response.ok || value.error) throw new Error(value.error || `A base de dados respondeu com erro ${response.status}.`);
    validateDataset(value);
    const stale = response.headers.get('X-Snapshot-Stale') === '1' || Boolean(value.refreshError);
    if (!stale || !state.data) setData(value);
    if (stale) message('A atualização da base local falhou. O gráfico mantém a última base válida; os dados podem estar desatualizados. Use “Atualizar” para tentar novamente.', true);
    else message('');
  } catch (error) {
    const reason = error instanceof SyntaxError ? 'O servidor não retornou um arquivo JSON de horários válido.' : error.message;
    message(`${reason} ${state.data ? 'A última base válida foi mantida no gráfico.' : 'Use “Atualizar” para tentar novamente ou importe um arquivo JSON salvo.'}`, true);
    if (!state.data) {
      text('updatedAt', 'Não foi possível carregar a base');
      $('histogramChart').replaceChildren(Object.assign(document.createElement('p'), { className: 'chart-placeholder', textContent: 'O gráfico aguarda uma base válida. Nenhum dado foi estimado.' }));
    }
  } finally {
    state.loading = false;
    $('refreshButton').disabled = false;
    $('refreshButton').removeAttribute('aria-busy');
  }
}

function render() {
  if (!state.data) return;
  state.tableLimit = 200;
  hideTooltip();
  try {
    state.histogram = aggregateHistogram(state.data, { turn: state.turn, territory: state.territory, uf: state.uf, interval: state.interval, vote: state.vote, range: state.window === 'custom' ? state.customRange : state.window === 'focus' ? [990, 1200] : null });
  } catch (error) { message(error.message, true); return; }
  const { totals, populationTotals, coverage, plottedCoverage, outsideWindow, bins, domain } = state.histogram;
  const vote = VOTES[state.vote];
  $('toggleExteriorChart').disabled = false;
  $('toggleExteriorChart').checked = state.territory !== 'brazil';
  $('excludeExterior').checked = state.territory === 'brazil';
  $('voteLegend').hidden = state.metric !== 'votos';
  document.documentElement.style.setProperty('--selected-vote-color', VOTE_COLORS[state.vote]);
  document.querySelectorAll('#voteLegend [data-vote]').forEach(button => {
    const selected = button.dataset.vote === state.vote;
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  text('urnasValue', integer.format(totals.urnas));
  text('eleitoresValue', integer.format(totals.eleitores));
  text('votosValue', integer.format(totals.votos));
  for (const id of ['urnasValue', 'eleitoresValue', 'votosValue']) $(id).classList.toggle('long', $(id).textContent.length >= 10);
  text('votesCardLabel', vote.short);
  text('metricTitle', state.metric === 'votos' ? `${vote.short} nessas urnas` : activeMetric().name);
  text('metricAxis', activeMetric().unit);
  $('metricDot').className = `dot ${state.metric}`;
  const cumulativeSubjects = { urnas: 'das urnas disponíveis', eleitores: 'dos eleitores aptos nas urnas disponíveis', votos: 'dos votos selecionados nas urnas disponíveis' };
  text('cumulativeDescription', `Percentual ${cumulativeSubjects[state.metric]} no recorte, em todos os horários.`);
  document.querySelectorAll('.metric-switch [data-metric]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.metric === state.metric)));
  text('votosDetail', state.vote === 'total' ? 'Todos os tipos de voto presidencial' : 'Nas urnas exibidas no gráfico');
  text('urnasDetail', outsideWindow ? `${integer.format(outsideWindow)} com horário fora desta janela` : 'Com horário convertido para Brasília');
  text('coverageValue', formatCoveragePercent(populationTotals.urnas, coverage.esperadas));
  $('coverageValue').classList.toggle('long', $('coverageValue').textContent.length > 7);
  text('coverageDetail', `${integer.format(populationTotals.urnas)} de ${integer.format(coverage.esperadas)} seções cadastradas`);
  $('coverageBar').style.width = `${Math.min(100, Math.max(0, (plottedCoverage || 0) * 100))}%`;
  const complete = plottedCoverage === 1 && !selectedCoverage().some(item => item.esperadas === 0);
  text('partialBadge', complete ? 'Completa' : 'Parcial');
  $('partialBadge').classList.toggle('complete', complete);
  const imported = state.origin === 'file';
  const live = state.data.mode === 'live' && !imported;
  text('modeBadge', imported ? 'Arquivo importado' : live ? 'Base local' : 'Base publicada');
  $('modeBadge').classList.toggle('live', live);
  text('updatedAt', `${imported ? 'Arquivo gerado' : 'Base gerada'} em ${safeDate(state.data.generatedAt)}`);
  text('refreshLabel', imported ? 'Arquivo salvo · sem atualização automática' : live ? 'Atualização da base local a cada 60 segundos' : 'Dados da publicação mais recente');
  text('chartDescription', `${state.data.elections[String(state.turn)].label || `${state.turn}º turno`} · ${scopeLabel()} · faixas de ${state.interval === 1 ? '1 minuto' : `${state.interval} minutos`}.`);
  $('exteriorNotice').hidden = !inScope('ZZ', state.territory, state.uf);
  text('rangeLabel', domain ? `${electionDate().split('-').reverse().join('/')} · ${formatMinute(domain[0], { compact: true })}–${formatMinute(domain[1], { compact: true })} · Brasília` : 'Eixo horizontal: horário de encerramento em Brasília');
  text('binsCount', bins.length ? `${integer.format(bins.length)} faixas` : 'Sem horários');
  text('tableVoteHeading', vote.short);
  text('tipVoteLabel', vote.short);
  text('sourceLabel', `Fonte: ${typeof state.data.source === 'string' ? state.data.source : 'Boletins de urna do TSE'}. Somente eleição presidencial.`);
  $('exportButton').disabled = bins.length === 0;
  renderCoverage();
  renderCharts();
  if ($('binDetails').open) renderTable();
}

function renderCoverage() {
  const { coverage, populationTotals, outsideWindow } = state.histogram;
  text('coverageExplanation', `O cadastro deste recorte contém ${integer.format(coverage.esperadas)} seções principais. ${coverage.dispensadas ? `Dessas, ${integer.format(coverage.dispensadas)} foram dispensadas pelo TRE-DF e não tiveram votação nem BU. ` : ''}${integer.format(populationTotals.urnas)} têm encerramento e fuso identificados. A cobertura dos horários usa o total cadastrado e considera todos os horários, mesmo quando a janela do gráfico é reduzida.`);
  const rows = [
    ['Seções cadastradas', coverage.esperadas],
    ['Seções dispensadas, sem votação', coverage.dispensadas],
    ['BUs esperados nas seções não dispensadas', Math.max(0, coverage.esperadas - coverage.dispensadas)],
    ['BUs coletados', coverage.coletadas],
    ['Urnas incluídas no histograma', populationTotals.urnas],
    ['Sem horário de encerramento', coverage.sem_horario],
    ['Fuso não identificado', coverage.fuso_indeterminado],
    ['BUs desatualizados, fora do gráfico', coverage.desatualizadas],
    ['Seções excluídas', coverage.excluidas],
    ['BUs pendentes de coleta', Math.max(0, coverage.esperadas - coverage.dispensadas - coverage.coletadas - coverage.excluidas)],
  ];
  if (coverage.dados_invalidos) rows.push(['Dados inválidos, fora do gráfico', coverage.dados_invalidos]);
  if (outsideWindow) rows.push(['Horário fora da janela selecionada', outsideWindow]);
  $('coverageList').replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement('div');
    row.append(Object.assign(document.createElement('dt'), { textContent: label }), Object.assign(document.createElement('dd'), { textContent: integer.format(value) }));
    return row;
  }));
  const exclusions = [];
  if (coverage.sem_horario) exclusions.push(`${integer.format(coverage.sem_horario)} sem horário`);
  if (coverage.fuso_indeterminado) exclusions.push(`${integer.format(coverage.fuso_indeterminado)} com fuso não identificado`);
  if (coverage.dados_invalidos) exclusions.push(`${integer.format(coverage.dados_invalidos)} com dados inválidos`);
  text('exclusionsNote', `${exclusions.length ? `Ficam fora do gráfico: ${exclusions.join('; ')}. ` : ''}O horário de emissão ou apuração não substitui o encerramento. Seções agregadas contam pela urna principal.`);
  const notes = Array.isArray(state.data.notes) ? state.data.notes.filter(note => typeof note === 'string') : [];
  $('sourceNotes').replaceChildren();
  if (coverage.dispensadas) {
    const source = document.createElement('p');
    const link = Object.assign(document.createElement('a'), { href: 'https://www.tre-df.jus.br/comunicacao/noticias/2026/Setembro/tre-df-dispensa-46-locais-de-votacao-no-exterior-nas-eleicoes-2026', textContent: 'Dispensa de locais de votação no exterior · TRE-DF', target: '_blank', rel: 'noopener noreferrer' });
    source.append(link);
    $('sourceNotes').append(source);
  }
  if (notes.length) {
    const details = document.createElement('details');
    details.className = 'notes-details';
    details.append(Object.assign(document.createElement('summary'), { textContent: `Notas da base · ${notes.length}` }), ...notes.map(note => Object.assign(document.createElement('p'), { textContent: note })));
    $('sourceNotes').append(details);
  }
}

function svgElement(name, attributes = {}, content = null) {
  const element = document.createElementNS(svgNamespace, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (content !== null) element.textContent = content;
  return element;
}
function compactCount(value) {
  if (value >= 1000000) return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value / 1000000)} mi`;
  if (value >= 1000) return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: value >= 10000 ? 0 : 1 }).format(value / 1000)} mil`;
  return integer.format(value);
}
function axisScale(maximum) {
  if (!maximum) return { maximum: 1, ticks: [0] };
  const raw = maximum / 3;
  const order = 10 ** Math.floor(Math.log10(raw));
  const factor = [1, 2, 2.5, 5, 10].find(number => number * order >= raw);
  const step = Math.max(1, factor * order);
  const top = Math.ceil(maximum / step) * step;
  const ticks = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return { maximum: top, ticks };
}

function renderCharts() {
  if (!state.histogram) return;
  hideTooltip();
  const extent = histogramDataExtent(state.histogram, state.metric, { preserveRange: state.window !== 'all' });
  const zoomKey = JSON.stringify([state.turn, state.territory, state.uf, state.interval, state.metric, state.vote, state.window,
    state.window === 'custom' ? state.customRange : null, state.histogram.domain, state.histogram.bins.length, extent]);
  if (state.chartZoomKey !== zoomKey) { state.chartZoom = null; state.chartYZoom = null; state.chartYZoomRight = null; state.chartZoomKey = zoomKey; }
  const view = histogramZoomView(state.histogram, state.chartZoom, extent);
  state.chartViewport = view;
  const { bins, domain, startIndex } = view;
  $('resetChartZoom').hidden = !view.zoomed && !state.chartYZoom && !state.chartYZoomRight;
  text('chartZoomStatus', view.zoomed ? 'Zoom aplicado apenas à visualização; totais e tabela preservados.' : 'Use a roda do mouse sobre o gráfico para ampliar ou afastar.');
  if (view.zoomed && domain) text('rangeLabel', `${electionDate().split('-').reverse().join('/')} · ${formatMinute(domain[0], { compact: true })}–${formatMinute(domain[1], { compact: true })} · Brasília · zoom`);
  else if (domain) text('rangeLabel', `${electionDate().split('-').reverse().join('/')} · ${formatMinute(domain[0], { compact: true })}–${formatMinute(domain[1], { compact: true })} · Brasília`);
  for (const metric of [activeMetric()]) {
    const container = $(metric.element);
    container.replaceChildren();
    if (!bins.length || !state.histogram.populationTotals.urnas) {
      container.append(Object.assign(document.createElement('p'), { className: 'chart-placeholder', textContent: state.histogram.populationTotals.urnas ? 'Nenhuma urna encerrou nesta janela. Selecione “Todos os horários” para ampliar a visão.' : 'Ainda não há urnas com encerramento e fuso identificados neste recorte.' }));
      continue;
    }
    const width = Math.max(280, container.clientWidth);
    const height = container.clientHeight;
    const left = width < 500 ? 43 : 58, right = width < 500 ? 43 : 50, top = 17, bottom = 30;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const bottomY = top + plotHeight;
    const x = minute => left + (minute - domain[0]) / (domain[1] - domain[0]) * plotWidth;
    const scale = axisScale(Math.max(...bins.map(bin => bin[metric.key])));
    const yRange=state.chartYZoom||[0,scale.maximum],rightRange=state.chartYZoomRight||[0,100];
    const yValue=value=>bottomY-(value-yRange[0])/(yRange[1]-yRange[0])*plotHeight;
    if(state.chartYZoom)scale.ticks=Array.from({length:5},(_,i)=>yRange[0]+i*(yRange[1]-yRange[0])/4);
    const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': `${metric.name}, com linha de percentual acumulado e eixo direito de zero a cem por cento dos dados disponíveis do recorte completo. Use a roda do mouse para ampliar e as setas esquerda e direita para explorar as faixas. Os valores também estão na tabela.`, 'data-left': left, 'data-plot-width': plotWidth, 'data-top': top, 'data-plot-height': plotHeight, 'data-y-max': scale.maximum });
    svg.append(svgElement('title', {}, metric.name));
    for (const tick of scale.ticks) {
      const y = yValue(tick);
      svg.append(svgElement('line', { x1: left, x2: width - right, y1: y, y2: y, class: tick ? 'grid-line' : 'axis-line' }));
      svg.append(svgElement('text', { x: left - 10, y: y + 3, 'text-anchor': 'end', class: 'axis-label' }, compactCount(tick)));
    }
    svg.append(svgElement('line', { x1: width - right, x2: width - right, y1: top, y2: bottomY, class: 'cumulative-axis' }));
    for (const tick of Array.from({length:5},(_,i)=>rightRange[0]+i*(rightRange[1]-rightRange[0])/4)) {
      const y = bottomY - (tick-rightRange[0])/(rightRange[1]-rightRange[0])*plotHeight;
      svg.append(svgElement('text', { x: width - right + 9, y: y + 3, 'text-anchor': 'start', class: 'axis-label cumulative-label' }, `${Math.round(tick*10)/10}%`));
    }
    const tickCount = Math.max(2, Math.min(7, Math.floor(plotWidth / 112)));
    const rawMinutes = (domain[1] - domain[0]) / tickCount;
    const tickStep = [1, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080].find(value => value >= rawMinutes) || Math.ceil(rawMinutes / 1440) * 1440;
    const tickMinutes = [];
    for (let minute = Math.ceil(domain[0] / tickStep) * tickStep; minute <= domain[1]; minute += tickStep) tickMinutes.push(minute);
    if (tickMinutes.length < 2) tickMinutes.splice(0, tickMinutes.length, domain[0], domain[1]);
    for (const minute of tickMinutes) {
      svg.append(svgElement('line', { x1: x(minute), x2: x(minute), y1: bottomY, y2: bottomY + 4, class: 'axis-line' }));
      const atLeft = x(minute) < left + 20;
      const atRight = x(minute) > width - right - 24;
      svg.append(svgElement('text', { x: x(minute), y: height - 10, 'text-anchor': atLeft ? 'start' : atRight ? 'end' : 'middle', class: 'axis-label' }, formatMinute(minute, { compact: true })));
    }
    let path = '';
    for (const bin of bins) {
      if (!bin[metric.key]) continue;
      const binWidth = x(bin.end) - x(bin.start);
      const barHeight = Math.max(.5, bin[metric.key]/(yRange[1]-yRange[0])*plotHeight);
      const barWidth = binWidth;
      const barX = x(bin.start);
      path += `M${barX},${yValue(0)}v${-barHeight}h${barWidth}v${barHeight}Z`;
    }
    svg.append(svgElement('defs', {}, undefined));
    const clip=svgElement('clipPath',{id:'histogramYClip'});clip.append(svgElement('rect',{x:left,y:top,width:plotWidth,height:plotHeight}));svg.querySelector('defs').append(clip);
    svg.append(svgElement('path', { d: path, class: `bars-${metric.key}`, 'aria-hidden': 'true', 'clip-path':'url(#histogramYClip)' }));
    const denominator = state.histogram.populationTotals[metric.key];
    if (denominator > 0) {
      const y = ratio => bottomY-(ratio*100-rightRange[0])/(rightRange[1]-rightRange[0])*plotHeight;
      let cumulativePath = `M${x(domain[0])},${y(view.prefixAccumulated[metric.key])}`;
      for (const bin of bins) cumulativePath += `L${x(bin.end)},${y(bin.accumulated[metric.key])}`;
      svg.append(svgElement('path', { d: cumulativePath, class: 'cumulative-line', 'aria-hidden': 'true', 'clip-path':'url(#histogramYClip)' }));
    }
    const line = svgElement('line', { x1: 0, x2: 0, y1: top, y2: bottomY, class: 'cursor-line', visibility: 'hidden', 'aria-hidden': 'true' });
    svg.append(line);
    let first = true;
    bins.forEach((bin, index) => {
      const fullIndex = startIndex + index;
      const target = svgElement('rect', {
        x: x(bin.start), y: top, width: Math.max(.3, x(bin.end) - x(bin.start)), height: plotHeight,
        class: 'bar-target', tabindex: first ? '0' : '-1', role: 'img', 'data-index': fullIndex,
        'aria-label': `${formatMinute(bin.start)} até ${formatMinute(bin.end)}, fim exclusivo: ${integer.format(bin.urnas)} urnas, ${integer.format(bin.eleitores)} eleitores aptos, ${integer.format(bin.votos)} ${VOTES[state.vote].short.toLowerCase()}. Percentual acumulado da métrica ativa: ${cumulativeLabel(bin.accumulated[metric.key])}.`,
      });
      first = false;
      target.addEventListener('pointerenter', event => showBin(fullIndex, event.clientX, event.clientY));
      target.addEventListener('pointermove', event => positionTooltip(event.clientX, event.clientY));
      target.addEventListener('pointerleave', hideTooltip);
      target.addEventListener('focus', () => {
        svg.querySelectorAll('.bar-target').forEach(element => element.setAttribute('tabindex', element === target ? '0' : '-1'));
        const bounds = target.getBoundingClientRect();
        showBin(fullIndex, bounds.left + bounds.width / 2, bounds.top + 20);
      });
      target.addEventListener('blur', hideTooltip);
      target.addEventListener('keydown', event => {
        if (event.key === 'Escape') { hideTooltip(); return; }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const targets = [...svg.querySelectorAll('.bar-target')];
        const current = targets.indexOf(target);
        const destination = event.key === 'Home' ? 0 : event.key === 'End' ? targets.length - 1 : Math.max(0, Math.min(targets.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1)));
        targets[destination].focus();
      });
      svg.append(target);
    });
    container.append(svg);
  }
}

function showBin(index, clientX, clientY) {
  const bin = state.histogram.bins[index];
  text('tipRange', `${formatMinute(bin.start)}–${formatMinute(bin.end)}`);
  text('tipUrnas', integer.format(bin.urnas));
  text('tipEleitores', integer.format(bin.eleitores));
  text('tipVotos', integer.format(bin.votos));
  text('tipAccumulated', cumulativeLabel(bin.accumulated[state.metric]));
  $('tooltip').hidden = false;
  for (const metric of [activeMetric()]) {
    const svg = $(metric.element).querySelector('svg');
    if (!svg) continue;
    const domain = state.chartViewport?.domain || state.histogram.domain;
    const position = Number(svg.dataset.left) + ((bin.start + bin.end) / 2 - domain[0]) / (domain[1] - domain[0]) * Number(svg.dataset.plotWidth);
    const line = svg.querySelector('.cursor-line');
    line.setAttribute('x1', position); line.setAttribute('x2', position); line.setAttribute('visibility', 'visible');
  }
  positionTooltip(clientX, clientY);
}
function positionTooltip(clientX, clientY) {
  if ($('tooltip').hidden) return;
  const bounds = $('tooltip').getBoundingClientRect();
  const left = Math.max(12, Math.min(window.innerWidth - bounds.width - 12, clientX + 15));
  const preferredTop = clientY + bounds.height + 20 > window.innerHeight ? clientY - bounds.height - 15 : clientY + 15;
  const top = Math.max(12, Math.min(window.innerHeight - bounds.height - 12, preferredTop));
  $('tooltip').style.left = `${left}px`;
  $('tooltip').style.top = `${top}px`;
}
function hideTooltip() {
  $('tooltip').hidden = true;
  document.querySelectorAll('.cursor-line').forEach(line => line.setAttribute('visibility', 'hidden'));
}

function renderTable() {
  if (!state.histogram) return;
  const { bins, totals } = state.histogram;
  const rows = $('includeEmpty').checked ? bins : bins.filter(bin => bin.urnas);
  const visible = rows.slice(0, state.tableLimit);
  $('binRows').replaceChildren(...visible.map(bin => {
    const row = document.createElement('tr');
    const range = document.createElement('th');
    range.scope = 'row'; range.textContent = `${formatMinute(bin.start)}–${formatMinute(bin.end)}`;
    row.append(range, ...['urnas', 'eleitores', 'votos'].map(key => Object.assign(document.createElement('td'), { textContent: integer.format(bin[key]) })), Object.assign(document.createElement('td'), { textContent: cumulativeLabel(bin.accumulated[state.metric]) }));
    return row;
  }));
  if (!rows.length) {
    const cell = document.createElement('td'); cell.colSpan = 5; cell.textContent = 'Nenhuma faixa com urnas neste recorte.';
    const row = document.createElement('tr'); row.append(cell); $('binRows').append(row);
  }
  text('tableUrnas', integer.format(totals.urnas)); text('tableEleitores', integer.format(totals.eleitores)); text('tableVotos', integer.format(totals.votos));
  text('tableAccumulated', cumulativeLabel(bins.at(-1)?.accumulated[state.metric]));
  text('pageInfo', `${integer.format(visible.length)} de ${integer.format(rows.length)} faixas${$('includeEmpty').checked ? '' : ' com urnas'} · CSV inclui todas as faixas`);
  text('tableCaption', `${scopeLabel()} · ${state.data.elections[String(state.turn)].label} · Brasília. Início incluso e fim exclusivo. Acumulado de ${state.metric === 'votos' ? VOTES[state.vote].short.toLowerCase() : state.metric === 'eleitores' ? 'eleitores aptos' : 'urnas'} até o fim da faixa, sobre todos os horários disponíveis no recorte.`);
  $('moreBins').hidden = visible.length >= rows.length;
}

function downloadCSV() {
  if (!state.histogram?.bins.length) return;
  const date = electionDate();
  const escape = value => /[;"\n\r]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
  const columns = ['turno', 'recorte', 'uf', 'intervalo_configurado_minutos', 'duracao_faixa_minutos', 'inicio_brasilia_inclusivo', 'fim_brasilia_exclusivo', 'urnas', 'eleitores_aptos', 'votos_selecionados', 'filtro_votos', 'metrica_acumulado', 'acumulado_percentual', 'total_metrica_disponivel_recorte_todos_horarios', 'base_gerada_em'];
  const rows = state.histogram.bins.map(bin => [state.turn, scopeLabel(), state.uf, state.interval, bin.end - bin.start, minuteToDateTime(date, bin.start), minuteToDateTime(date, bin.end), bin.urnas, bin.eleitores, bin.votos, VOTES[state.vote].label, state.metric, bin.accumulated[state.metric] === null ? '' : (bin.accumulated[state.metric] * 100).toFixed(6).replace('.', ','), state.histogram.populationTotals[state.metric], state.data.generatedAt || '']);
  const content = '\uFEFF' + [columns, ...rows].map(row => row.map(escape).join(';')).join('\n') + '\n';
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `encerramento_2026_${state.turn}t_${state.uf === 'ALL' ? state.territory : state.uf.toLowerCase()}_${state.interval}min_${state.vote}_${state.metric}.csv`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('refreshButton').addEventListener('click', refresh);
function setTerritory(territory) {
  state.territory = territory;
  $('territory').value = territory;
  $('excludeExterior').checked = territory === 'brazil';
  renderUFs();
  render();
}
$('territory').addEventListener('change', event => setTerritory(event.target.value));
$('excludeExterior').addEventListener('change', event => setTerritory(event.target.checked ? 'brazil' : 'all'));
$('toggleExteriorChart').addEventListener('change', event => setTerritory(event.target.checked ? 'all' : 'brazil'));
$('uf').addEventListener('change', event => { state.uf = event.target.value; render(); });
$('interval').min = MIN_INTERVAL;
$('interval').max = MAX_INTERVAL;
function updateInterval(event) {
  const input = event.target;
  input.setCustomValidity('');
  const interval = input.valueAsNumber;
  if (!Number.isSafeInteger(interval) || interval < MIN_INTERVAL || interval > MAX_INTERVAL) input.setCustomValidity(`Informe um número inteiro de ${MIN_INTERVAL} a ${MAX_INTERVAL} minutos.`);
  input.setAttribute('aria-invalid', String(!input.validity.valid));
  if (!input.validity.valid) {
    if (event.type === 'change') input.reportValidity();
    return;
  }
  state.interval = interval;
  render();
}
$('interval').addEventListener('input', updateInterval);
$('interval').addEventListener('change', updateInterval);
$('vote').addEventListener('change', event => { state.vote = event.target.value; state.metric = 'votos'; render(); });
const voteButtons = [...document.querySelectorAll('#voteLegend [data-vote]')];
function selectVote(button) {
  $('vote').value = button.dataset.vote;
  $('vote').dispatchEvent(new Event('change', { bubbles: true }));
}
voteButtons.forEach((button, index) => {
  button.addEventListener('click', () => selectVote(button));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? voteButtons.length - 1
      : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + voteButtons.length) % voteButtons.length;
    selectVote(voteButtons[next]); voteButtons[next].focus();
  });
});
$('histogramChart').addEventListener('dblclick',event=>{const svg=$('histogramChart').querySelector('svg');if(!svg)return;const box=svg.getBoundingClientRect(),x=(event.clientX-box.left)/box.width*svg.viewBox.baseVal.width;if(x<Number(svg.dataset.left)||x>Number(svg.dataset.left)+Number(svg.dataset.plotWidth)){state.chartYZoom=null;state.chartYZoomRight=null;renderCharts();}});
let chartZoomFrame = null;
$('histogramChart').addEventListener('wheel', event => {
  const total = state.histogram?.bins.length || 0, svg = $('histogramChart').querySelector('svg');
  if (total < 1 || !svg || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
  event.preventDefault();
  const bounds = svg.getBoundingClientRect(), width = svg.viewBox.baseVal.width;
  const cursor = bounds.width ? (event.clientX - bounds.left) / bounds.width * width : width / 2;
  const y=(event.clientY-bounds.top)/bounds.height*svg.viewBox.baseVal.height,top=Number(svg.dataset.top),plotHeight=Number(svg.dataset.plotHeight);
  if(y>=top-8&&y<=top+plotHeight+8&&(cursor<Number(svg.dataset.left)||cursor>Number(svg.dataset.left)+Number(svg.dataset.plotWidth))){
    const right=cursor>Number(svg.dataset.left)+Number(svg.dataset.plotWidth),key=right?'chartYZoomRight':'chartYZoom',full=right?[0,100]:[0,Number(svg.dataset.yMax)];
    state[key]=zoomYRange(state[key]||full,event.deltaY*(event.deltaMode===1?16:1),1-(y-top)/plotHeight,full);renderCharts();return;
  }
  const anchor = (cursor - Number(svg.dataset.left)) / Number(svg.dataset.plotWidth);
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, bounds.height) : 1);
  state.chartZoom = zoomBinWindow(total, state.chartZoom, delta, anchor, 2, state.chartViewport?.extent);
  if (chartZoomFrame !== null) return;
  chartZoomFrame = requestAnimationFrame(() => { chartZoomFrame = null; renderCharts(); });
}, { passive: false });
$('resetChartZoom').addEventListener('click', () => { state.chartZoom = null; state.chartYZoom=null; state.chartYZoomRight=null; renderCharts(); });
document.querySelectorAll('.metric-switch [data-metric]').forEach(button => button.addEventListener('click', () => { state.metric = button.dataset.metric; render(); }));
$('window').addEventListener('change', event => {
  state.window = event.target.value;
  $('customWindow').hidden = state.window !== 'custom';
  render();
});
function updateCustomWindow() {
  const start = $('windowStart'), end = $('windowEnd');
  end.setCustomValidity('');
  const minutes = value => { const [hours, mins] = value.split(':').map(Number); return hours * 60 + mins; };
  const from = minutes(start.value), to = minutes(end.value);
  if (start.value && end.value && from === to) end.setCustomValidity('Escolha um horário final diferente do inicial. Para ver o dia completo, selecione “Todos os horários”.');
  start.setAttribute('aria-invalid', String(!start.validity.valid));
  end.setAttribute('aria-invalid', String(!end.validity.valid));
  if (!start.reportValidity() || !end.reportValidity()) return;
  state.customRange = [from, to < from ? to + 1440 : to];
  if (state.window === 'custom') render();
}
$('windowStart').addEventListener('change', updateCustomWindow);
$('windowEnd').addEventListener('change', updateCustomWindow);
document.querySelectorAll('[data-turn]').forEach(button => button.addEventListener('click', () => {
  state.turn = Number(button.dataset.turn);
  document.querySelectorAll('[data-turn]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  render();
}));
$('exportButton').addEventListener('click', downloadCSV);
$('binDetails').addEventListener('toggle', () => { if ($('binDetails').open) renderTable(); });
$('includeEmpty').addEventListener('change', () => { state.tableLimit = 200; renderTable(); });
$('moreBins').addEventListener('click', () => { state.tableLimit += 200; renderTable(); });
$('jsonFile').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try { setData(JSON.parse(await file.text()), 'file'); message(`Arquivo “${file.name}” carregado. O gráfico mostra os dados dessa fotografia salva.`); }
  catch (error) { message(`${error instanceof SyntaxError ? 'O arquivo não contém um JSON válido.' : error.message} ${state.data ? 'A base anterior foi mantida.' : ''}`, true); }
  event.target.value = '';
});
const importControl = document.querySelector('.import-link');
importControl.tabIndex = 0; importControl.setAttribute('role', 'button'); $('jsonFile').tabIndex = -1;
importControl.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('jsonFile').click(); } });
let resizeFrame;
new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(renderCharts); }).observe($('histogramChart'));
window.addEventListener('scroll', hideTooltip, { passive: true });
window.addEventListener('resize', hideTooltip);
document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });
renderUFs();
refresh();
