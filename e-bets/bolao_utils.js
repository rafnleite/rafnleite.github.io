// ── Constantes globais ────────────────────────────────────────────────────────
const API_BASE = 'https://oracleapex.com/ords/ebets/bolao';
const WEEKDAY  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MONTH_BR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

// ── Apex API ──────────────────────────────────────────────────────────────────
async function fetchAll(path) {
  var items = [], url = API_BASE + path + '?limit=500';
  while (url) {
    var r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var d = await r.json();
    items = items.concat(d.items || []);
    var nx = (d.links || []).find(function(l) { return l.rel === 'next'; });
    url = nx ? nx.href : null;
  }
  return items;
}

// ── ESPN Live Score helpers ───────────────────────────────────────────────────
function espnNorm(name) {
  return (name || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '').trim();
}

// Tradução nomes em português → inglês (padrão ESPN)
var PT_TO_ESPN = {
  'eua': 'united states', 'estados unidos': 'united states',
  'paraguai': 'paraguay', 'alemanha': 'germany', 'franca': 'france',
  'espanha': 'spain', 'belgica': 'belgium', 'suica': 'switzerland',
  'suecia': 'sweden', 'dinamarca': 'denmark', 'noruega': 'norway',
  'polonia': 'poland', 'hungria': 'hungary', 'turquia': 'turkey',
  'grecia': 'greece', 'servia': 'serbia', 'croacia': 'croatia',
  'eslovaquia': 'slovakia', 'eslovenia': 'slovenia',
  'romenia': 'romania', 'ucrania': 'ukraine',
  'bosnia e herzegovina': 'bosnia and herzegovina',
  'republica tcheca': 'czech republic', 'tchecia': 'czech republic',
  'coreia do sul': 'south korea', 'coreia do norte': 'north korea',
  'japao': 'japan', 'nova zelandia': 'new zealand',
  'africa do sul': 'south africa', 'arabia saudita': 'saudi arabia',
  'emirados arabes unidos': 'united arab emirates',
  'paises baixos': 'netherlands', 'holanda': 'netherlands',
  'trinidad e tobago': 'trinidad and tobago',
  'costa do marfim': 'ivory coast', 'republica dominicana': 'dominican republic'
};

function espnNormTeam(name) { var n = espnNorm(name); return PT_TO_ESPN[n] || n; }

function espnTeamsMatch(t1, t2) {
  if (t1 === t2) return true;
  if (t1.length > 3 && (t1.includes(t2) || t2.includes(t1))) return true;
  var w1 = t1.split(' ')[0], w2 = t2.split(' ')[0];
  return w1.length > 3 && w1 === w2;
}

async function fetchESPNScores() {
  try {
    var r = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard');
    if (!r.ok) return {};
    var data = await r.json();
    var map = {};
    (data.events || []).forEach(function(ev) {
      var comp = (ev.competitions || [])[0];
      if (!comp) return;
      var home = null, away = null;
      (comp.competitors || []).forEach(function(c) {
        if (c.homeAway === 'home') home = c; else away = c;
      });
      if (!home || !away) return;
      var st = (ev.status || {}).type || {};
      var isLive = st.state === 'in';
      var isFinal = st.completed === true;
      if (!isLive && !isFinal) return;
      map[espnNorm(home.team.name) + '__' + espnNorm(away.team.name)] = {
        scoreA: parseInt(home.score) || 0,
        scoreB: parseInt(away.score) || 0,
        isLive: isLive, isFinal: isFinal, clock: st.shortDetail || ''
      };
    });
    return map;
  } catch(e) { return {}; }
}

function findESPNMatch(espnMap, nameA, nameB) {
  var nA = espnNormTeam(nameA), nB = espnNormTeam(nameB);
  for (var key in espnMap) {
    var p = key.split('__');
    if (espnTeamsMatch(nA, p[0]) && espnTeamsMatch(nB, p[1])) return espnMap[key];
  }
  return null;
}

// Aplica placares ao vivo/recentes da ESPN sobre a lista de jogos (modifica in-place)
async function applyESPNOverrides(list) {
  var espnMap = await fetchESPNScores();
  list.forEach(function(j) {
    var espn = findESPNMatch(espnMap, j.time_a.nome, j.time_b.nome);
    if (!espn) return;
    if (espn.isLive) {
      j.gols_a = espn.scoreA; j.gols_b = espn.scoreB;
      j.isLive = true; j.liveClock = espn.clock;
    } else if (espn.isFinal && (j.gols_a === null || j.gols_b === null)) {
      j.gols_a = espn.scoreA; j.gols_b = espn.scoreB;
    }
  });
}
