/* global L, GEOFilters, json_condominios, json_Ocupaesirregulares_4, json_Favelasevilas_5, json_RiscodeInundao_6, json_Riscodeescorregamento_7, json_Riscodeerosoeassoreamento_8, json_ParquesMunicipais_9, json_Supermercados_10, json_verdemar, json_Shoppings_11, json_Linhasdenibus_13, json_Estaesdenibus_14, json_Linhademetr_15, json_EstaesdeMetr_16 */
'use strict';

const map = L.map('map', { zoomControl: false, preferCanvas: true, minZoom: 10, maxZoom: 19 }).setView([-19.912, -43.946], 12);
const bhBase = L.tileLayer.wms('https://bhmap.pbh.gov.br/v2/api/idebhgeo/wms', {
  layers: 'ide_bhgeo:MAPA_BASE', format: 'image/png', transparent: false, version: '1.1.1',
  attribution: 'Prefeitura de Belo Horizonte · BHMap'
}).addTo(map);
L.control.scale({ metric: true, imperial: false, position: 'bottomright' }).addTo(map);

const groups = [
  { title: 'MORADIA', items: ['condos'] },
  { title: 'MOBILIDADE', items: ['metroLine', 'metroStations', 'busLines', 'busStations'] },
  { title: 'EQUIPAMENTOS', items: ['verdemar', 'supermarkets', 'malls', 'parks'] },
  { title: 'TERRITÓRIO', items: ['villages', 'occupations', 'income'] },
  { title: 'ÁREAS DE RISCO', items: ['flood', 'slide', 'erosion'] }
];

const definitions = {
  condos: { label: 'Condomínios', category: 'Condomínio', color: '#1b9b7b', group: 'Moradia', defaultOn: true },
  metroLine: { label: 'Linha de metrô', category: 'Linha de metrô', color: '#d88746', data: json_Linhademetr_15, defaultOn: true },
  metroStations: { label: 'Estações de metrô', category: 'Estação de metrô', color: '#ce7339', data: json_EstaesdeMetr_16, defaultOn: true },
  busLines: { label: 'Linhas de ônibus', category: 'Linha de ônibus', color: '#7c71c7', data: json_Linhasdenibus_13, defaultOn: false },
  busStations: { label: 'Estações de ônibus', category: 'Estação de ônibus', color: '#665bb6', data: json_Estaesdenibus_14, defaultOn: false },
  supermarkets: { label: 'Supermercados', category: 'Supermercado', color: '#e0a54e', data: json_Supermercados_10, defaultOn: false },
  verdemar: { label: 'Lojas Verdemar', category: 'Loja Verdemar', color: '#08763f', data: json_verdemar, defaultOn: true },
  malls: { label: 'Shoppings', category: 'Shopping', color: '#d28359', data: json_Shoppings_11, defaultOn: false },
  parks: { label: 'Parques municipais', category: 'Parque municipal', color: '#58ab75', data: json_ParquesMunicipais_9, defaultOn: true },
  villages: { label: 'Favelas e vilas', category: 'Favela ou vila', color: '#d99c59', data: json_Favelasevilas_5, defaultOn: false },
  occupations: { label: 'Ocupações irregulares', category: 'Ocupação irregular', color: '#d06e60', data: json_Ocupaesirregulares_4, defaultOn: false },
  income: { label: 'Classificação de renda', category: 'Classificação de renda', color: '#a67ab6', defaultOn: false },
  flood: { label: 'Risco de inundação', category: 'Área de risco', color: '#4296bd', data: json_RiscodeInundao_6, defaultOn: false },
  slide: { label: 'Risco de escorregamento', category: 'Área de risco', color: '#c46b5c', data: json_Riscodeescorregamento_7, defaultOn: false },
  erosion: { label: 'Risco de erosão', category: 'Área de risco', color: '#b78b57', data: json_Riscodeerosoeassoreamento_8, defaultOn: false }
};

const searchIndex = [];
let condoMarkers = [];
let condoCount = 0;
let condoFeatures = [];
let filteredCondoCount = 0;
let visibleCondoMarkerSet = null;
let availableAmenities = [];
let clusterBusy = false;
let filterPending = false;
let filterTimer = null;
let activeFilterKey = '[]';
const displayNames = {
  nome_condominio: 'Nome', endereco: 'Endereço', descricao: 'Descrição', atualizado_em: 'Dados da ficha',
  tamanho_minimo_imoveis: 'Área mínima dos imóveis (m²)', min_quartos: 'Quartos mínimos', max_quartos: 'Quartos máximos', garagem_maximo: 'Vagas máximas',
  NOME: 'Nome', NOME_LOCALIDADE: 'Localidade', NOME_UNIDADE_FPMZB: 'Nome', route_name: 'Linha', RISCO_GEOLOGICO: 'Risco geológico',
  TIPO: 'Tipo', CORREDOR_MOVE: 'Corredor MOVE', REGIONAL: 'Regional', SITUACAO: 'Situação',
  municipio: 'Município', tipo: 'Tipo', fonte: 'Fonte'
};

function nameOf(properties, fallback) {
  return properties.nome_condominio || properties.nome || properties.NOME || properties.NOME_LOCALIDADE || properties.NOME_UNIDADE_FPMZB || properties.route_name || properties.TIPOLOGIA_USO || properties.endereco || fallback;
}

function addSearch(feature, layer, definition, key) {
  const title = nameOf(feature.properties || {}, definition.category);
  const subtitle = (feature.properties || {}).endereco || definition.category;
  searchIndex.push({ title: String(title), normalized: `${title} ${subtitle}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), subtitle: String(subtitle), layer, feature, key });
}

function icon(color, label) {
  return L.divIcon({ className: '', html: `<span class="station-pin" style="background:${color}">${label}</span>`, iconSize: [20, 20], iconAnchor: [10, 10] });
}

const verdemarIcon = L.icon({ iconUrl: 'vendor/verdemar-logo.png', iconSize: [36, 36], iconAnchor: [18, 18], className: 'verdemar-marker' });

function onFeature(key, feature, layer) {
  layer.on('click', () => showDetails(feature, definitions[key]));
  addSearch(feature, layer, definitions[key], key);
}

for (const [key, definition] of Object.entries(definitions)) {
  if (definition.data) {
    definition.count = definition.data.features.length;
    definition.layer = L.geoJSON(definition.data, {
      style: () => {
        const color = definition.color;
        return { color, weight: key === 'busLines' ? 2 : key === 'metroLine' ? 4 : 1.5, opacity: .85, fillColor: color, fillOpacity: .22 };
      },
      pointToLayer: (_feature, latlng) => L.marker(latlng, { icon: key === 'verdemar' ? verdemarIcon : icon(definition.color, key === 'metroStations' ? 'M' : 'B') }),
      onEachFeature: (feature, layer) => onFeature(key, feature, layer)
    });
    if (key === 'verdemar') {
      const points = definition.layer;
      definition.layer = L.markerClusterGroup({
        maxClusterRadius: 40, showCoverageOnHover: false, spiderfyOnMaxZoom: true,
        iconCreateFunction: cluster => L.divIcon({
          className: 'verdemar-cluster',
          html: `<img src="vendor/verdemar-logo.png" alt=""><span>${cluster.getChildCount()}</span>`,
          iconSize: [40, 40], iconAnchor: [20, 20]
        })
      });
      points.eachLayer(marker => definition.layer.addLayer(marker));
    }
  }
}

definitions.income.layer = L.imageOverlay('data/Classificaoderenda_3.png', [[-20.066143810323602, -44.067601266055014], [-19.771236360054157, -43.84887871758171]], { opacity: .48 });
definitions.income.count = 'raster';
definitions.condos.layer = L.markerClusterGroup({
  chunkedLoading: true, chunkInterval: 100, chunkDelay: 20, maxClusterRadius: 42,
  disableClusteringAtZoom: 16, showCoverageOnHover: false, spiderfyOnMaxZoom: true,
  chunkProgress: (processed, total) => {
    if (processed !== total) return;
    clusterBusy = false;
    if (filterPending && filterTimer === null) scheduleCondoFilter(0);
  }
});
definitions.condos.count = '…';

function updateFilterCount() {
  document.getElementById('filter-count').textContent = condoCount ? `${filteredCondoCount.toLocaleString('pt-BR')} / ${condoCount.toLocaleString('pt-BR')}` : 'carregando';
}

function renderCondoFilters() {
  const textHost = document.getElementById('filter-text-fields');
  const numberHost = document.getElementById('filter-number-fields');
  const amenitiesHost = document.getElementById('filter-amenities');
  textHost.replaceChildren(); numberHost.replaceChildren(); amenitiesHost.replaceChildren();

  for (const field of GEOFilters.fields.filter(item => item.type === 'text')) {
    const label = document.createElement('label'); label.className = 'filter-text-field'; label.textContent = field.label;
    const input = document.createElement('input'); input.type = 'search'; input.dataset.field = field.key; input.placeholder = `Buscar por ${field.label.toLowerCase()}`;
    label.append(input); textHost.append(label);
  }

  for (const field of GEOFilters.fields.filter(item => item.type === 'number')) {
    const min = 0, max = field.sliderMax;
    const item = document.createElement('div'); item.className = 'filter-range'; item.dataset.field = field.key; item.dataset.min = min; item.dataset.max = max;
    const heading = document.createElement('div'); heading.className = 'filter-range-heading';
    const label = document.createElement('strong'); label.textContent = field.label;
    const valuesLabel = document.createElement('span');
    heading.append(label, valuesLabel);
    const track = document.createElement('div'); track.className = 'filter-range-track';
    const lower = document.createElement('input'); lower.type = 'range'; lower.min = min; lower.max = max; lower.value = min; lower.className = 'filter-range-lower'; lower.setAttribute('aria-label', `${field.label}: valor mínimo`);
    const upper = document.createElement('input'); upper.type = 'range'; upper.min = min; upper.max = max; upper.value = max; upper.className = 'filter-range-upper'; upper.setAttribute('aria-label', `${field.label}: valor máximo`);
    const update = changed => {
      if (Number(lower.value) > Number(upper.value)) changed === lower ? lower.value = upper.value : upper.value = lower.value;
      const labelValue = value => Number(value) === max ? `${max.toLocaleString('pt-BR')}+` : Number(value).toLocaleString('pt-BR');
      valuesLabel.textContent = lower.value === upper.value ? labelValue(lower.value) : `${labelValue(lower.value)} – ${labelValue(upper.value)}`;
      const start = (Number(lower.value) - min) / (max - min || 1) * 100;
      const end = (Number(upper.value) - min) / (max - min || 1) * 100;
      track.style.setProperty('--range-start', `${start}%`); track.style.setProperty('--range-end', `${end}%`);
    };
    lower.addEventListener('input', () => update(lower)); upper.addEventListener('input', () => update(upper));
    track.append(lower, upper); item.append(heading, track); numberHost.append(item); update(lower);
  }

  for (const amenity of availableAmenities) {
    const label = document.createElement('label'); label.className = 'filter-amenity';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = amenity;
    label.append(input, document.createTextNode(amenity)); amenitiesHost.append(label);
  }
}

function applyCondoFilter() {
  const error = document.getElementById('filter-error'); error.hidden = true;
  if (!condoCount) { error.textContent = 'Aguarde o carregamento dos condomínios.'; error.hidden = false; return; }
  const conditions = [];
  for (const input of document.querySelectorAll('#filter-text-fields input')) {
    if (input.value.trim()) conditions.push({ field: input.dataset.field, operator: 'contains', value: input.value.trim() });
  }
  for (const range of document.querySelectorAll('.filter-range')) {
    const lower = Number(range.querySelector('.filter-range-lower').value);
    const upper = Number(range.querySelector('.filter-range-upper').value);
    if (lower > Number(range.dataset.min) || upper < Number(range.dataset.max)) {
      conditions.push({ field: range.dataset.field, operator: 'gte', value: lower });
      if (upper < Number(range.dataset.max)) conditions.push({ field: range.dataset.field, operator: 'lte', value: upper });
    }
  }
  for (const input of document.querySelectorAll('#filter-amenities input:checked')) {
    conditions.push({ field: 'comodidades', operator: 'contains', value: input.value });
  }
  const filterKey = JSON.stringify(conditions);
  if (filterKey === activeFilterKey) { filterPending = false; return; }
  if (clusterBusy) { filterPending = true; return; }
  filterPending = false;
  const matches = GEOFilters.predicate(conditions);
  const selected = [];
  for (let i = 0; i < condoFeatures.length; i++) if (matches(condoFeatures[i].properties)) selected.push(condoMarkers[i]);
  definitions.condos.layer.clearLayers();
  activeFilterKey = filterKey;
  clusterBusy = map.hasLayer(definitions.condos.layer);
  definitions.condos.layer.addLayers(selected);
  filteredCondoCount = selected.length;
  visibleCondoMarkerSet = conditions.length ? new Set(selected) : null;
  definitions.condos.count = filteredCondoCount;
  updateFilterCount(); renderLayers(); updateStatus();
}

function clearCondoFilter() {
  renderCondoFilters();
  document.getElementById('filter-error').hidden = true;
  scheduleCondoFilter(0);
}

function scheduleCondoFilter(delay) {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => { filterTimer = null; applyCondoFilter(); }, delay);
}

document.getElementById('filter-text-fields').addEventListener('input', () => scheduleCondoFilter(450));
document.getElementById('filter-number-fields').addEventListener('input', () => scheduleCondoFilter(150));
document.getElementById('filter-number-fields').addEventListener('change', () => scheduleCondoFilter(0));
document.getElementById('filter-amenities').addEventListener('change', () => scheduleCondoFilter(0));
document.getElementById('clear-filter').addEventListener('click', clearCondoFilter);
updateFilterCount();

function updateStatus() {
  if (!condoCount) { document.getElementById('visible-count').textContent = 'Carregando condomínios…'; return; }
  const active = Object.values(definitions).filter(definition => map.hasLayer(definition.layer)).length;
  const grouping = map.getZoom() < 16 ? ' agrupados' : '';
  const count = filteredCondoCount === condoCount ? condoCount.toLocaleString('pt-BR') : `${filteredCondoCount.toLocaleString('pt-BR')} de ${condoCount.toLocaleString('pt-BR')}`;
  document.getElementById('visible-count').textContent = `${count} condomínios${grouping} · ${active} camadas ativas`;
}

function renderLayers() {
  const host = document.getElementById('layer-list');
  host.replaceChildren();
  for (const group of groups) {
    const section = document.createElement('section'); section.className = 'layer-group';
    const heading = document.createElement('h3'); heading.textContent = group.title; section.append(heading);
    for (const key of group.items) {
      const definition = definitions[key];
      const row = document.createElement('label'); row.className = 'layer-row';
      const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = map.hasLayer(definition.layer); toggle.setAttribute('aria-label', definition.label);
      toggle.addEventListener('change', () => {
        if (toggle.checked) map.addLayer(definition.layer); else map.removeLayer(definition.layer);
        renderLayers(); updateStatus();
      });
      const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.background = definition.color;
      const name = document.createElement('span'); name.className = 'name'; name.textContent = definition.label;
      const count = document.createElement('span'); count.className = 'count'; count.textContent = key === 'condos' && filteredCondoCount !== condoCount ? `${filteredCondoCount.toLocaleString('pt-BR')}/${condoCount.toLocaleString('pt-BR')}` : typeof definition.count === 'number' ? definition.count.toLocaleString('pt-BR') : '';
      row.append(toggle, swatch, name, count); section.append(row);
      if (key === 'income' && map.hasLayer(definition.layer)) {
        const legend = document.createElement('div'); legend.className = 'income-legend';
        for (const [label, file] of [['Popular', 'Popular0'], ['Médio', 'Médio1'], ['Alto', 'Alto2'], ['Luxo', 'Luxo3']]) {
          const item = document.createElement('span');
          const symbol = document.createElement('img'); symbol.src = `vendor/legend/classesderenda_2_${file}.png`; symbol.alt = '';
          item.append(symbol, document.createTextNode(label)); legend.append(item);
        }
        section.append(legend);
      }
    }
    host.append(section);
  }
}

function showDetails(feature, definition) {
  const properties = feature.properties || {};
  const title = nameOf(properties, definition.category);
  document.getElementById('details-category').textContent = definition.category.toUpperCase();
  document.getElementById('details-title').textContent = title;
  document.getElementById('details-subtitle').textContent = properties.endereco || properties.APELIDO_LOCALIDADE || '';
  const host = document.getElementById('details-fields'); host.replaceChildren();
  const skip = new Set(['fid', 'id', 'latitude', 'longitude', 'imagem', 'url', 'nome_condominio', 'nome', 'NOME', 'endereco', 'updated_at', 'comodidades']);
  const entries = Object.entries(properties).filter(([key, value]) => !skip.has(key) && value !== null && value !== '' && value !== 'false' && value !== false);
  const preferred = ['descricao', 'atualizado_em', 'tamanho_minimo_imoveis', 'min_quartos', 'max_quartos', 'garagem_maximo'];
  entries.sort((a, b) => (preferred.indexOf(a[0]) < 0 ? 100 : preferred.indexOf(a[0])) - (preferred.indexOf(b[0]) < 0 ? 100 : preferred.indexOf(b[0])));
  if (properties.comodidades?.length) entries.push(['Comodidades', properties.comodidades.join(' · ')]);
  for (const [key, value] of entries.slice(0, 25)) {
    const row = document.createElement('div'); row.className = 'detail-field';
    const label = document.createElement('span'); label.textContent = displayNames[key] || key.replaceAll('_', ' ');
    const content = document.createElement('strong'); content.textContent = value === 'true' || value === true ? 'Sim' : String(value);
    row.append(label, content); host.append(row);
  }
  const link = document.getElementById('details-link');
  const isVerdemar = definition === definitions.verdemar;
  const url = isVerdemar ? 'https://www.loja.verdemaratevoce.com.br/institucional/pagina/nossas-lojas-1' : properties.url;
  link.hidden = !isVerdemar && (!url || !/^https:\/\/www\.quintoandar\.com\.br\/condominio\//.test(url));
  if (!link.hidden) { link.href = url; link.textContent = isVerdemar ? 'Ver lojas no site do Verdemar ↗' : 'Ver no QuintoAndar ↗'; }
  document.getElementById('details').hidden = false;
}

function focusResult(result) {
  const definition = definitions[result.key];
  if (!map.hasLayer(definition.layer)) { map.addLayer(definition.layer); renderLayers(); updateStatus(); }
  const layer = result.layer;
  if (result.key === 'condos' || result.key === 'verdemar') {
    definition.layer.zoomToShowLayer(layer, () => showDetails(result.feature, definition));
  } else if (layer.getBounds && layer.getBounds().isValid()) {
    map.fitBounds(layer.getBounds(), { maxZoom: 16, padding: [50, 50] }); showDetails(result.feature, definition);
  } else if (layer.getLatLng) {
    map.setView(layer.getLatLng(), 16); showDetails(result.feature, definition);
  }
  document.getElementById('search-results').hidden = true;
  document.getElementById('sidebar').classList.remove('open');
}

let searchTimer;
document.getElementById('search').addEventListener('input', event => {
  clearTimeout(searchTimer);
  const query = event.target.value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const host = document.getElementById('search-results');
  if (query.length < 2) { host.hidden = true; host.replaceChildren(); return; }
  searchTimer = setTimeout(() => {
    const matches = searchIndex.filter(item => item.normalized.includes(query) && (item.key !== 'condos' || !visibleCondoMarkerSet || visibleCondoMarkerSet.has(item.layer))).slice(0, 8);
    host.replaceChildren();
    if (!matches.length) { const empty = document.createElement('div'); empty.textContent = 'Nenhum resultado no mapa.'; empty.style.padding = '12px'; host.append(empty); }
    for (const result of matches) {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = result.title;
      const subtitle = document.createElement('small'); subtitle.textContent = result.subtitle; button.append(subtitle);
      button.addEventListener('click', () => focusResult(result)); host.append(button);
    }
    host.hidden = false;
  }, 140);
});

document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.getElementById('search').focus(); } if (event.key === 'Escape') { document.getElementById('search-results').hidden = true; document.getElementById('details').hidden = true; document.getElementById('sidebar').classList.remove('open'); } });
document.getElementById('home-map').addEventListener('click', () => map.setView([-19.912, -43.946], 12));
document.getElementById('zoom-in').addEventListener('click', () => map.zoomIn());
document.getElementById('zoom-out').addEventListener('click', () => map.zoomOut());
document.getElementById('details-close').addEventListener('click', () => { document.getElementById('details').hidden = true; });
document.getElementById('mobile-layers').addEventListener('click', () => document.getElementById('sidebar').classList.add('open'));
document.getElementById('sidebar-close').addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));
document.getElementById('reset-layers').addEventListener('click', () => { for (const definition of Object.values(definitions)) { if (definition.defaultOn) map.addLayer(definition.layer); else map.removeLayer(definition.layer); } renderLayers(); updateStatus(); });

for (const definition of Object.values(definitions)) if (definition.defaultOn) map.addLayer(definition.layer);
map.on('zoomend', updateStatus);
renderLayers(); updateStatus();

try {
  const data = json_condominios;
  if (!Array.isArray(data.features)) throw new Error('GeoJSON inválido');
  condoFeatures = data.features;
  condoMarkers = condoFeatures.map(feature => {
    const [lng, lat] = feature.geometry.coordinates;
    const marker = L.marker([lat, lng], { icon: L.divIcon({ className: 'condo-point', iconSize: [8, 8], iconAnchor: [4, 4] }) });
    marker.on('click', () => showDetails(feature, definitions.condos));
    addSearch(feature, marker, definitions.condos, 'condos');
    return marker;
  });
  clusterBusy = map.hasLayer(definitions.condos.layer);
  definitions.condos.layer.addLayers(condoMarkers);
  condoCount = condoMarkers.length;
  filteredCondoCount = condoCount;
  availableAmenities = [...new Set(condoFeatures.flatMap(feature => feature.properties.comodidades || []))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  definitions.condos.count = condoCount;
  renderCondoFilters();
  updateFilterCount();
  renderLayers(); updateStatus();
} catch (error) {
  document.getElementById('visible-count').textContent = `Erro ao carregar condomínios: ${error.message}`;
  console.error(error);
}
