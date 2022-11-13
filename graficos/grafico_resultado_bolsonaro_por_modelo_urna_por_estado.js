
console.log('oi')
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
        data: [{ y: 0, x: 0 }, { y: 1, x: 1 }],
        fill: true,
        backgroundColor: "#FFD6CD80",
        borderColor: "#FFD6CD80",
        pointRadius: 0,
        pointHoverRadius: 0,
        pointBorderWidth: 0,
        borderWidth: 0
    })
    console.log(datasets)

    const graficoResultadoBolsonaroPorModeloUrnaPorEstado = new Chart($('#graficoResultadoBolsonaroPorModeloUrnaPorEstadoCanvas'), {
        type: 'mixed',
        data: {
            datasets: datasets
        },
        options: {
            responsive: true,
            aspectRatio: 1,
            maintainAspectRatio: true,
            hover: { mode: null },
            layout: {
                padding: {
                    left: 10,
                    right: 25,
                    top: 25,
                    bottom: 0
                }
            },
            legend: {
                labels: {
                    filter: function (item, chart) {
                        return (!(estadosPorRegiao.map(x => x.NOME).includes(item.text)));
                    }
                },
                onClick: function (e, legendItem) {
                    var index = legendItem.datasetIndex;
                    var ci = this.chart;
                    var alreadyHidden = (ci.getDatasetMeta(index).hidden === null) ? false : ci.getDatasetMeta(index).hidden;
                    ci.data.datasets.forEach(function (e, i) {
                        var meta = ci.getDatasetMeta(i);
                        console.log(meta)
                        if (i === index) {
                            if (alreadyHidden) {
                                meta.hidden = meta.hidden === null ? !meta.hidden : null;
                            } else if (meta.hidden === null) {
                                meta.hidden = true;
                            }
                        }
                    });

                    ci.update();
                }
            },
            scales: {
                xAxes: [{
                    type: 'linear',
                    text: '% Bolsonaro UE 2020',
                    ticks: {
                        maxTicksLimit: 5,
                        padding: 10,
                        min: 0,
                        max: 1,
                        callback: function (value, index, values) {
                            return value.toLocaleString("pt-BR", { style: 'percent', });
                        }
                    },
                    gridLines: {
                        color: `rgb(234, 236, 244)`,
                        zeroLineColor: `rgb(234, 236, 244)`,
                        drawBorder: false,
                        borderDash: [2],
                        zeroLineBorderDash: [2]
                    },
                    scaleLabel: {
                        display: true,
                        labelString: '% Bolsonaro UE 2020'
                    }
                }],
                yAxes: [{
                    type: 'linear',
                    ticks: {
                        maxTicksLimit: 5,
                        padding: 10,
                        min: 0,
                        max: 1,
                        callback: function (value, index, values) {
                            return value.toLocaleString("pt-BR", { style: 'percent', });
                        }
                    },
                    gridLines: {
                        color: `rgb(234, 236, 244)`,
                        zeroLineColor: `rgb(234, 236, 244)`,
                        drawBorder: false,
                        borderDash: [2],
                        zeroLineBorderDash: [2]
                    },
                    scaleLabel: {
                        display: true,
                        labelString: '% Bolsonaro UE antiga'
                    },
                }],
            },
            tooltips: {
                backgroundColor: "rgba(255,255,255,1)",
                bodyFontColor: "#858796",
                titleMarginBottom: 10,
                titleFontColor: '#6e707e',
                titleFontSize: 14,
                borderColor: '#dddfeb',
                borderWidth: 1,
                xPadding: 15,
                yPadding: 15,
                displayColors: false,
                intersect: false,
                caretPadding: 10,
                callbacks: {
                    title: function (tooltipItem, chart) {
                        return chart.datasets[tooltipItem[0].datasetIndex].label
                    },
                    label: function (tooltipItem, chart) {
                        var datasetLabel = chart.datasets[tooltipItem.datasetIndex].label || '';
                        return [`UE 2020:  ${(tooltipItem.xLabel.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 }))}`,
                        `UE antiga:  ${(tooltipItem.yLabel.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 }))}`,
                        ``,
                        `Diferença: ${(tooltipItem.xLabel - tooltipItem.yLabel).toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })}`];
                    }
                }
            }
        }
    })
}