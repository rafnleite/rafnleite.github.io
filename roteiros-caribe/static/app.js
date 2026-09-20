const results = document.querySelector('#results');
const yearInput = document.querySelector('#year');
const heroYear = document.querySelector('#hero-year');
const includeLodging = document.querySelector('#include-lodging');
let currentData = null;

const money = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const day = value => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');

function flightCard(flight) {
  return `<div class="leg"><b>${flight.origin} → ${flight.destination}</b><span>${flight.airline} · ${flight.departure || ''} → ${flight.arrival || ''} · ${flight.duration_label}${flight.stops ? ` · ${flight.stops} escala` : ''}</span></div>`;
}

function lodgingRates() {
  return Object.fromEntries([...document.querySelectorAll('.lodging-rate')].map(input => [input.dataset.destination, Number(input.value) || 0]));
}

function enrichRoute(route) {
  const rates = lodgingRates();
  const lodgingTotal = route.destinations.reduce((total, destination, index) => {
    const nights = Math.ceil((route.stays[index] || 0) / 24);
    return total + nights * (rates[destination] || 0);
  }, 0);
  return { ...route, lodgingTotal, displayTotal: route.total_price + (includeLodging.checked ? lodgingTotal : 0) };
}

function card(route, index) {
  const decorated = enrichRoute(route);
  const title = decorated.destinations.join('  +  ');
  const dates = decorated.dates.map(day).join('  /  ');
  const source = decorated.source === 'google-flights' ? 'Google Flights' : 'estimativa demo';
  const lodgingLine = includeLodging.checked ? `<small class="lodging-cost">inclui ${money(decorated.lodgingTotal)} de hospedagem</small>` : '';
  return `<article class="route"><span class="rank">#${String(index + 1).padStart(2, '0')}</span><span class="source ${decorated.source === 'demo' ? 'demo' : ''}">${source} · ${decorated.routing}</span><h3>${title}</h3><div class="dates">${dates}</div><div class="price">${money(decorated.displayTotal)} <small>total por pessoa</small>${lodgingLine}</div><div class="meta"><span>${decorated.stays.map(hours => `${hours}h no destino`).join(' · ')}</span><span>${Math.floor(decorated.total_duration / 60)}h voo</span></div><div class="legs">${decorated.legs.map(flightCard).join('')}</div><a href="${decorated.links[0]}" target="_blank" rel="noreferrer">abrir no Google Flights ↗</a></article>`;
}

function render(data) {
  currentData = data;
  heroYear.textContent = data.year;
  const lastSearch = data.last_collection ? ` · última busca ${new Date(data.last_collection.finished_at).toLocaleString('pt-BR')}` : '';
  const mode = data.has_cached_data ? `preços armazenados no SQLite · Google Flights${lastSearch}` : 'sem dados coletados · execute collect.py';
  const routes = data.routes.map(enrichRoute).sort((a, b) => a.displayTotal - b.displayTotal);
  const singles = data.singles.map(enrichRoute).sort((a, b) => a.displayTotal - b.displayTotal);
  results.innerHTML = `<div class="section-head"><h2>Roteiros de 2 destinos</h2><p>${mode}${includeLodging.checked ? ' · com hospedagem' : ' · somente voos'}</p></div><div class="grid">${routes.map(card).join('')}</div><div class="single-section"><div class="section-head"><h2>Uma ilha só, sem pressa</h2><p>mínimo de 160 horas no destino</p></div><div class="grid">${singles.map(card).join('')}</div></div>`;
}

function rerender() {
  if (currentData) render(currentData);
}

async function search() {
  results.innerHTML = '<div class="loading"><span></span> consultando combinações...</div>';
  try {
    const response = await fetch(`/api/search?year=${encodeURIComponent(yearInput.value)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível buscar os voos.');
    render(data);
  } catch (error) {
    results.innerHTML = `<div class="error">${error.message}</div>`;
  }
}

document.querySelector('#search').addEventListener('click', search);
yearInput.addEventListener('change', () => { heroYear.textContent = yearInput.value; });
includeLodging.addEventListener('change', rerender);
document.querySelectorAll('.lodging-rate').forEach(input => input.addEventListener('input', rerender));
search();