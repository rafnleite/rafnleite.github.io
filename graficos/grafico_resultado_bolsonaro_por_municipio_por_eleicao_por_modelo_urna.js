
function criarGraficoResultadoBolsonaroPorMunicipioPorEleicaoPorModeloUrna() {
    UF = $('#graficoResultadoBolsonaroPorMunicipioPorEleicaoPorModeloUrnaSelector').val()
    let municipios = centroideMunicipios.features.map(x => x.properties).filter(x => x.sigla == UF || 'BR' == UF)
    let datasets = []

    let maximoEleitoresPorMunicipio = getMaximoValor(municipios.map(x => x.eleitores_aptos))

    for (let i = 0; i < municipios.length; i++) {
        let dataset = {}
        dataset.type = 'bubble'
        dataset.label = municipios[i].nm_mun
        dataset.data = [{
            x: municipios[i].bolsonaro_perc,
            y: municipios[i].bolsonaro_2018_perc,
            r: 3 + 15 * municipios[i].eleitores_aptos / maximoEleitoresPorMunicipio
        }]

        let rgb = chroma.mix("#FFC400", "#FF0000", municipios[i].eleitores_aptos_ue_2020_perc).rgb()
        let r = rgb[0]
        let g = rgb[1]
        let b = rgb[2]

        dataset.backgroundColor = `rgb(${r},${g},${b})`
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

    let correlacao = municipios.filter(mun => mun.bolsonaro_2018_perc != null && mun.bolsonaro_perc != null).length > 1 ? ss.sampleCorrelation(municipios.filter(mun => mun.idhm).map(mun => mun.bolsonaro_2018_perc), municipios.filter(mun => mun.idhm).map(mun => mun.bolsonaro_perc)) : null

    $(`#graficoResultadoBolsonaroPorMunicipioPorEleicaoPorModeloUrnaInfo`).html(`${correlacao != null ? `Correlação (% Bolsonaro 2022 × % Bolsonaro 2018): <b>${correlacao.toLocaleString("pt-BR", { style: 'decimal', minimumFractionDigits: 3, maximumFractionDigits: 3 })}</b> (${classificardorCorrelacao(correlacao)})` : `Correlação não calculável`}`)

    if (window.hasOwnProperty('graficoResultadoBolsonaroPorMunicipioPorEleicaoPorModeloUrna') && graficoResultadoBolsonaroPorMunicipioPorEleicaoPorModeloUrna) {
        graficoResultadoBolsonaroPorMunicipioPorEleicaoPorModeloUrna.destroy();
    }

    window.graficoResultadoBolsonaroPorMunicipioPorEleicaoPorModeloUrna = new Chart($('#graficoResultadoBolsonaroPorMunicipioPorEleicaoPorModeloUrnaCanvas'), {
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
                            return [`% Bolsonaro 2022: ${tooltipItem.raw.x.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })}`,
                            `% Bolsonaro 2018:  ${tooltipItem.raw.y.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })}`,
                            ``,
                            `Diferença:  ${100 * (tooltipItem.raw.x - tooltipItem.raw.y).toLocaleString("pt-BR", { style: 'decimal', minimumFractionDigits: 1, maximumFractionDigits: 1})} pp`];
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
                        text: '% Bolsonaro 2022',
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
                        text: '% Bolsonaro 2018',
                        align: 'middle'
                    },
                },
            }
        },
        plugins: [chartAreaBorder]
    })
}