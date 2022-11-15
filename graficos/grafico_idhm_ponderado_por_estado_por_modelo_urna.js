
function criarGraficoIDHMPonderadoPorEstadoPorModeloUrna() {
    let municipios = centroideMunicipios.features.map(x => x.properties)
    let regioes = [... new Set(estadosPorRegiao.map(x => x.REGIAO))]

    estadosPorRegiao.forEach(est => {
        soma_produto_UE_2020 = 0
        soma_eleitores_UE_2020 = 0
        soma_produto_UE_antiga = 0
        soma_eleitores_UE_antiga = 0
        municipios.filter(mun => mun.sigla == est.SG_UF).forEach(mun => {
            soma_produto_UE_2020 += mun.idhm * mun.eleitores_aptos_ue_2020
            soma_eleitores_UE_2020 += mun.eleitores_aptos_ue_2020
            soma_produto_UE_antiga += mun.idhm * mun.eleitores_aptos_ue_antiga
            soma_eleitores_UE_antiga += mun.eleitores_aptos_ue_antiga
        })
        est.IDHMPonderadoUE2020 = (soma_produto_UE_2020 / soma_eleitores_UE_2020)
        est.IDHMPonderadoUEantiga = (soma_produto_UE_antiga / soma_eleitores_UE_antiga)
    })

    let maximoEleitoresPorEstado = getMaximoValor(estadosPorRegiao.map(x => x.eleitores_aptos))
    let datasets = []

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
                x: estadosPorRegiao[i].IDHMPonderadoUE2020,
                y: estadosPorRegiao[i].IDHMPonderadoUEantiga,
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

    console.log(datasets)

    const graficoIDHMPonderadoPorEstadoPorModeloUrna = new Chart($('#graficoIDHMPonderadoPorEstadoPorModeloUrnaCanvas'), {
        type: 'mixed',
        data: {
            datasets: datasets
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: `IDH-M médio dos municípios ponderado dos municípios de cada estado, ponderado pelo número de elitores em cada modelo de urna`,
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
                            return [`UE 2020:  ${(tooltipItem.raw.x.toLocaleString("pt-BR", { style: 'decimal', minimumFractionDigits: 3, maximumFractionDigits: 3}))}`,
                            `UE antiga:  ${(tooltipItem.raw.y.toLocaleString("pt-BR", { style: 'decimal', minimumFractionDigits: 3, maximumFractionDigits: 3}))}`];
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
                    min: 0.55,
                    max: 0.85,
                    ticks: {
                        padding: 10,
                        callback: function (value, index, values) {
                            return value.toLocaleString("pt-BR", { style: 'decimal', minimumFractionDigits: 3, maximumFractionDigits: 3});
                        }
                    },
                    grid: {
                        color: `#bdbdbd`,
                        drawTicks: false,
                        z: -1
                    },
                    title: {
                        display: true,
                        text: 'IDM-M médio dos municípios ponderado pelo número de eleitores - UE 2020',
                        align: 'center'
                    }
                },
                y: {
                    type: 'linear',
                    min: 0.55,
                    max: 0.85,
                    ticks: {
                        padding: 10,
                        callback: function (value, index, values) {
                            return value.toLocaleString("pt-BR", { style: 'decimal', minimumFractionDigits: 3, maximumFractionDigits: 3});
                        }
                    },
                    grid: {
                        color: `#bdbdbd`,
                        drawTicks: false,
                        z: -1
                    },
                    title: {
                        display: true,
                        text: 'IDM-M médio dos municípios ponderado pelo número de eleitores - UE antiga',
                        align: 'middle'
                    },
                },
            }
        },
        plugins: [chartAreaBorder]
    })
}