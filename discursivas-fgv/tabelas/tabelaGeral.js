function criarTabelaGeral(dados) {

    if (window.hasOwnProperty('tabelaGeral')) {
        $(`#tabelaGeral`).DataTable().destroy();
    }

    window.tabelaGeral = $(`#tabelaGeral`).DataTable({
        data: dados,
        dom: 'rft',
        pageLength: -1,
        columns: [
            {
                title: 'Concurso',
                data: 'Concurso',
                class: 'small text-center align-middle'
            },
            {
                title: 'Número de vagas',
                data: 'Número de vagas',
                class: 'small text-center align-middle',
                render: function (data, type, full, meta) {
                    let retorno = []
                    for (tipo in data) {
                        retorno.push(`${tipo}: ${data[tipo]}`)
                    }
                    return retorno.join(`<br>`);
                }
            },
            {
                title: 'Número de qualificados para discursiva',
                data: 'Número de qualificados para discursiva',
                class: 'small text-center align-middle',
                render: function (data, type, full, meta) {
                    return data;
                }
            },
            {
                title: 'Número de aprovados',
                data: 'Aprovados no resultado preliminar',
                class: 'small text-center align-middle',
                render: function (data, type, full, meta) {
                    return `<div>Pré-recursos: ${full["Aprovados no resultado preliminar"]} (${percentualBR(full["Aprovados no resultado preliminar"] / full["Número de qualificados para discursiva"])})</div>
                    ${full["Aprovados no resultado definitivo"] ?
                            `<div>Resultado definitivo: ${full["Aprovados no resultado definitivo"]} (${percentualBR(full["Aprovados no resultado definitivo"] / full["Número de qualificados para discursiva"])})</div>` :
                            ``}`;
                }
            },
            {
                title: 'Número de candidatos que entraram nas vagas pós-recursos',
                data: 'Candidato que entraram nas vagas',
                class: 'small text-center align-middle',
                render: function (data, type, full, meta) {
                    if (!full["Aprovados no resultado definitivo"]) {
                        return "-";
                    }
                    if (full["Cadastro de reservas"] == 'ilimitado') {
                        return `<div>${data}</div>`
                    } else {
                        return `<div>Apenas vagas: ${data}</div>
                    <div>Vagas + CR: ${full["Candidato que entraram nas vagas ou CR"]}`
                    };
                }
            }, {
                title: 'Número de candidatos que saíram das vagas pós-recursos',
                data: 'Candidato que saíram das vagas',
                class: 'small text-center align-middle',
                render: function (data, type, full, meta) {
                    if (!full["Aprovados no resultado definitivo"]) {
                        return "-";
                    }
                    if (full["Cadastro de reservas"] == 'ilimitado') {
                        return `<div>${data}</div>`
                    } else {
                        return `<div>Apenas vagas: ${data}</div>
                    <div>Vagas + CR: ${full["Candidato que saíram das vagas ou CR"]}`
                    };
                }
            },
            {
                title: 'Candidato que mais subiu posições',
                data: 'Candidato que mais subiu posições',
                class: 'small text-center align-middle',
                render: function (data, type, full, meta) {
                    if (data.Nome) {
                        return `<div>${data.Nome}</div><div class="font-weight-bold">+${data.Variação} ${data.Variação >= 2 ? `posições` : `posição`}</div>`;
                    } else {
                        return "-";
                    }
                }
            },
            {
                title: 'Candidato que mais caiu posições',
                data: 'Candidato que mais caiu posições',
                class: 'small text-center align-middle',
                render: function (data, type, full, meta) {
                    if (data.Nome) {
                        return `<div>${data.Nome}</div><div class="font-weight-bold">${data.Variação} ${data.Variação <= -2 ? `posições` : `posição`}</div>`;
                    } else {
                        return "-";
                    }
                }
            },
            {
                title: 'Candidato que mais ganhou pontos',
                data: 'Candidato que mais ganhou pontos',
                class: 'small text-center align-middle',
                render: function (data, type, full, meta) {
                    if (data.Nome) {
                        return `<div>${data.Nome}</div>
                        <div class="font-weight-bold">+${data.Variação} ${data.Variação >= 2 ? `pontos` : `ponto`}</div>
                        <div>+${percentualBR(data.Variação / full["Questões"].reduce((acc, curr) => acc + curr.Valor, 0))} ${data["Estava eliminado"] ? `<b>(*)</b>` : ``}</div>`;
                    } else {
                        return "-";
                    }
                }
            },
        ]
    });

    $('#tabelaGeral').on('click', 'tr', function () {
        var data = tabelaGeral.row(this).data();
        window.location.href = `./concurso.html?id=${data["Concurso"]}`;
    });
}