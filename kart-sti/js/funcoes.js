const N_MIN = 8;
const P_BASE = 400;
const T_CRES = 8;
const P_MIN = 10
const FRAC_TT = 0.07;
const P_MIN_TT = 0;
const FRAC_MVC = 0.12;

const numeroBr = function (numero, max = 0, min = 0) {
  if (numero === null) return null;
  if (min == null) {
    min = max;
  }
  return Number(numero).toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
}

const percentualBr = function (numero, max = 0, min = 0) {
  if (min == null) {
    min = max;
  }

  return Number(numero).toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: min, maximumFractionDigits: max });
}

const moedaBr = function (numero, max = 2, min = 2) {
  if (min == null) {
    min = max;
  }

  return Number(numero).toLocaleString('pt-Br', { style: 'currency', currency: 'BRL', minimumFractionDigits: min, maximumFractionDigits: max })
}

const dataBr = function (data, opcoes = { formatoEntrada: 'YYYY-MM-DD', formatoSaida: 'DD/MMM/YYYY', upper: true }) {

  if (typeof opcoes === 'string') {
    opcoes = {
      formatoSaida: opcoes
    }
  }

  if (!opcoes.formatoEntrada) opcoes.formatoEntrada = 'YYYY-MM-DD HH:mm:ss';
  if (!opcoes.formatoSaida) opcoes.formatoSaida = 'DD/MMM/YYYY';
  if (typeof opcoes.upper == 'undefined') opcoes.upper = true;

  let retorno = moment(data, opcoes.formatoEntrada).locale('pt-Br').format(opcoes.formatoSaida);
  if (opcoes.upper) {
    return retorno.toUpperCase();
  }
  return retorno;
}

function caulcarPCC(pos, numero_participantes) {
  if (pos > numero_participantes) return null;
  let p1_cc = P_BASE + T_CRES * (numero_participantes - N_MIN);
  return Math.round(100 * (-1 * Math.log(pos) * ((p1_cc - P_MIN) / Math.log(numero_participantes)) + p1_cc)) / 100;
}

function caulcarPMV(numero_participantes) {
  let p1_cc = P_BASE + T_CRES * (numero_participantes - N_MIN);
  return Math.round(100 * FRAC_MVC * p1_cc) / 100;
}

function caulcarPCTT(pos, numero_participantes) {
  if (pos > numero_participantes) return null;
  let p1_cc = P_BASE + T_CRES * (numero_participantes - N_MIN);
  let p1_ctt = p1_cc * FRAC_TT;
  return Math.round(100 * Math.max((-1 * Math.log(pos) * p1_ctt / Math.log((numero_participantes + 1) / 2)) + p1_ctt, 0)) / 100;
}

function caulcarPVC(voltas) {
  return 10 * voltas;
}

function formatarData(dataTexto) {
  if (dataTexto.length !== 12) {
    throw new Error('Formato incorreto do texto da data');
  }

  const data = moment(dataTexto, 'YYYYMMDDHHmm');

  if (!data.isValid()) {
    throw new Error('Data inválida');
  }

  return data.format('DD/MM/YYYY • HH:mm');
}

const paletaDeCores = [
  "#e6194B",
  "#3cb44b",
  "#ffe119",
  "#4363d8",
  "#f58231",
  "#911eb4",
  "#42d4f4",
  "#f032e6",
  "#bfef45",
  "#fabed4",
  "#469990",
  "#dcbeff",
  "#9A6324",
  "#fffac8",
  "#800000",
  "#aaffc3",
  "#808000",
  "#ffd8b1",
  "#000075",
  "#a9a9a9",
  "#000000",
  '#8b4513',
  '#556b2f',
  '#000000',
  '#483d8b',
  '#b22222',
  '#008080',
  '#9acd32',
  '#daa520',
  '#8fbc8f',
  '#8b008b',
  '#b03060',
  '#d2b48c',
  '#00ced1',
  '#ff8c00',
  '#7fff00',
  '#9400d3',
  '#00ff7f',
  '#00bfff',
  '#0000ff',
  '#f08080',
  '#ff7f50',
  '#ff00ff',
  '#f0e68c',
  '#ffff54',
  '#6495ed',
  '#dda0dd',
  '#b0e0e6',
  '#ff1493',
  '#7b68ee',
  '#ee82ee',
  '#98fb98',
  '#7fffd4',
]