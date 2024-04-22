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