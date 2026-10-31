// BU totals are independent of the logs available for a place or time window.
// Results documents are immutable snapshots: replacing state.results naturally
// invalidates this index without rebuilding it for every slider movement.
const indexes = new WeakMap();
const fields = Object.freeze(['lula', 'flavio', 'nominais', 'brancos', 'nulos', 'total', 'bus', 'sections']);

function emptyTotals() {
  return {lula: 0, flavio: 0, nominais: 0, brancos: 0, nulos: 0, total: 0, bus: 0, sections: 0};
}

function addTotals(target, source) {
  for (const field of fields) {
    const value = source[field] ?? 0;
    if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(target[field] + value)) {
      throw new Error(`Resultado eleitoral inválido: ${field}.`);
    }
    target[field] += value;
  }
}

function validUF(value) {
  if (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value)) throw new Error('UF eleitoral inválida.');
  return value;
}

function geographicKey(value, name, maximum) {
  if (value === 'ALL') return null;
  if (typeof value !== 'string') throw new Error(`Filtro de ${name} inválido.`);
  const parts = value.split('/');
  if (parts.length !== 2 || !/^\d+$/.test(parts[1])) throw new Error(`Filtro de ${name} inválido.`);
  const uf = validUF(parts[0]), number = Number(parts[1]);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) throw new Error(`Filtro de ${name} inválido.`);
  return `${uf}/${number}`;
}

function resultIndex(results, uf) {
  const cached = indexes.get(results);
  if (cached) {
    if (cached.uf !== uf) throw new Error('O mesmo resultado eleitoral foi associado a UFs diferentes.');
    return cached;
  }
  const index = {uf, zones: new Map(), municipalities: new Map()};
  for (const [key, value] of Object.entries(results)) {
    const parts = key.split('/');
    if (parts.length !== 4 || parts[0] !== uf || !parts.slice(1).every(part => /^\d+$/.test(part))) {
      throw new Error(`Identidade do resultado eleitoral incompatível com ${uf}: ${key}.`);
    }
    const [municipality, zone, place] = parts.slice(1).map(Number);
    if (!Number.isSafeInteger(municipality) || municipality < 1 || municipality > 99999 ||
        !Number.isSafeInteger(zone) || zone < 1 || zone > 9999 ||
        !Number.isSafeInteger(place) || place < 1 || !value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Identidade ou resultado eleitoral inválido: ${key}.`);
    }
    const zoneKey = `${uf}/${zone}`, municipalityKey = `${uf}/${municipality}`;
    // A document can use padded or unpadded identifiers. Both spellings still
    // identify one physical place and must never contribute twice.
    const identity = `${municipality}/${zone}/${place}`;
    index.identities ??= new Set();
    if (index.identities.has(identity)) throw new Error(`Local eleitoral duplicado: ${key}.`);
    index.identities.add(identity);
    const total = index.zones.get(zoneKey) || emptyTotals();
    addTotals(total, value);
    index.zones.set(zoneKey, total);
    const municipalityZones = index.municipalities.get(municipalityKey) || new Map();
    const localTotal = municipalityZones.get(zoneKey) || emptyTotals();
    addTotals(localTotal, value);
    municipalityZones.set(zoneKey, localTotal);
    index.municipalities.set(municipalityKey, municipalityZones);
  }
  delete index.identities;
  indexes.set(results, index);
  return index;
}

/**
 * Complete presidential BU totals by UF/zone, restricted only by geography.
 * Missing result documents return an empty Map. Records with bus=0 retain their
 * expected section count so electionSummary can report unavailable/partial BUs.
 * Every call returns fresh totals; callers cannot mutate the cached index.
 */
export function zoneElectionResults(states, {uf = 'ALL', municipality = 'ALL', zone = 'ALL', geographyPaths = null} = {}) {
  if (geographyPaths !== null && !(geographyPaths instanceof Set)) throw new Error('Seleção geográfica inválida.');
  const allowedUFs = uf === 'ALL' ? null : new Set((Array.isArray(uf) ? uf : [uf]).map(validUF));
  const municipalityKey = geographicKey(municipality, 'município', 99999);
  const selectedZoneKey = geographicKey(zone, 'zona', 9999);
  const totals = new Map(), seenUFs = new Map();
  for (const state of states) {
    if (!state?.results) continue;
    const stateUF = validUF(state.uf);
    if (allowedUFs && !allowedUFs.has(stateUF)) continue;
    if (typeof state.results !== 'object' || Array.isArray(state.results) || state.results instanceof Map) {
      throw new Error('Documento de resultados eleitorais inválido.');
    }
    if (seenUFs.has(stateUF)) {
      if (seenUFs.get(stateUF) !== state.results) throw new Error(`Mais de um resultado eleitoral para ${stateUF}.`);
      continue;
    }
    seenUFs.set(stateUF, state.results);
    const index = resultIndex(state.results, stateUF);
    if (geographyPaths) {
      for (const [cityKey, zones] of index.municipalities) {
        if (municipalityKey && cityKey !== municipalityKey) continue;
        for (const [key, total] of zones) {
          if (selectedZoneKey && key !== selectedZoneKey) continue;
          const path = `${cityKey}/${Number(key.split('/')[1])}`;
          if (!geographyPaths.has(path)) continue;
          const combined = totals.get(key) || emptyTotals();
          addTotals(combined, total);
          totals.set(key, combined);
        }
      }
      continue;
    }
    const zones = municipalityKey ? index.municipalities.get(municipalityKey) : index.zones;
    if (!zones) continue;
    for (const [key, total] of zones) {
      if (selectedZoneKey && key !== selectedZoneKey) continue;
      totals.set(key, {...total});
    }
  }
  return totals;
}
