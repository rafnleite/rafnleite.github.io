
function criarGraficoResultadoBolsonaroPorModeloUrnaPorMunicipioPorIDHM() {
    UF = $('#graficoResultadoBolsonaroPorModeloUrnaPorMunicipioPorIDHMSelector').val()
    let municipios = centroideMunicipios.features.map(x => x.properties).filter(x => x.sigla == UF || 'BR' == UF)

    soma_produto_UE_2020 = 0
    soma_eleitores_UE_2020 = 0
    soma_produto_UE_antiga = 0
    soma_eleitores_UE_antiga = 0

    municipios.forEach(x => {
        soma_produto_UE_2020 += x.idhm * x.eleitores_aptos_ue_2020
        soma_eleitores_UE_2020 += x.eleitores_aptos_ue_2020
        soma_produto_UE_antiga += x.idhm * x.eleitores_aptos_ue_antiga
        soma_eleitores_UE_antiga += x.eleitores_aptos_ue_antiga
    })

    let datasets = []

    let maximoEleitoresPorMunicipio = getMaximoValor(municipios.map(x => x.eleitores_aptos))

    for (let i = 0; i < municipios.length; i++) {
        let dataset = {}
        dataset.type = 'bubble'
        dataset.label = municipios[i].nm_mun
        dataset.data = [{
            x: municipios[i].idhm,
            y: municipios[i].bolsonaro_perc,
            r: 3 + 15 * municipios[i].eleitores_aptos / maximoEleitoresPorMunicipio
        }]

        let rgb = chroma.mix("#FFC400", "#FF0000", municipios[i].eleitores_aptos_ue_2020_perc).rgb()
        let r = rgb[0]
        let g = rgb[1]
        let b = rgb[2]

        dataset.backgroundColor = `rgb(${r},${g},${b})`
        datasets.push(dataset)

        let correlacao = municipios.filter(mun => mun.idhm).length > 1 ? ss.sampleCorrelation(municipios.filter(mun => mun.idhm).map(mun => mun.idhm), municipios.filter(mun => mun.idhm).map(mun => mun.bolsonaro_perc)) : null

        $('#graficoResultadoBolsonaroPorModeloUrnaPorMunicipioPorIDHMInfo').html(
            `IDH-M médio ponderado por eleitores - UE 2020: <b>${(soma_produto_UE_2020 / soma_eleitores_UE_2020).toLocaleString("pt-BR", { style: 'decimal', minimumFractionDigits: 3, maximumFractionDigits: 3 })}</b><br>
             IDH-M médio ponderado por eleitores - UE antiga: <b>${(soma_produto_UE_antiga / soma_eleitores_UE_antiga).toLocaleString("pt-BR", { style: 'decimal', minimumFractionDigits: 3, maximumFractionDigits: 3 })}</b><br>
             ${correlacao != null ? `Correlação (IDH-M × % Bolsonaro): <b>${correlacao.toLocaleString("pt-BR", { style: 'decimal', minimumFractionDigits: 3, maximumFractionDigits: 3 })}</b> (${classificardorCorrelacao(correlacao)})` : `Correlação não calculável`}`
        )
    }

    if (window.hasOwnProperty('graficoResultadoBolsonaroPorModeloUrnaPorMunicipioPorIDHM') && graficoResultadoBolsonaroPorModeloUrnaPorMunicipioPorIDHM) {
        graficoResultadoBolsonaroPorModeloUrnaPorMunicipioPorIDHM.destroy();
    }

    window.graficoResultadoBolsonaroPorModeloUrnaPorMunicipioPorIDHM = new Chart($('#graficoResultadoBolsonaroPorModeloUrnaPorMunicipioPorIDHMCanvas'), {
        type: 'mixed',
        data: {
            datasets: datasets
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: `Percentual de votos do Bolsonaro no segundo turno por município por IDH-M por modelo de urna eletrônica`,
                    font: {
                        size: 14
                    }
                },
                chartAreaBorder: {
                    borderColor: '#636363',
                    borderWidth: 2,
                },
                legend: {
                    display: false
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
                            return `${tooltipItem[0].label}/${municipios[tooltipItem[0].datasetIndex].sigla}`
                        },
                        label: function (tooltipItem) {
                            return [`% Bolsonaro: ${tooltipItem.raw.y.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })}`,
                            `IDH-M:  ${tooltipItem.raw.x.toLocaleString("pt-BR", { style: 'decimal', minimumFractionDigits: 3, maximumFractionDigits: 3 })}`,
                            `UE 2020:  ${(municipios[tooltipItem.datasetIndex].eleitores_aptos_ue_2020_perc.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 }))}`];
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
                    ticks: {
                        padding: 10,
                        callback: function (value, index, values) {
                            return value.toLocaleString("pt-BR", { style: 'decimal', minimumFractionDigits: 3, maximumFractionDigits: 3 });
                        }
                    },
                    grid: {
                        color: `#bdbdbd`,
                        drawTicks: false,
                        z: -1
                    },
                    title: {
                        display: true,
                        text: 'IDH-M',
                        align: 'center'
                    }
                },
                y: {
                    type: 'linear',
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
                        text: '% Bolsonaro',
                        align: 'middle'
                    },
                },
            }
        },
        plugins: [chartAreaBorder]
    })
}