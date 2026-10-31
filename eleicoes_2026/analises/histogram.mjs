/** Pure aggregation of BU closing times already converted to Brasília. */
export const INTERVALS = [1, 5, 10, 15, 30, 60];
export const MIN_INTERVAL = 1;
export const MAX_INTERVAL = 180;
export const VOTES = {
  total: { index: 5, label: 'Todos os votos', short: 'Votos totais' },
  lula: { index: 6, label: 'Lula · 13', short: 'Votos em Lula' },
  flavio: { index: 7, label: 'Flávio · 22', short: 'Votos em Flávio' },
  nulos: { index: 8, label: 'Nulos', short: 'Votos nulos' },
  brancos: { index: 9, label: 'Brancos', short: 'Votos brancos' },
};

const COVERAGE_COUNTS = ['esperadas', 'coletadas', 'incluidas', 'sem_horario', 'fuso_indeterminado', 'desatualizadas', 'excluidas', 'dados_invalidos', 'dispensadas'];
const zero = () => ({ urnas: 0, eleitores: 0, votos: 0 });
const number = value => Number.isSafeInteger(value) && value >= 0;
const coveragePercent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 4 });

/** Coverage must never round an incomplete collection up to 100%. */
export function formatCoveragePercent(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || part < 0 || total <= 0) return '—';
  if (part >= total) return '100%';
  const formatted = coveragePercent.format(part / total);
  return formatted === '100%' ? '<100%' : formatted;
}

export function validateDataset(data) {
  if (!data || data.schemaVersion !== 1 || data.timeZone !== 'America/Sao_Paulo' || !Array.isArray(data.rows) || !Array.isArray(data.coverage)) {
    throw new Error('Arquivo incompatível. Use o JSON de horários de encerramento gerado pelo coletor.');
  }
  if (!data.elections || !data.elections['1'] || !data.elections['2']) throw new Error('O arquivo não identifica as eleições dos dois turnos.');
  for (const election of Object.values(data.elections)) {
    const date = election?.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
      throw new Error('O arquivo contém uma data eleitoral inválida.');
    }
  }
  if (data.generatedAt && Number.isNaN(new Date(data.generatedAt).getTime())) throw new Error('A data de geração da base é inválida.');
  for (const row of data.rows) {
    if (!Array.isArray(row) || row.length !== 10 || ![1, 2].includes(row[0]) || !/^[A-Z]{2}$/.test(row[1]) || !Number.isSafeInteger(row[2]) || !row.slice(3).every(number)) {
      throw new Error('O arquivo contém uma linha de horários ou de contagens inválida.');
    }
  }
  for (const item of data.coverage) {
    if (!item || ![1, 2].includes(item.turno) || !/^[A-Z]{2}$/.test(item.uf) || !COVERAGE_COUNTS.every(key => number(item[key] ?? 0))) {
      throw new Error('O arquivo contém informações de cobertura inválidas.');
    }
  }
  return data;
}

export function inScope(uf, territory = 'all', selection = 'ALL') {
  return (selection === 'ALL' || selection === uf) && (territory !== 'brazil' || uf !== 'ZZ') && (territory !== 'exterior' || uf === 'ZZ');
}

export function aggregateHistogram(data, { turn = 2, territory = 'all', uf = 'ALL', interval = 5, vote = 'total', range = null } = {}) {
  if (!Number.isInteger(interval) || interval < MIN_INTERVAL || interval > MAX_INTERVAL) {
    throw new Error(`A duração da faixa deve ser um número inteiro de ${MIN_INTERVAL} a ${MAX_INTERVAL} minutos.`);
  }
  if (!VOTES[vote]) throw new Error('Filtro de votos inválido.');
  if (range && (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isSafeInteger) || range[1] <= range[0])) throw new Error('A janela de horários é inválida.');
  const selected = data.rows.filter(row => row[0] === turn && inScope(row[1], territory, uf));
  const populationTotals = zero();
  const prefixTotals = zero();
  const totals = zero();
  const counts = new Map();
  let minimum = Infinity, maximum = -Infinity;
  for (const row of selected) {
    const weights = { urnas: row[3], eleitores: row[4], votos: row[VOTES[vote].index] };
    for (const metric of Object.keys(weights)) populationTotals[metric] += weights[metric];
    if (range && row[2] < range[0]) for (const metric of Object.keys(weights)) prefixTotals[metric] += weights[metric];
    if (range && (row[2] < range[0] || row[2] >= range[1])) continue;
    const start = Math.floor(row[2] / interval) * interval;
    const bin = counts.get(start) || { start, end: start + interval, ...zero() };
    for (const metric of Object.keys(weights)) {
      bin[metric] += weights[metric];
      totals[metric] += weights[metric];
    }
    counts.set(start, bin);
    minimum = Math.min(minimum, start);
    maximum = Math.max(maximum, start + interval);
  }
  if (range) {
    minimum = Math.floor(range[0] / interval) * interval;
    maximum = Math.ceil(range[1] / interval) * interval;
  }
  const bins = [];
  if (minimum !== Infinity) {
    if ((maximum - minimum) / interval > 20000) throw new Error('A amplitude dos horários é excessiva. Confira os dados ou selecione uma janela de horários.');
    for (let start = minimum; start < maximum; start += interval) {
      const bin = counts.get(start) || { start, end: start + interval, ...zero() };
      bins.push(range ? { ...bin, start: Math.max(start, range[0]), end: Math.min(start + interval, range[1]) } : bin);
    }
  }
  const runningTotals = { ...prefixTotals };
  for (const bin of bins) {
    bin.accumulated = {};
    for (const metric of Object.keys(runningTotals)) {
      runningTotals[metric] += bin[metric];
      bin.accumulated[metric] = populationTotals[metric] > 0 ? runningTotals[metric] / populationTotals[metric] : null;
    }
  }
  const coverage = Object.fromEntries(COVERAGE_COUNTS.map(key => [key, 0]));
  for (const item of data.coverage) {
    if (item.turno === turn && inScope(item.uf, territory, uf)) for (const key of COVERAGE_COUNTS) coverage[key] += item[key] || 0;
  }
  return {
    bins, totals, populationTotals, prefixTotals, coverage, interval, vote, turn,
    domain: bins.length ? range ? [...range] : [minimum, maximum] : null,
    outsideWindow: populationTotals.urnas - totals.urnas,
    plottedCoverage: coverage.esperadas ? populationTotals.urnas / coverage.esperadas : null,
  };
}

/** The integer is relative to Brasília midnight on the election date. */
export function formatMinute(minute, { compact = false } = {}) {
  const day = Math.floor(minute / 1440);
  const withinDay = ((minute % 1440) + 1440) % 1440;
  const hour = String(Math.floor(withinDay / 60)).padStart(2, '0');
  const minutes = String(withinDay % 60).padStart(2, '0');
  const suffix = day === 0 ? '' : compact ? ` (${day > 0 ? '+' : '−'}${Math.abs(day)}d)` : ` (${day > 0 ? '+' : '−'}${Math.abs(day)} dia${Math.abs(day) === 1 ? '' : 's'})`;
  return `${hour}:${minutes}${suffix}`;
}

export function minuteToDateTime(date, minute) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || !Number.isSafeInteger(minute)) throw new Error('Data eleitoral ou horário inválido.');
  parsed.setUTCMinutes(parsed.getUTCMinutes() + minute);
  return parsed.toISOString().slice(0, 16);
}
