import {aggregate, sensitivityEnvelope} from './fluxos-aggregate.mjs?v=trocas5';
import {readUrnaZone} from './fluxos-urnas.mjs?v=trocas5';
const base = new URL('./dados/fluxos/', import.meta.url);
let catalog;
const cache = new Map();
const urnaZones = new Map();
let urnaSource;

async function manifest() {
  if (!catalog) catalog = fetch(new URL('manifest.json?v=trocas5', base)).then(async response => {
    if (!response.ok) throw new Error('Não foi possível carregar o catálogo de fluxos.');
    const value = await response.json();
    if (value.versao !== 3 || !Array.isArray(value.ufs)) throw new Error('Catálogo de fluxos incompatível.');
    return value;
  }).catch(error => {catalog = null; throw error;});
  return catalog;
}

async function loadState(entry) {
  if (cache.has(entry.uf)) return cache.get(entry.uf);
  const pending = (async () => {
    const url = new URL(entry.arquivo, base); url.searchParams.set('v', entry.sha256);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Não foi possível carregar ${entry.uf}. Tente novamente.`);
    let bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes[0] === 31 && bytes[1] === 139) {
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      if (Array.from(hash, v => v.toString(16).padStart(2, '0')).join('') !== entry.sha256) throw new Error('O arquivo não corresponde à versão do modelo. Recarregue a página.');
      bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data.uf !== entry.uf || !Array.isArray(data.zonas)) throw new Error('Resultados territoriais inválidos.');
    return data.zonas;
  })();
  cache.set(entry.uf, pending);
  try {return await pending;} catch (error) {cache.delete(entry.uf); throw error;}
}

function loadUrnaSource(entry) {
  if (urnaSource?.uf === entry.uf) return urnaSource.pending;
  const pending = (async () => {
    const url = new URL(entry.arquivoUrnas, base); url.searchParams.set('v', entry.sha256Urnas);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Não foi possível carregar as urnas de ${entry.uf}. Tente novamente.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes[0] === 31 && bytes[1] === 139) {
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      if (Array.from(hash, v => v.toString(16).padStart(2, '0')).join('') !== entry.sha256Urnas) {
        throw new Error('O arquivo de urnas não corresponde à versão do modelo. Recarregue a página.');
      }
    }
    return bytes;
  })();
  urnaSource = {uf: entry.uf, pending};
  pending.catch(() => {if (urnaSource?.pending === pending) urnaSource = null;});
  return pending;
}

async function loadUrnas(m, scope, includeExterior) {
  const entry = m.ufs.find(entry => entry.uf === scope.uf && (includeExterior || entry.uf !== 'ZZ'));
  if (!entry || !entry.arquivoUrnas || scope.municipio === 'ALL' || scope.zona === 'ALL') {
    throw new Error('Selecione estado, município e zona para consultar uma urna.');
  }
  const key = `${scope.uf}/${scope.municipio}/${scope.zona}`;
  if (urnaZones.has(key)) return urnaZones.get(key);
  const pending = loadUrnaSource(entry).then(bytes => readUrnaZone(bytes, scope, m.origens.length, m.destinos.length, m.participation?.rate));
  urnaZones.set(key, pending);
  // Keep only one compressed UF and a few decoded zones in the worker.
  if (urnaZones.size > 8) urnaZones.delete(urnaZones.keys().next().value);
  try {return await pending;} catch (error) {urnaZones.delete(key); throw error;}
}

async function listUrnas({requestId, scope, includeExterior}) {
  const m = await manifest();
  const sections = await loadUrnas(m, scope, includeExterior);
  self.postMessage({type: 'urnas', requestId, sections: sections.map(({secao}) => secao)});
}

async function analyze({requestId, scope, includeExterior}) {
  const m = await manifest();
  const states = m.ufs.filter(e => (scope.uf === 'ALL' || e.uf === scope.uf) && (includeExterior || e.uf !== 'ZZ'));
  const singleUrna = scope.secao != null && scope.secao !== 'ALL';
  const wholeStates = !singleUrna && scope.municipio === 'ALL' && scope.zona === 'ALL';
  let items = states;
  if (singleUrna) {
    const sections = await loadUrnas(m, scope, includeExterior);
    items = sections.filter(section => section.secao === Number(scope.secao));
  } else if (!wholeStates) {
    self.postMessage({type: 'progress', requestId, message: 'Carregando as matrizes deste território…'});
    const parts = await Promise.all(states.map(loadState));
    items = parts.flat().filter(z => (scope.municipio === 'ALL' || z.municipio === Number(scope.municipio))
      && (scope.zona === 'ALL' || z.zona === Number(scope.zona)));
  }
  const result = aggregate(items, m.origens.length, m.destinos.length);
  if (wholeStates) {
    const scenarios = [];
    for (const scenario of m.sensibilidade || []) {
      if (!scenario.states || !states.every(s => scenario.states[s.uf])) continue;
      const sum = result.flows.map(row => row.map(() => 0));
      for (const state of states) {
        const matrix = scenario.states[state.uf].flows || scenario.states[state.uf];
        matrix.forEach((row, i) => row.forEach((v, j) => {sum[i][j] += v;}));
      }
      scenarios.push(sum);
    }
    result.scenarioFlows = scenarios;
    result.sensitivity = sensitivityEnvelope(result.flows, scenarios);
  }
  self.postMessage({type: 'result', requestId, result});
}
self.onmessage = event => {
  if (event.data.type === 'listUrnas') {
    listUrnas(event.data).catch(error => self.postMessage({type: 'urnasError', requestId: event.data.requestId,
      message: error.message || 'Não foi possível carregar a lista de urnas.'}));
    return;
  }
  if (event.data.type !== 'analyze') return;
  analyze(event.data).catch(error => self.postMessage({type: 'error', requestId: event.data.requestId,
    message: error.message || 'Não foi possível carregar os fluxos deste recorte.'}));
};
