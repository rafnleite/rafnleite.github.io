// ── Constantes globais ────────────────────────────────────────────────────────
const API_BASE = 'https://oracleapex.com/ords/ebets/bolao';
const WEEKDAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_BR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ── Apex API ──────────────────────────────────────────────────────────────────
async function fetchAll(path) {
  var items = [], url = API_BASE + path + '?limit=500';
  while (url) {
    var r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var d = await r.json();
    items = items.concat(d.items || []);
    var nx = (d.links || []).find(function (l) { return l.rel === 'next'; });
    url = nx ? nx.href : null;
  }
  return items;
}

var bolaoDataPromise = null;

async function loadBolaoBaseData() {
  if (!bolaoDataPromise) {
    bolaoDataPromise = Promise.all([
      fetchAll('/jogo'), fetchAll('/aposta'), fetchAll('/grupo'),
      fetchAll('/time'), fetchAll('/chutador')
    ]).then(function (res) {
      return {
        jogos: res[0],
        apostas: res[1],
        grupos: res[2],
        times: res[3],
        chutadores: res[4]
      };
    }).catch(function (err) {
      bolaoDataPromise = null;
      throw err;
    });
  }
  return bolaoDataPromise;
}

async function buildJogos() {
  var data = await loadBolaoBaseData();
  var jogos = data.jogos, apostas = data.apostas, grupos = data.grupos,
      times = data.times, chutadores = data.chutadores;
  var gMap = {}, tMap = {}, cMap = {}, aPorJ = {};
  grupos.forEach(function (g) { gMap[g.id_grupo] = g; });
  times.forEach(function (t) { tMap[t.id_time] = t; });
  chutadores.forEach(function (c) { cMap[c.id_chutador] = c; });
  apostas.forEach(function (a) {
    if (!aPorJ[a.id_jogo]) aPorJ[a.id_jogo] = [];
    aPorJ[a.id_jogo].push(a);
  });
  var list = jogos.map(function (j) {
    var gr = gMap[j.id_grupo] || {}, tA = tMap[j.id_time_a] || {}, tB = tMap[j.id_time_b] || {};
    var aA = [], aE = [], aB = [];
    (aPorJ[j.id_jogo] || []).forEach(function (a) {
      var ch = cMap[a.id_chutador] || {};
      var e = { nome: ch.nome || '?', placar: a.gols_a + 'x' + a.gols_b };
      if (a.gols_a > a.gols_b) aA.push(e);
      else if (a.gols_a < a.gols_b) aB.push(e);
      else aE.push(e);
    });
    return {
      id: j.id_jogo,
      data: j.data ? j.data.slice(0, 16).replace('T', ' ') : null,
      estadio: j.estadio,
      cidade: j.cidade,
      grupo: gr.sigla || '',
      sede: gr.sede || '',
      time_a: { nome: tA.nome || '', logo: tA.logo || '', id: j.id_time_a },
      time_b: { nome: tB.nome || '', logo: tB.logo || '', id: j.id_time_b },
      gols_a: j.gols_a,
      gols_b: j.gols_b,
      status: j.status_jogo,
      apostadores_a: aA,
      apostadores_empate: aE,
      apostadores_b: aB
    };
  });
  list.sort(function (a, b) {
    return !a.data ? 1 : !b.data ? -1 : a.data < b.data ? -1 : a.data > b.data ? 1 : 0;
  });
  await applyESPNOverrides(list);
  return list;
}

// ── ESPN Live Score helpers ───────────────────────────────────────────────────
function espnNorm(name) {
  return (name || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '').trim();
}

function espnTeamKey(name) {
  var n = espnNorm(name);
  n = n.replace(/^(selecao\s+(de|da|do)?\s*)/, '');
  n = n.replace(/\s+selecao$/, '');
  return n.trim();
}

// Tradução nomes em português → inglês (padrão ESPN)
var PT_TO_ESPN = {
  // Américas
  'bolivia': 'bolivia',
  'brasil': 'brazil',
  'canada': 'canada',
  'chile': 'chile',
  'colombia': 'colombia',
  'costa rica': 'costa rica',
  'cuba': 'cuba',
  'equador': 'ecuador',
  'eua': 'united states',
  'estados unidos': 'united states',
  'guatemala': 'guatemala',
  'honduras': 'honduras',
  'jamaica': 'jamaica',
  'mexico': 'mexico',
  'nicaragua': 'nicaragua',
  'panama': 'panama',
  'paraguai': 'paraguay',
  'peru': 'peru',
  'republica dominicana': 'dominican republic',
  'trinidad e tobago': 'trinidad and tobago',
  'uruguai': 'uruguay',
  'venezuela': 'venezuela',

  // Europa
  'albania': 'albania',
  'alemanha': 'germany',
  'armenia': 'armenia',
  'austria': 'austria',
  'azerbaijao': 'azerbaijan',
  'belgica': 'belgium',
  'bielorrussia': 'belarus',
  'bosnia e herzegovina': 'bosnia and herzegovina',
  'bulgaria': 'bulgaria',
  'chipre': 'cyprus',
  'croacia': 'croatia',
  'dinamarca': 'denmark',
  'escocia': 'scotland',
  'eslovaquia': 'slovakia',
  'eslovenia': 'slovenia',
  'espanha': 'spain',
  'estonia': 'estonia',
  'finlandia': 'finland',
  'franca': 'france',
  'gales': 'wales',
  'georgia': 'georgia',
  'grecia': 'greece',
  'holanda': 'netherlands',
  'hungria': 'hungary',
  'inglaterra': 'england',
  'irlanda': 'republic of ireland',
  'irlanda do norte': 'northern ireland',
  'islandia': 'iceland',
  'latvia': 'latvia',
  'lituania': 'lithuania',
  'luxemburgo': 'luxembourg',
  'macedonia do norte': 'north macedonia',
  'macedoniado norte': 'north macedonia',
  'moldova': 'moldova',
  'montenegro': 'montenegro',
  'noruega': 'norway',
  'paises baixos': 'netherlands',
  'polonia': 'poland',
  'portugal': 'portugal',
  'republica tcheca': 'czech republic',
  'romenia': 'romania',
  'servia': 'serbia',
  'suica': 'switzerland',
  'suecia': 'sweden',
  'tchecia': 'czech republic',
  'turquia': 'turkey',
  'ucrania': 'ukraine',

  // África
  'africa do sul': 'south africa',
  'angola': 'angola',
  'argelia': 'algeria',
  'benin': 'benin',
  'burkina faso': 'burkina faso',
  'cabo verde': 'cape verde',
  'camaroes': 'cameroon',
  'rd congo': 'congo dr',
  'costa do marfim': 'ivory coast',
  'egito': 'egypt',
  'etiopia': 'ethiopia',
  'gabao': 'gabon',
  'gana': 'ghana',
  'guine': 'guinea',
  'guine bissau': 'guinea-bissau',
  'guine equatorial': 'equatorial guinea',
  'kenya': 'kenya',
  'liberia': 'liberia',
  'libia': 'libya',
  'mali': 'mali',
  'marrocos': 'morocco',
  'mauritania': 'mauritania',
  'mozambique': 'mozambique',
  'nigeria': 'nigeria',
  'republica do congo': 'republic of the congo',
  'ruanda': 'rwanda',
  'senegal': 'senegal',
  'serra leoa': 'sierra leone',
  'somalia': 'somalia',
  'sudao': 'sudan',
  'tanzania': 'tanzania',
  'togo': 'togo',
  'tunisia': 'tunisia',
  'uganda': 'uganda',
  'zambia': 'zambia',
  'zimbabue': 'zimbabwe',

  // Ásia
  'afeganistao': 'afghanistan',
  'arabia saudita': 'saudi arabia',
  'australia': 'australia',
  'bahrein': 'bahrain',
  'bangladesh': 'bangladesh',
  'butao': 'bhutan',
  'camboja': 'cambodia',
  'casaquistao': 'kazakhstan',
  'catar': 'qatar',
  'china': 'china',
  'cingapura': 'singapore',
  'coreia do norte': 'north korea',
  'coreia do sul': 'south korea',
  'emirados arabes unidos': 'united arab emirates',
  'filipinas': 'philippines',
  'georgia': 'georgia',
  'iemen': 'yemen',
  'india': 'india',
  'indonesia': 'indonesia',
  'ira': 'iran',
  'irao': 'iran',
  'iraque': 'iraq',
  'japao': 'japan',
  'jordania': 'jordan',
  'kuwait': 'kuwait',
  'laos': 'laos',
  'libano': 'lebanon',
  'malasia': 'malaysia',
  'mianmar': 'myanmar',
  'mongolia': 'mongolia',
  'nepal': 'nepal',
  'nova zelandia': 'new zealand',
  'oma': 'oman',
  'paquistao': 'pakistan',
  'palestina': 'palestine',
  'quirguistao': 'kyrgyzstan',
  'siria': 'syria',
  'tailandia': 'thailand',
  'tadjiquistao': 'tajikistan',
  'turcomenistao': 'turkmenistan',
  'uzbequistao': 'uzbekistan',
  'vietna': 'vietnam',
  'vietname': 'vietnam',

  // Oceania
  'fiji': 'fiji',
  'ilhas salomao': 'solomon islands',
  'nova caledonia': 'new caledonia',
  'papua nova guine': 'papua new guinea',
  'samoa': 'samoa',
  'taiti': 'tahiti',
  'vanuatu': 'vanuatu'
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

function espnNormTeam(name) { var n = espnTeamKey(name); return PT_TO_ESPN[n] || n; }
function normalizeESPNName(name) { var n = espnTeamKey(name); return ESPN_ALIASES[n] || n; }

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
    var tomorrow = new Date(now.getTime() + 86400000);
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
      (data.events || []).forEach(function (ev) {
        var comp = (ev.competitions || [])[0];
        if (!comp) return;
        var home = null, away = null;
        (comp.competitors || []).forEach(function (c) {
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
        nameCombos.forEach(function (pair) {
          if (pair[0] && pair[1]) {
            storeEntry(normalizeESPNName(pair[0]) + '__' + normalizeESPNName(pair[1]), entry);
          }
        });
      });
    }
    return map;
  } catch (e) { return {}; }
}

function findESPNMatch(espnMap, nameA, nameB) {
  var nA = espnNormTeam(nameA), nB = espnNormTeam(nameB);
  for (var key in espnMap) {
    var p = key.split('__');
    if ((espnTeamsMatch(nA, p[0]) && espnTeamsMatch(nB, p[1])) ||
        (espnTeamsMatch(nA, p[1]) && espnTeamsMatch(nB, p[0]))) return espnMap[key];
  }
  return null;
}

// Aplica placares ao vivo/recentes da ESPN sobre a lista de jogos (modifica in-place)
// Preferência ESPN quando: jogo ao vivo, ou placar ESPN > placar APEX (total de gols)
async function applyESPNOverrides(list) {
  var espnMap = await fetchESPNScores();

  list.forEach(function (j) {
    var espn = findESPNMatch(espnMap, j.time_a.nome, j.time_b.nome);

    // Sem correspondência na ESPN
    if (!espn) return;

    // Jogo finalizado no APEX → mantém APEX
    if (j.status === 'F') {
      return;
    }

    // Jogo em andamento no APEX → usa ESPN
    if (j.status === 'A' && (espn.isLive || espn.isFinal)) {
      j.gols_a = espn.scoreA;
      j.gols_b = espn.scoreB;
      j.isLive = espn.isLive;
      j.liveClock = espn.clock || '';
      return;
    }
  });
}