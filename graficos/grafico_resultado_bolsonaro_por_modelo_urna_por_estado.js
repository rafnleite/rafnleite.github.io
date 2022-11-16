
function criarGraficoResultadoBolsonaroPorModeloUrnaPorEstado() {
    let regioes = [... new Set(estadosPorRegiao.map(x => x.REGIAO))]
    let datasets = []
    let maximoEleitoresPorEstado = getMaximoValor(estadosPorRegiao.map(x => x.eleitores_aptos))

    for (let i = 0; i < regioes.length; i++) {
        if (regioes[i] != 'Exterior') {
            let dataset = {}
            dataset.type = 'bubble'
            dataset.label = regioes[i]
            dataset.data = []
            dataset.backgroundColor = getColor(i)
            datasets.push(dataset)
        }
    }

    for (let i = 0; i < estadosPorRegiao.length; i++) {
        if (estadosPorRegiao[i].NOME != 'Exterior') {
            let dataset = {}
            dataset.type = 'bubble'
            dataset.label = estadosPorRegiao[i].NOME
            dataset.data = [{
                x: estadosPorRegiao[i].bolsonaro_ue_2020_perc,
                y: estadosPorRegiao[i].bolsonaro_ue_antiga_perc,
                r: 3 + 15 * estadosPorRegiao[i].eleitores_aptos / maximoEleitoresPorEstado
            }]
            dataset.backgroundColor = getColor(regioes.findIndex(x => x == estadosPorRegiao[i].REGIAO))
            datasets.push(dataset)
        }
    }
    datasets.push({
        type: 'line',
        label: 'Eixo de simetria',
        data: [{ y: -1, x: -1 }, { y: 2, x: 2 }],
        fill: true,
        backgroundColor: "#83FBFF80",
        borderColor: "#83FBFF80",
        pointRadius: 0,
        pointHoverRadius: 0,
        pointBorderWidth: 0,
        borderWidth: 0
    })

    const graficoResultadoBolsonaroPorModeloUrnaPorEstado = new Chart($('#graficoResultadoBolsonaroPorModeloUrnaPorEstadoCanvas'), {
        type: 'mixed',
        data: {
            datasets: datasets
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: `Percentual de votos do Bolsonaro no segundo turno por estado por modelo de urna eletrônica`,
                    font: {
                        size: 14
                    }
                },
                chartAreaBorder: {
                    borderColor: '#636363',
                    borderWidth: 2,
                },
                legend: {
                    labels: {
                        filter: function (item, chart) {
                            return (!(estadosPorRegiao.map(x => x.NOME).includes(item.text)) && (item.text != 'Eixo de simetria'));
                        }
                    },
                    onClick: function (e, legendItem, legend) {

                        var index = legendItem.datasetIndex;
                        var ci = this.chart;
                        var estadosAlterar = estadosPorRegiao.filter(x => x.REGIAO == legendItem.text).map(x => x.NOME)
                        var alreadyHidden = (ci.getDatasetMeta(index).hidden === null) ? false : ci.getDatasetMeta(index).hidden;
                        ci.data.datasets.forEach(function (e, i) {
                            var meta = ci.getDatasetMeta(i);
                            if (i === index) {
                                if (alreadyHidden) {
                                    meta.hidden = meta.hidden === null ? !meta.hidden : null;
                                    for (let i = 0; i < ci._metasets.length; i++) {
                                        estadosAlterar.includes(ci._metasets[i].label) && (ci._metasets[i].hidden = false)
                                    }
                                } else if (meta.hidden === null) {
                                    meta.hidden = true;
                                    for (let i = 0; i < ci._metasets.length; i++) {
                                        estadosAlterar.includes(ci._metasets[i].label) && (ci._metasets[i].hidden = true);
                                    }
                                }
                            }
                        });

                        ci.update();
                    }
                },
                tooltip: {
                    backgroundColor: "rgba(255,255,255,1)",
                    bodyColor: "#858796",
                    titleMarginBottom: 10,
                    titleColor: '#6e707e',
                    titleFont: {
                        size: 14
                    },
                    borderColor: '#dddfeb',
                    borderWidth: 1,
                    displayColors: false,
                    intersect: false,
                    caretPadding: 10,
                    filter: function (tooltipItem) {
                        return tooltipItem.dataset.label !== 'Eixo de simetria';
                    },
                    callbacks: {
                        title: function (tooltipItem) {
                            return tooltipItem[0].label
                        },
                        label: function (tooltipItem) {
                            return [`UE 2020:  ${(tooltipItem.raw.x.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 }))}`,
                            `UE antiga:  ${(tooltipItem.raw.y.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 }))}`,
                                ``,
                            `Diferença: ${(100 * (tooltipItem.raw.x - tooltipItem.raw.y)).toLocaleString("pt-BR", { style: 'decimal', minimumFractionDigits: 1, maximumFractionDigits: 1 })} pp`];
                        }
                    }
                }
            },
            responsive: true,
            aspectRatio: 1,
            maintainAspectRatio: true,
            layout: {
                padding: {
                    left: 10,
                    right: 25,
                    top: 25,
                    bottom: 0
                }
            },

            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: 1,
                    ticks: {
                        padding: 10,
                        callback: function (value, index, values) {
                            return value.toLocaleString("pt-BR", { style: 'percent', });
                        }
                    },
                    grid: {
                        color: `#bdbdbd`,
                        drawTicks: false,
                        z: -1
                    },
                    title: {
                        display: true,
                        text: '% Bolsonaro UE 2020',
                        align: 'center'
                    }
                },
                y: {
                    type: 'linear',
                    min: 0,
                    max: 1,
                    ticks: {
                        padding: 10,
                        callback: function (value, index, values) {
                            return value.toLocaleString("pt-BR", { style: 'percent', });
                        }
                    },
                    grid: {
                        color: `#bdbdbd`,
                        drawTicks: false,
                        z: -1
                    },
                    title: {
                        display: true,
                        text: '% Bolsonaro UE antiga',
                        align: 'middle'
                    },
                },
            }
        },
        plugins: [chartAreaBorder]
    })
}

function criarTabelaResultadoBolsonaroPorModeloUrnaPorEstado() {
    if (window.hasOwnProperty('tabelaResultadoBolsonaroPorModeloUrnaPorEstado'))
        $(`#tabelaResultadoBolsonaroPorModeloUrnaPorEstado`).DataTable().destroy();
    window.tabelaResultadoBolsonaroPorModeloUrnaPorEstado = $(`#tabelaResultadoBolsonaroPorModeloUrnaPorEstado`).DataTable({
        data: estadosPorRegiao,
        dom: 'rt',
        iDisplayLength: -1,
        columns: [
            {
                title: 'Estado',
                data: 'NOME',
                class: 'small text-center align-middle'
            },
            {
                title: 'Região',
                data: 'REGIAO',
                class: 'small text-center align-middle'
            },
            {
                title: '% Bolsonaro UE 2020',
                data: 'bolsonaro_ue_2020_perc',
                class: 'small text-center align-middle',
                render: function (data, type, full, meta) {
                    if (type == 'sort')
                        return data ? data : 0
                    return data ? data.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 }) : '-'
                }
            },
            {
                title: '% Bolsonaro UE antiga',
                data: 'bolsonaro_ue_antiga_perc',
                class: 'small text-center align-middle',
                render: function (data, type, full, meta) {
                    if (type == 'sort')
                        return data
                    return data ? data.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 }) : '-'
                }
            },
            {
                title: 'Diferença',
                data: 'NOME',
                class: 'small text-center align-middle',
                render: function (data, type, full, meta) {
                    if (type == 'sort' || type == 'type')
                        return (full.bolsonaro_ue_2020_perc && full.bolsonaro_ue_antiga_perc) ? 100 * (full.bolsonaro_ue_2020_perc - full.bolsonaro_ue_antiga_perc) : -1
                    return (full.bolsonaro_ue_2020_perc && full.bolsonaro_ue_antiga_perc) ? `${(100 * (full.bolsonaro_ue_2020_perc - full.bolsonaro_ue_antiga_perc)).toLocaleString("pt-BR", { style: 'decimal', minimumFractionDigits: 1, maximumFractionDigits: 1 })} pp` : `-`
                }
            },
        ]
    })
}