// ── Constantes globais ────────────────────────────────────────────────────────
const API_BASE = 'https://oracleapex.com/ords/ebets/bolao';
const WEEKDAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_BR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const TEAM_ABBR = {
  "França": "FRA",
  "Noruega": "NOR",
  "Tchéquia": "TCH",
  "México": "MEX",
  "África do Sul": "AFS",
  "Coreia do Sul": "COS",
  "Canadá": "CAN",
  "Bósnia e Herzegovina": "BOH",
  "Catar": "CAT",
  "Brasil": "BRA",
  "Marrocos": "MAR",
  "Haiti": "HAI",
  "Escócia": "ESC",
  "Estados Unidos": "EUA",
  "Paraguai": "PAR",
  "Austrália": "AUS",
  "Turquia": "TUR",
  "Curaçao": "CUR",
  "Equador": "EQU",
  "Japão": "JAP",
  "Tunísia": "TUN",
  "Egito": "EGI",
  "Irã": "IRA",
  "Nova Zelândia": "NZL",
  "Espanha": "ESP",
  "Cabo Verde": "CBV",
  "Arábia Saudita": "ASA",
  "Uruguai": "URU",
  "Senegal": "SEN",
  "Iraque": "IRQ",
  "Argentina": "ARG",
  "Argélia": "AGL",
  "Áustria": "AUT",
  "Jordânia": "JOR",
  "Portugal": "POR",
  "RD Congo": "RDC",
  "Uzbequistão": "UZB",
  "Colômbia": "COL",
  "Inglaterra": "ING",
  "Croácia": "CRO",
  "Gana": "GAN",
  "Panamá": "PAN",
  "Suíça": "SUI",
  "Holanda": "HOL",
  "Alemanha": "ALE",
  "Bélgica": "BEL",
  "Suécia": "SUE",
  "Costa do Marfim": "CDM"
};

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

function bolaoCalcBreakdown(betA, betB, realA, realB) {
  var gol = (betA === realA ? 1 : 0) + (betB === realB ? 1 : 0);
  var dif = (betA - betB) === (realA - realB) ? 1 : 0;
  var pts = gol + dif;
  var bR = betA > betB ? 'A' : betA < betB ? 'B' : 'E';
  var rR = realA > realB ? 'A' : realA < realB ? 'B' : 'E';
  var isRes = bR === rR ? 1 : 0;
  if (isRes) pts += (rR === 'E' ? 1 : 2);
  return { pts: pts };
}

function bolaoGetMultiplier(jogo) {
  var g = ((jogo || {}).grupo || '').toUpperCase().trim();
  if (!g || /^[A-L]$/.test(g)) return 1;
  if (/^3/.test(g) || g === 'TER') return 4;
  if (g === 'FIN' || g === 'FINAL') return 10;
  return 1;
}

function bolaoGetAveragePoints(jogo) {
  if (!jogo || jogo.gols_a === null || jogo.gols_a === undefined || jogo.gols_b === null || jogo.gols_b === undefined) {
    return null;
  }

  var apostas = []
    .concat(jogo.apostadores_a || [], jogo.apostadores_empate || [], jogo.apostadores_b || []);

  if (!apostas.length) return null;

  var total = 0;
  apostas.forEach(function (aposta) {
    var placar = (aposta.placar || '0x0').split('x');
    total += bolaoCalcBreakdown(+placar[0] || 0, +placar[1] || 0, jogo.gols_a, jogo.gols_b).pts;
  });

  return Math.round(total / apostas.length * 10) / 10;
}

function bolaoGetAverageColor(value) {
  if (value === null || value === undefined || isNaN(value)) {
    return {
      bg: 'var(--score-neutral-bg)',
      border: 'var(--score-neutral-border)',
      text: 'var(--score-neutral-text)'
    };
  }

  var clamped = Math.max(0, Math.min(5, value));
  var hue = clamped / 5 * 120;
  return {
    bg: 'hsl(' + hue + ' 85% 92%)',
    border: 'hsl(' + hue + ' 70% 72%)',
    text: 'hsl(' + hue + ' 75% 28%)'
  };
}

function bolaoGetPointsColor(value) {
  if (value === null || value === undefined || isNaN(value)) {
    return bolaoGetAverageColor(null);
  }
  return bolaoGetAverageColor(Math.max(0, Math.min(5, Number(value))));
}

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
      time_a: {
        nome: tA.nome || '',
        sigla: TEAM_ABBR[tA.nome] || (tA.nome || '').substring(0, 3).toUpperCase(),
        logo: tA.logo || '',
        id: j.id_time_a
      },
      time_b: {
        nome: tB.nome || '',
        sigla: TEAM_ABBR[tB.nome] || (tB.nome || '').substring(0, 3).toUpperCase(),
        logo: tB.logo || '',
        id: j.id_time_b
      },
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
  'bosnia e herzegovina': 'bosniaherzegovina',
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
  'tchequia': 'czech republic',
  'romenia': 'romania',
  'servia': 'serbia',
  'suica': 'switzerland',
  'suecia': 'sweden',
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
  'czechia': 'czech republic',
  'czech rep': 'czech republic',
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
  if (!t1 || !t2) return false;

  var a = t1.split(' ').filter(Boolean);
  var b = t2.split(' ').filter(Boolean);

  function sig(words) {
    return words.filter(function (w) {
      return w.length > 2 && w !== 'of' && w !== 'the' && w !== 'and';
    });
  }

  var sa = sig(a), sb = sig(b);
  if (!sa.length || !sb.length) return false;

  // Igualdade de conjunto de palavras significativas (ordem irrelevante)
  if (sa.length === sb.length) {
    var allIn = sa.every(function (w) { return sb.indexOf(w) >= 0; });
    if (allIn) return true;
  }

  // Fallback controlado de inclusão textual, evitando match por palavra genérica
  var short = sa.length <= sb.length ? sa : sb;
  var long = sa.length <= sb.length ? sb : sa;
  if (short.length >= 2 && short.every(function (w) { return long.indexOf(w) >= 0; })) {
    return true;
  }

  return false;
}

function getESPNGoalScorer(detail) {
  var athlete = ((detail || {}).athletesInvolved || [])[0] || {};
  return athlete.shortName || athlete.displayName || athlete.fullName || 'Gol';
}

function parseESPNGoalDetails(details, homeId, awayId) {
  var goals = { home: [], away: [] };

  (details || []).forEach(function (detail) {
    if (!detail || !detail.scoringPlay || detail.shootout) return;

    var typeText = (((detail.type || {}).text) || '').toLowerCase();
    if (typeText !== 'goal' && detail.scoreValue !== 1 && !detail.ownGoal && !detail.penaltyKick) return;

    var teamId = String((detail.team || {}).id || '');
    var goal = {
      jogador: getESPNGoalScorer(detail),
      minuto: ((detail.clock || {}).displayValue || '').trim(),
      minutoValor: Number((detail.clock || {}).value) || 0,
      contra: detail.ownGoal === true,
      penalti: detail.penaltyKick === true
    };

    if (teamId === String(homeId)) goals.home.push(goal);
    else if (teamId === String(awayId)) goals.away.push(goal);
  });

  goals.home.sort(function (a, b) { return a.minutoValor - b.minutoValor; });
  goals.away.sort(function (a, b) { return a.minutoValor - b.minutoValor; });
  return goals;
}

function orientESPNEntry(entry, reversed) {
  return {
    scoreA: reversed ? entry.awayScore : entry.homeScore,
    scoreB: reversed ? entry.homeScore : entry.awayScore,
    goalsA: (reversed ? entry.awayGoals : entry.homeGoals).slice(),
    goalsB: (reversed ? entry.homeGoals : entry.awayGoals).slice(),
    isLive: entry.isLive,
    isFinal: entry.isFinal,
    isPre: entry.isPre,
    clock: entry.clock || ''
  };
}

function utcDateStr(d) {
  var y = d.getUTCFullYear();
  var m = String(d.getUTCMonth() + 1).padStart(2, '0');
  var day = String(d.getUTCDate()).padStart(2, '0');
  return y + m + day;
}

function addDaysUTC(base, days) {
  return new Date(base.getTime() + days * 86400000);
}

function storeESPNEntry(map, key, entry) {
  if (!key || key === '__') return;
  if (!map[key]) map[key] = [];

  var list = map[key];
  var idx = -1;
  for (var i = 0; i < list.length; i++) {
    if (list[i].eventId && entry.eventId && list[i].eventId === entry.eventId) {
      idx = i;
      break;
    }
  }

  if (idx >= 0) {
    // Evita substituir registro ao vivo por registro final para o mesmo evento
    if (list[idx].isLive && !entry.isLive) return;
    list[idx] = entry;
    return;
  }

  list.push(entry);
}

function parseESPNEventsIntoMap(map, events) {

  (events || []).forEach(function (ev) {
    var comp = (ev.competitions || [])[0];
    if (!comp) return;
    var home = null, away = null;
    (comp.competitors || []).forEach(function (c) {
      if (c.homeAway === 'home') home = c; else away = c;
    });
    if (!home || !away) return;
    var st = (ev.status || {}).type || {};
    var isLive = st.state === 'in';
    var isPre = st.state === 'pre';
    var isFinal = st.completed === true;

    var goalDetails = parseESPNGoalDetails(comp.details, home.id, away.id);
    var homeScoreRaw = (home || {}).score;
    var awayScoreRaw = (away || {}).score;
    var homeScore = (homeScoreRaw === null || homeScoreRaw === undefined || homeScoreRaw === '') ? null : parseInt(homeScoreRaw, 10);
    var awayScore = (awayScoreRaw === null || awayScoreRaw === undefined || awayScoreRaw === '') ? null : parseInt(awayScoreRaw, 10);
    if (isNaN(homeScore)) homeScore = null;
    if (isNaN(awayScore)) awayScore = null;

    var entry = {
      eventId: String(ev.id || ''),
      eventDate: (ev.date || comp.date || ''),
      homeScore: homeScore,
      awayScore: awayScore,
      homeGoals: goalDetails.home,
      awayGoals: goalDetails.away,
      isLive: isLive,
      isFinal: isFinal,
      isPre: isPre,
      clock: st.shortDetail || ''
    };

    // Usa normalizeESPNName para variantes ESPN (ex.: Türkiye -> turkey)
    // Regra de negocio: chavear apenas por team.name.
    var ht = home.team, at = away.team;
    if (ht && at && ht.name && at.name) {
      storeESPNEntry(map, normalizeESPNName(ht.name) + '__' + normalizeESPNName(at.name), entry);
    }
  });
}

async function fetchESPNMapByDates(dateStrings) {
  var map = {};
  var ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
  for (var i = 0; i < dateStrings.length; i++) {
    var r = await fetch(ESPN_BASE + '?dates=' + dateStrings[i]);
    if (!r.ok) continue;
    var data = await r.json();
    parseESPNEventsIntoMap(map, data.events || []);
  }
  return map;
}

// Regra de negocio: garantir tentativa de correspondencia para todos os jogos do APEX.
// Para cada data do APEX, consulta a ESPN em D-1, D e D+1 para cobrir diferencas de fuso.
async function fetchESPNScoresForJogos(list) {
  try {
    var datesMap = {};

    (list || []).forEach(function (j) {
      if (!j || !j.data) return;
      var ts = parseApexDateToMillis(j.data);
      if (isNaN(ts)) return;
      var d = new Date(ts);
      [addDaysUTC(d, -1), d, addDaysUTC(d, 1)].forEach(function (x) {
        datesMap[utcDateStr(x)] = true;
      });
    });

    var dates = Object.keys(datesMap).sort();
    if (!dates.length) {
      var now = new Date();
      dates = [utcDateStr(addDaysUTC(now, -1)), utcDateStr(now), utcDateStr(addDaysUTC(now, 1))];
    }

    return fetchESPNMapByDates(dates);
  } catch (e) { return {}; }
}

function parseApexDateToMillis(apexDateStr) {
  if (!apexDateStr) return NaN;
  // APEX chega como "YYYY-MM-DD HH:mm"; trata em UTC para comparar com ESPN (ISO UTC)
  var iso = apexDateStr.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso)) iso += ':00Z';
  var ts = Date.parse(iso);
  return isNaN(ts) ? NaN : ts;
}

function parseESPNDateToMillis(espnDateStr) {
  if (!espnDateStr) return NaN;
  var ts = Date.parse(espnDateStr);
  return isNaN(ts) ? NaN : ts;
}

function findESPNMatch(espnMap, nameA, nameB, apexDateStr) {
  var nA = espnNormTeam(nameA), nB = espnNormTeam(nameB);
  var apexTs = parseApexDateToMillis(apexDateStr);
  var best = null;
  var bestDiff = Number.POSITIVE_INFINITY;

  for (var key in espnMap) {
    if (!Object.prototype.hasOwnProperty.call(espnMap, key)) continue;
    var p = key.split('__');
    var reversed = false;

    if (espnTeamsMatch(nA, p[0]) && espnTeamsMatch(nB, p[1])) reversed = false;
    else if (espnTeamsMatch(nA, p[1]) && espnTeamsMatch(nB, p[0])) reversed = true;
    else continue;

    var entries = espnMap[key] || [];
    if (!Array.isArray(entries)) entries = [entries];

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (!entry) continue;

      var espnTs = parseESPNDateToMillis(entry.eventDate);
      var diff = 0;
      if (!isNaN(apexTs) && !isNaN(espnTs)) {
        diff = Math.abs(espnTs - apexTs);
        // Regra de negocio: match exige proximidade de data/hora (fuso entre APIs).
        // Limite de 36h cobre mudanca de dia entre provedores sem misturar partidas distantes.
        if (diff > 36 * 60 * 60 * 1000) continue;
      } else if (!isNaN(apexTs) || !isNaN(espnTs)) {
        diff = 12 * 60 * 60 * 1000;
      }

      if (diff < bestDiff) {
        bestDiff = diff;
        best = orientESPNEntry(entry, reversed);
      }
    }
  }

  return best;
}

// Regras de negocio APEX x ESPN:
// 1) Match deve considerar Time A + Time B + Data.
// 2) Se status APEX for "F" (finalizado), placar oficial e o do APEX.
// 3) Se status APEX for "A" (em aberto), placar oficial e o da ESPN.
// 4) Detalhes de gols e dados de andamento (ao vivo/relogio) sao sempre trazidos da ESPN quando houver match.
async function applyESPNOverrides(list) {
  var espnMap = await fetchESPNScoresForJogos(list);

  list.forEach(function (j) {
    var espn = findESPNMatch(espnMap, j.time_a.nome, j.time_b.nome, j.data);

    // Sem correspondência na ESPN
    if (!espn) return;

    j.golsDetalhesA = espn.goalsA || [];
    j.golsDetalhesB = espn.goalsB || [];
    j.isLive = !!espn.isLive;
    j.liveClock = espn.isLive ? (espn.clock || '') : '';

    // Status F: placar permanece do APEX.
    if (j.status === 'F') {
      j.isLive = false;
      j.liveClock = '';
      return;
    }

    // Status A: placar vem da ESPN (quando disponivel).
    if (j.status === 'A') {
      if (espn.isPre) {
        j.gols_a = null;
        j.gols_b = null;
      } else {
        j.gols_a = espn.scoreA;
        j.gols_b = espn.scoreB;
      }
      return;
    }

    // Outros status: mantem placar APEX.
  });
}