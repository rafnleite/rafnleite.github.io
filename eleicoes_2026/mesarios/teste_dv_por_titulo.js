"use strict";

// Produto escalar dos quatro primeiros e dos quatro últimos algarismos da sequência.
const parteAlta = new Uint16Array(10000);
const parteBaixa = new Uint16Array(10000);
for (let bloco = 0; bloco < 10000; bloco++) {
    const digitos = String(bloco).padStart(4, "0");
    for (let i = 0; i < 4; i++) {
        parteAlta[bloco] += (2 + i) * Number(digitos[i]);
        parteBaixa[bloco] += (6 + i) * Number(digitos[i]);
    }
}

function digitoVerificador(soma, uf) {
    const resto = soma % 11;
    if (resto === 10) return 0;
    if (resto === 0 && (uf === 1 || uf === 2)) return 1;
    return resto;
}

const verificadores = Array.from({length: 29}, (_, uf) =>
    Array.from({length: 11}, (_, resto) => {
        const primeiro = digitoVerificador(resto, uf);
        return 10 * primeiro + digitoVerificador(7 * Math.floor(uf / 10) + 8 * (uf % 10) + 9 * primeiro, uf);
    })
);

function valido(numero) {
    const cauda = numero % 10000;
    const uf = Math.floor(cauda / 100);
    if (uf < 1 || uf > 28) return false;
    const sequencia = Math.floor(numero / 10000);
    const soma = parteAlta[Math.floor(sequencia / 10000)] + parteBaixa[sequencia % 10000];
    return verificadores[uf][soma % 11] === cauda % 100;
}

const casas = Array.from({length: 12}, (_, i) => 10 ** (11 - i));
function ensaiarTitulo(titulo) {
    const original = Number(titulo);
    if (!/^\d{12}$/.test(titulo) || !valido(original)) {
        throw new Error("Informe os 12 algarismos de um título com código de origem e dígitos verificadores válidos.");
    }
    const digitos = Array.from(titulo, Number);
    const ensaios = Array.from({length: 5}, () => ({tentativas: 0, outro_valido: 0, inalterado: 0}));
    function contar(operacao, resultado) {
        const r = ensaios[operacao];
        r.tentativas++;
        if (resultado === original) r.inalterado++;
        else if (valido(resultado)) r.outro_valido++;
    }
    const trocas = digitos.map((antigo, i) =>
        Array.from({length: 10}, (_, novo) => (novo - antigo) * casas[i]).filter(delta => delta !== 0));
    for (let i = 0; i < 12; i++) {
        const peso = casas[i];
        for (const delta of trocas[i]) {
            const primeiro = original + delta;
            contar(0, primeiro);
            for (let j = i + 1; j < 12; j++) {
                for (const delta2 of trocas[j]) contar(1, primeiro + delta2);
            }
        }
        if (i < 11) contar(2, original + (digitos[i + 1] - digitos[i]) * (peso - casas[i + 1]));
        const prefixo = Math.floor(original / (10 * peso));
        contar(3, prefixo * peso + original % peso);
        const deslocado = prefixo * 10 * peso + Math.floor(original / 10) % peso;
        for (let novo = 0; novo < 10; novo++) contar(4, deslocado + novo * peso);
    }
    return ensaios;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {ensaiarTitulo};
    if (require.main === module) {
        const titulos = process.argv.length > 2 ? process.argv.slice(2) : JSON.parse(require("fs").readFileSync(0, "utf8"));
        const totais = Array.from({length: 5}, () => ({tentativas: 0, outro_valido: 0, inalterado: 0}));
        for (const titulo of titulos) {
            ensaiarTitulo(titulo).forEach((r, i) => {
                for (const campo of Object.keys(r)) totais[i][campo] += r[campo];
            });
        }
        process.stdout.write(JSON.stringify(totais));
    }
}
