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
  // Américas
  'brasil': 'brazil',
  'eua': 'united states', 'estados unidos': 'united states',
  'paraguai': 'paraguay', 'uruguai': 'uruguay', 'colombia': 'colombia',
  'peru': 'peru', 'chile': 'chile', 'bolivia': 'bolivia',
  'venezuela': 'venezuela', 'mexico': 'mexico', 'canada': 'canada',
  'costa rica': 'costa rica', 'equador': 'ecuador',
  'trinidad e tobago': 'trinidad and tobago',
  'republica dominicana': 'dominican republic',
  'jamaica': 'jamaica', 'honduras': 'honduras', 'panama': 'panama',
  'cuba': 'cuba', 'guatemala': 'guatemala', 'nicaragua': 'nicaragua',
  // Europa
  'alemanha': 'germany', 'franca': 'france', 'espanha': 'spain',
  'belgica': 'belgium', 'suica': 'switzerland', 'suecia': 'sweden',
  'dinamarca': 'denmark', 'noruega': 'norway', 'polonia': 'poland',
  'hungria': 'hungary', 'turquia': 'turkey', 'grecia': 'greece',
  'servia': 'serbia', 'croacia': 'croatia', 'eslovaquia': 'slovakia',
  'eslovenia': 'slovenia', 'romenia': 'romania', 'ucrania': 'ukraine',
  'paises baixos': 'netherlands', 'holanda': 'netherlands',
  'bosnia e herzegovina': 'bosnia and herzegovina',
  'republica tcheca': 'czech republic', 'tchecia': 'czech republic',
  'austria': 'austria', 'finlandia': 'finland', 'islandia': 'iceland',
  'escocia': 'scotland', 'gales': 'wales', 'inglaterra': 'england',
  'irlanda': 'republic of ireland', 'irlanda do norte': 'northern ireland',
  'albania': 'albania', 'armenia': 'armenia', 'azerbaijao': 'azerbaijan',
  'bielorrussia': 'belarus', 'bulgaria': 'bulgaria',
  'chipre': 'cyprus', 'estonia': 'estonia', 'latvia': 'latvia',
  'lituania': 'lithuania', 'luxemburgo': 'luxembourg',
  'macedoniado norte': 'north macedonia', 'macedonia do norte': 'north macedonia',
  'moldova': 'moldova', 'montenegro': 'montenegro',
  'portugal': 'portugal', 'georgia': 'georgia',
  // África
  'marrocos': 'morocco', 'senegal': 'senegal', 'nigeria': 'nigeria',
  'camaroes': 'cameroon', 'gana': 'ghana', 'egito': 'egypt',
  'argelia': 'algeria', 'tunisia': 'tunisia', 'africa do sul': 'south africa',
  'costa do marfim': 'ivory coast', 'mali': 'mali',
  'burkina faso': 'burkina faso', 'guine': 'guinea',
  'guine equatorial': 'equatorial guinea', 'guine bissau': 'guinea-bissau',
  'angola': 'angola', 'zimbabue': 'zimbabwe', 'mozambique': 'mozambique',
  'tanzania': 'tanzania', 'uganda': 'uganda', 'zambia': 'zambia',
  'serra leoa': 'sierra leone', 'liberia': 'liberia',
  'cabo verde': 'cape verde', 'mauritania': 'mauritania',
  'tanzania': 'tanzania', 'ruanda': 'rwanda', 'benin': 'benin',
  'togo': 'togo', 'kenya': 'kenya', 'etiopia': 'ethiopia',
  'libia': 'libya', 'sudao': 'sudan', 'somalia': 'somalia',
  'gabao': 'gabon', 'congo': 'dr congo', 'republica do congo': 'republic of the congo',
  // Ásia
  'coreia do sul': 'south korea', 'coreia do norte': 'north korea',
  'japao': 'japan', 'nova zelandia': 'new zealand',
  'australia': 'australia', 'georgia': 'georgia',
  'arabia saudita': 'saudi arabia',
  'emirados arabes unidos': 'united arab emirates',
  'catar': 'qatar', 'ira': 'iran', 'irao': 'iran',
  'iraque': 'iraq', 'jordania': 'jordan', 'siria': 'syria',
  'libano': 'lebanon', 'bahrein': 'bahrain', 'oma': 'oman',
  'kuwait': 'kuwait', 'iemen': 'yemen', 'palestina': 'palestine',
  'china': 'china', 'india': 'india', 'indonesia': 'indonesia',
  'tailandia': 'thailand', 'filipinas': 'philippines',
  'vietna': 'vietnam', 'vietname': 'vietnam',
  'malasia': 'malaysia', 'cingapura': 'singapore',
  'mianmar': 'myanmar', 'camboja': 'cambodia', 'laos': 'laos',
  'bangladesh': 'bangladesh', 'paquistao': 'pakistan',
  'afeganistao': 'afghanistan', 'casaquistao': 'kazakhstan',
  'uzbequistao': 'uzbekistan', 'quirguistao': 'kyrgyzstan',
  'tadjiquistao': 'tajikistan', 'turcomenistao': 'turkmenistan',
  'mongolia': 'mongolia', 'nepal': 'nepal', 'butao': 'bhutan',
  // Oceania
  'papua nova guine': 'papua new guinea', 'taiti': 'tahiti',
  'fiji': 'fiji', 'vanuatu': 'vanuatu', 'samoa': 'samoa',
  'ilhas salomao': 'solomon islands', 'nova caledonia': 'new caledonia'
};

// ESPN uses official FIFA names that differ from English (e.g. Türkiye ≠ Turkey)
var ESPN_ALIASES = {
  'turkiye': 'turkey',
  'usa': 'united states',
  'ir iran': 'iran',
  'korea republic': 'south korea',
  'republic of korea': 'south korea',
  'dpr korea': 'north korea',
  'chinese taipei': 'taiwan',
  'cape verde islands': 'cape verde',
  'dr congo': 'democratic republic of congo',
  'trinidad & tobago': 'trinidad and tobago',
  'curacao': 'curacao'
};

function espnNormTeam(name) { var n = espnNorm(name); return PT_TO_ESPN[n] || n; }
function normalizeESPNName(name) { var n = espnNorm(name); return ESPN_ALIASES[n] || n; }

function espnTeamsMatch(t1, t2) {
  if (t1 === t2) return true;
  if (t1.length > 3 && (t1.includes(t2) || t2.includes(t1))) return true;
  var w1 = t1.split(' ')[0], w2 = t2.split(' ')[0];
  return w1.length > 3 && w1 === w2;
}

async function fetchESPNScores() {
  try {
    var now = new Date();
    function utcDateStr(d) {
      var y = d.getUTCFullYear();
      var m = String(d.getUTCMonth() + 1).padStart(2, '0');
      var day = String(d.getUTCDate()).padStart(2, '0');
      return y + m + day;
    }
    var yesterday = new Date(now.getTime() - 86400000);
    var tomorrow  = new Date(now.getTime() + 86400000);
    var ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
    var urls = [
      ESPN_BASE,
      ESPN_BASE + '?dates=' + utcDateStr(yesterday),
      ESPN_BASE + '?dates=' + utcDateStr(now),
      ESPN_BASE + '?dates=' + utcDateStr(tomorrow)
    ];

    var map = {};
    function storeEntry(key, entry) {
      if (!key || key === '__') return;
      // Don't overwrite a live entry with a finished one from another fetch
      if (map[key] && map[key].isLive && !entry.isLive) return;
      map[key] = entry;
    }

    for (var i = 0; i < urls.length; i++) {
      var r = await fetch(urls[i]);
      if (!r.ok) continue;
      var data = await r.json();
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
        var entry = {
          scoreA: parseInt(home.score) || 0,
          scoreB: parseInt(away.score) || 0,
          isLive: isLive, isFinal: isFinal, clock: st.shortDetail || ''
        };
        // Store under multiple name variants for robust matching
        // Use normalizeESPNName so ESPN variants (Türkiye→turkey) map to canonical English
        var ht = home.team, at = away.team;
        var nameCombos = [
          [ht.name, at.name],
          [ht.displayName, at.displayName],
          [ht.shortDisplayName, at.shortDisplayName],
          [ht.location, at.location]
        ];
        nameCombos.forEach(function(pair) {
          if (pair[0] && pair[1]) {
            storeEntry(normalizeESPNName(pair[0]) + '__' + normalizeESPNName(pair[1]), entry);
          }
        });
      });
    }
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
// Preferência ESPN quando: jogo ao vivo, ou placar ESPN > placar APEX (total de gols)
async function applyESPNOverrides(list) {
  var espnMap = await fetchESPNScores();
  list.forEach(function(j) {
    var espn = findESPNMatch(espnMap, j.time_a.nome, j.time_b.nome);
    if (!espn) return;
    if (espn.isLive) {
      j.gols_a = espn.scoreA; j.gols_b = espn.scoreB;
      j.isLive = true; j.liveClock = espn.clock;
    } else if (espn.isFinal) {
      var apexTotal = (j.gols_a !== null && j.gols_b !== null) ? (j.gols_a + j.gols_b) : -1;
      var espnTotal = espn.scoreA + espn.scoreB;
      if (apexTotal === -1 || espnTotal > apexTotal) {
        j.gols_a = espn.scoreA; j.gols_b = espn.scoreB;
      }
    }
  });
}
