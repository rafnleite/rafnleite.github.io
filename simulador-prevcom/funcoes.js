function percentualBR(numero) {
  return numero.toLocaleString('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function moedaBR(numero) {
  return numero.toLocaleString('pt-Br', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function calcularIR(salário) {
  return (salário <= 2112) ? 0 :
    (salário > 2112 && salário <= 2826.65) ? arredondar(salário * 0.075 - 158.4) :
      (salário > 2826.65 && salário <= 3751.05) ? arredondar(salário * 0.15 - 370.4) :
        (salário > 3751.05 && salário <= 4664.68) ? arredondar(salário * 0.225 - 651.73) :
          (salário > 4664.68) ? arredondar(salário * 0.275 - 884.96) :
            null;
}

function calcularPSS(salário) {
  return (salário <= 1845.79) ? arredondar(salário * 0.11) :
    (salário > 1845.79 && salário <= 3076.31) ? arredondar(salário * 0.12 - 18.46) :
      (salário > 3076.31 && salário <= 4306.86) ? arredondar(salário * 0.13 - 49.22) :
        (salário > 4306.86 && salário <= 5537.35) ? arredondar(salário * 0.14 - 92.29) :
          (salário > 5537.35 && salário <= 6767.87) ? arredondar(salário * 0.15 - 147.66) :
            (salário > 6767.87 && salário <= 7507.49) ? arredondar(salário * 0.155 - 181.50) :
              (salário > 7507.49) ? 982.16 :
                null;
}

function contarFrequencias(array) {
  var frequencies = {};

  for (var i = 0; i < array.length; i++) {
    var element = array[i];

    if (frequencies[element]) {
      frequencies[element]++;
    } else {
      frequencies[element] = 1;
    }
  }

  return frequencies;
}

function criarFormulárioInvestimento(el, dadosInvestimento = null) {
  $(el).html(`<form>
  <div class="form-group">
    <label for="formularioInvestimentoNome">Nome</label>
    <input type="text" class="form-control" id="formularioInvestimentoNome"></input>
  </div>
  <div class="row">
    <div class="form-group col-6">
      <label for="formularioInvestimentoÍndice">Índice</label>
      <select class="form-select" id="formularioInvestimentoÍndice">
        <option value="prevcom">PREVCOM</option>  
        <option value="cdi">CDI</option>  
        <option value="ipca">IPCA</option>  
        <option value="fixo" selected>FIXO</option>  
      </select>
    </div>
    <div class="form-group col-6" id="formularioInvestimentoMultiplicadorDIV">
    </div>
  </div>
  <div class="form-group my-2">
  <div class="form-check form-switch">
    <input class="form-check-input" type="checkbox" value="" id="formularioInvestimentoDedutivel">
    <label for="formularioInvestimentoDedutivel">Investimento dedutível no IR</label>
  </div>
  </div>
  <div class="form-group">
    <label for="formularioInvestimentoTaxaAporte">Taxa no aporte</label>
    <input type="text" class="form-control" id="formularioInvestimentoTaxaAporte" value="0"></input>
  </div>
  <div class="row">
    <div class="form-group col-6">
      <label for="formularioInvestimentoTaxaSaque">Taxa de saque</label>
      <input type="text" class="form-control" id="formularioInvestimentoTaxaSaque" value="0.0"></input>
    </div>
    <div class="form-group col-6">
      <label for="formularioInvestimentoModalidadeTaxaSaque">Modalidade</label>
        <select class="form-select" id="formularioInvestimentoModalidadeTaxaSaque">
          <option value="total">Sobre o montante</option>
          <option value="rendimento">Sobre o rendimento</option>
        </select>
    </div>
  </div>
  <div class="form-group">
    <label for="formularioInvestimentoCor">Cor</label>
    <input type="color" class="form-control" id="formularioInvestimentoCor"></input>
  </div>
  <div class="form-group">
    <label for="formularioInvestimentoObs">Observação</label>
    <textarea type="text" class="form-control" id="formularioInvestimentoObs" rows="5"></textarea>
  </div>
  <div id="formularioInvestimentoErros" style="color:red; font-weight: bold"></div>
</form>`);

  $(`#formularioInvestimentoÍndice`).on(`change`, function () {
    if ($(`#formularioInvestimentoÍndice`).val() == 'cdi') {
      $(`#formularioInvestimentoMultiplicadorDIV`).html(`<label for="formularioInvestimentoMultiplicador">% do CDI</label>
      <input type="text" class="form-control" id="formularioInvestimentoMultiplicador" value="1"></input>`);
    } else if ($(`#formularioInvestimentoÍndice`).val() == 'ipca') {
      $(`#formularioInvestimentoMultiplicadorDIV`).html(`<label for="formularioInvestimentoMultiplicador">IPCA +</label>
      <input type="text" class="form-control" id="formularioInvestimentoMultiplicador" value="0.05"></input>`);
    } else if ($(`#formularioInvestimentoÍndice`).val() == 'fixo') {
      $(`#formularioInvestimentoMultiplicadorDIV`).html(`<label for="formularioInvestimentoMultiplicador">Rendimento anual</label>
      <input type="text" class="form-control" id="formularioInvestimentoMultiplicador" value="0.08"></input>`);
    } else {
      $(`#formularioInvestimentoMultiplicadorDIV`).html(``);
    }

    $('#formularioInvestimentoMultiplicador').length && new AutoNumeric('#formularioInvestimentoMultiplicador', 'percentageEU2decPos');
  });

  $(`#formularioInvestimentoÍndice`).trigger(`change`);

  new AutoNumeric('#formularioInvestimentoTaxaAporte', 'percentageEU2decPos');
  new AutoNumeric('#formularioInvestimentoTaxaSaque', 'percentageEU2decPos');

  if (dadosInvestimento) {
    $(`#formularioInvestimentoNome`).val(dadosInvestimento.nome);
    $(`#formularioInvestimentoÍndice`).val(dadosInvestimento.índice);
    $(`#formularioInvestimentoÍndice`).trigger(`change`);
    $('#formularioInvestimentoMultiplicador').length && AutoNumeric.set('#formularioInvestimentoMultiplicador',
      dadosInvestimento.índice == 'cdi' ? dadosInvestimento.multiplicador :
        ['fixo', 'ipca'].includes(dadosInvestimento.índice) ? dadosInvestimento.multiplicador - 1 : 0);
    dadosInvestimento.dedutível_ir && $(`#formularioInvestimentoDedutivel`).prop('checked', true);
    AutoNumeric.set('#formularioInvestimentoTaxaAporte', dadosInvestimento.taxa_aporte);
    AutoNumeric.set('#formularioInvestimentoTaxaSaque', dadosInvestimento.taxa_saque);
    $(`#formularioInvestimentoModalidadeTaxaSaque`).val(dadosInvestimento.modalidade_taxa_saque);
    $(`#formularioInvestimentoCor`).val(dadosInvestimento.cor);
    $(`#formularioInvestimentoObs`).val(dadosInvestimento.obs);
  }
}

function criarCardsInvestimentos() {
  let cards = [];
  listaInvestimentos.forEach(el => {

    let indice = el.índice == 'prevcom' ? 'Prevcom' :
      el.índice == 'cdi' ? `${percentualBR(el.multiplicador)} do CDI` :
        el.índice == 'ipca' ? `IPCA + ${percentualBR(el.multiplicador - 1)}` :
          el.índice == 'fixo' ? `${percentualBR(el.multiplicador - 1)} ao ano` : null;

    cards.push(`<div class="col-12 col-md-6 col-lg-4 col-xl-3 p-0">
    <div class="card m-2" style="border-color: ${el.cor}; border-width: 2px; height: 95%">
        <div class="card-body d-flex flex-column">
          <div>
          <div class="card-title h5"><i class="fas fa-square" style="color: ${el.cor}"></i> ${el.nome}</div>`);
    el.índice && cards.push(`<div><b>Rendimento:</b> ${indice}</div>`);
    cards.push(`<div>${el.dedutível_ir ? `Dedutível do IR <span class="text-muted">(Parcela patrocinada + 12%)</span>` : `Não dedutível do Imposto de Renda`}</div>`);
    cards.push(`<div><b>Taxa no aporte:</b> ${el.taxa_aporte ? percentualBR(el.taxa_aporte) : `Não tem`}</div>`);
    el.patrocínio && cards.push(`<div><b>Patrocínio:</b> ${percentualBR(el.patrocínio)}${el.limite_patrocínio ? ` <span class="text-muted">(Limitado em ${percentualBR(el.limite_patrocínio)})</span>` : ''}</div>`);
    el.taxa_saque && cards.push(`<div><b>Taxa de saque:</b> ${percentualBR(el.taxa_saque)} <span class="text-muted">(${el.modalidade_taxa_saque == 'total' ? `Sobre montante total` : `Sobre rendimento`})</span></div>`);
    el.obs && cards.push(`<small class="fw-light">${el.obs}</small>`);
    cards.push(`</div>`);
    el.id !== 1 && cards.push(`<div class="text-center mt-auto">
        <button type="button" class="btn btn-outline-secondary btn-sm m-2" onclick="modalEditarInvestimento(${el.id})"><i class="fas fa-edit"></i> Editar Investimento</button>
        <button type="button" class="btn btn-outline-secondary btn-sm m-2" onclick="modalExcluirInvestimento(${el.id})"><i class="fas fa-trash-alt"></i> Excluir Investimento</button>
      </div>`);

    cards.push(`</div></div></div>`);
  });

  cards.push(`<div class="col-12 col-md-6 col-lg-4 col-xl-3 p-0" onclick="modalAdicionarInvestimento()">
    <div class="card m-2 adicionarInvestimento">
        <div class="card-body centro pointer" style="color: #B89C00">
          <div class="icone"><i class="fas fa-plus-circle"></i></div>
            <div>Adicionar novo investimento</div>
        </div></div></div>`);

  $(`.cardsInvestimentos`).html(cards.join(``));
}

function criarCardsResultados() {

  let c = structuredClone(listaInvestimentos);
  c.sort((a, b) => {
    const saldoA = a.resultado.tabela[a.resultado.tabela.length - 1].saldoFinalMêsLíquido;
    const saldoB = b.resultado.tabela[b.resultado.tabela.length - 1].saldoFinalMêsLíquido;

    return saldoB - saldoA;
  });
  let cards = [];

  c.forEach(el => {
    let res = el.resultado
    let tabela = res.tabela;

    cards.push(`<div class="col-12 p-0">
    <div class="card m-2" style="border-width: 2px;">
        <div class="card-body row">`);

    cards.push(`<div class="col-12 col-md-3 col-lg-2">
          <div class="h6"><i class="fas fa-square" style="color: ${el.cor}"></i> ${el.nome}</div>
          <div class="text-center">
            <button type="button" class="btn btn-outline-secondary m-2" onclick="modalExibirDetalhes(${el.id})"><i class="fas fa-table"></i> Ver tabela detalhada</button>
          </div>
        </div>`);

    cards.push(`<div class="col-12 col-md-9 col-lg-6">
        <label class="fw-bold">Aporte Mensal</label>
        <table class="table table-bordered table-sm mt-2">
          <tr>
            <td>Aporte Pessoal Mensal Bruto</td>
            <td class="fw-bold">${moedaBR(res.aportePessoalMensalBruto)}</td>
          </tr>
          <tr>
            <td>IR sobre parcela do salário</td>
            <td>(${moedaBR(res.IRSobreParcelaDoSalárioParaInvestimento)})</td>
          </tr>`);
    res.patrocínioMensal && cards.push(`<tr>
            <td>Patrocínio Mensal</td>
            <td>${moedaBR(res.patrocínioMensal)}</td>
          </tr>`);
    res.taxaDeAporteMensal && cards.push(`<tr>
            <td>Taxa sobre aporte</td>
            <td>(${moedaBR(res.taxaDeAporteMensal)})</td>
          </tr>`);
    cards.push(`<tr>
            <td>Aporte Mensal Líquido</td>
            <td class="fw-bold">${moedaBR(res.aporteTotalMensalLíquido)}</td>
          </tr>
        </table>
      </div>`);

    cards.push(`<div class="col-12 col-md-12 col-lg-4">
        <div class="row">
          <div class="col-12 col-md-6 col-lg-12 col-xl-6">
            <label>Aportade Pessoal Acumulado Bruto</label>
            <div>${moedaBR(tabela[tabela.length - 1].aportePessoalAcumuladoBruto)}</div>
            <hr>
          </div>
          <div class="col-12 col-md-6 col-lg-12 col-xl-6">
            <label>Aportade Total Acumulado Líquido</label>
            <div>${moedaBR(tabela[tabela.length - 1].aporteTotalAcumuladoLíquido)}</div>
            <hr>
          </div>
          <div class="col-12 col-md-6 col-lg-12 col-xl-6">
            <label>Montante Final Bruto</label>
            <div>${moedaBR(tabela[tabela.length - 1].saldoFinalMês)}</div>
            <hr>
          </div>
          <div class="col-12 col-md-6 col-lg-12 col-xl-6">
            <label>Imposto sobre retirada</label>
            <div>${moedaBR(tabela[tabela.length - 1].taxaSaqueAbsoluta)}</div>
            <hr>
          </div>
          <div class="col-12 col-md-6 col-lg-12 col-xl-6">
            <label>Montante Final Líquido</label>
            <div class="fw-bold">${moedaBR(tabela[tabela.length - 1].saldoFinalMêsLíquido)}</div>
            <hr>
          </div>
        </div>
      </div>`);

    cards.push(`</div></div></div>`);
  });
  $(`.cardsResultados`).html(cards.join(``));
}

function delay(callback, tempo) {
  window.hasOwnProperty('delayTimer') && clearTimeout(delayTimer);
  delayTimer = setTimeout(function () {
    callback();
  }, tempo);
}

function calcularRendimento() {
  if ($(`#sérieHistórica`).is(`:visible`)) {
    calcularRendimentosSérieHistórica();
  }
  if ($(`#projeçãoFutura`).is(`:visible`)) {
    calcularRendimentosProjeçãoFutura();
  }
}