
function criarGraficoResultadoBolsonaroPorModeloUrnaPorZonaEMunicipioCanvas() {
    let regioes = [... new Set(estadosPorRegiao.map(x => x.REGIAO))]
    let zonasEMunicipioAmbosModelos = votacaoPorZonaPorMunicipio.filter(x => x.eleitores_aptos_ue_2020 > 0 && x.eleitores_aptos_ue_antiga > 0)
    let datasets = []
    let maximoEleitoresPorZonaEMunicipio = getMaximoValor(zonasEMunicipioAmbosModelos.map(x => x.eleitores_aptos))

    // soma_bolso_ue_2020 = zonasEMunicipioAmbosModelos.reduce((pre, cur) => pre + cur.bolsonaro_ue_2020, 0)
    // soma_bolso_ue_antiga = zonasEMunicipioAmbosModelos.reduce((pre, cur) => pre + cur.bolsonaro_ue_antiga, 0)
    // soma_lula_ue_2020 = zonasEMunicipioAmbosModelos.reduce((pre, cur) => pre + cur.lula_ue_2020, 0)
    // soma_lula_ue_antiga = zonasEMunicipioAmbosModelos.reduce((pre, cur) => pre + cur.lula_ue_antiga, 0)
    // perc_bolso_ue_2020 = soma_bolso_ue_2020 / (soma_bolso_ue_2020 + soma_lula_ue_2020)
    // perc_bolso_ue_antiga = soma_bolso_ue_antiga / (soma_bolso_ue_antiga + soma_lula_ue_antiga)
    // console.log(perc_bolso_ue_2020)
    // console.log(perc_bolso_ue_antiga)

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
    for (let i = 0; i < zonasEMunicipioAmbosModelos.length; i++) {
        let dataset = {}
        dataset.type = 'bubble'
        dataset.label = `Zona ${zonasEMunicipioAmbosModelos[i].NR_ZONA}/${zonasEMunicipioAmbosModelos[i].SG_UF} - ${zonasEMunicipioAmbosModelos[i].NM_MUNICIPIO}`
        dataset.data = [{
            x: zonasEMunicipioAmbosModelos[i].bolsonaro_ue_2020 / (zonasEMunicipioAmbosModelos[i].bolsonaro_ue_2020 + zonasEMunicipioAmbosModelos[i].lula_ue_2020),
            y: zonasEMunicipioAmbosModelos[i].bolsonaro_ue_antiga / (zonasEMunicipioAmbosModelos[i].bolsonaro_ue_antiga + zonasEMunicipioAmbosModelos[i].lula_ue_antiga),
            r: 3 + 7 * zonasEMunicipioAmbosModelos[i].eleitores_aptos / maximoEleitoresPorZonaEMunicipio
        }]
        dataset.backgroundColor = getColor(regioes.findIndex(x => x == estadosPorRegiao.find(y => y.SG_UF == zonasEMunicipioAmbosModelos[i].SG_UF).REGIAO))
        datasets.push(dataset)
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



    const graficoResultadoBolsonaroPorModeloUrnaPorZonaEMunicipio = new Chart($('#graficoResultadoBolsonaroPorModeloUrnaPorZonaEMunicipioCanvas'), {
        type: 'mixed',
        data: {
            datasets: datasets
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: `Percentual de votos do Bolsonaro no segundo turno por município e zona por modelo de urna eletrônica - Municípios que receberam ambos os modelos.`,
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
                            return (regioes.includes(item.text));
                        }
                    },
                    onClick: function (e, legendItem, legend) {

                        var index = legendItem.datasetIndex;
                        var ci = this.chart;

                        var municipiosAlterar = zonasEMunicipioAmbosModelos.filter(x => estadosPorRegiao.find(y => y.SG_UF == x.SG_UF).REGIAO == legendItem.text).map(x => `Zona ${x.NR_ZONA}/${x.SG_UF} - ${x.NM_MUNICIPIO}`)
                        var alreadyHidden = (ci.getDatasetMeta(index).hidden === null) ? false : ci.getDatasetMeta(index).hidden;
                        ci.data.datasets.forEach(function (e, i) {
                            var meta = ci.getDatasetMeta(i);
                            if (i === index) {
                                if (alreadyHidden) {
                                    meta.hidden = meta.hidden === null ? !meta.hidden : null;
                                    for (let i = 0; i < ci._metasets.length; i++) {
                                        municipiosAlterar.includes(ci._metasets[i].label) && (ci._metasets[i].hidden = false)
                                    }
                                } else if (meta.hidden === null) {
                                    meta.hidden = true;
                                    for (let i = 0; i < ci._metasets.length; i++) {
                                        municipiosAlterar.includes(ci._metasets[i].label) && (ci._metasets[i].hidden = true);
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