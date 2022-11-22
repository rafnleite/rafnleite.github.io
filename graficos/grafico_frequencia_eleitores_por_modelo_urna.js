
function criarGraficoFrequenciaEleitoresPorModeloUrna() {

    frequencia_eleitores_urna = document.getElementById('graficoFrequnciaEleitoresPorModeloUrnaCanvas');

    // let options = {
    //     showlegend: true,
    //     legend: {
    //         orientation: "h",
    //         yanchor: "bottom",
    //         y: 1.02,
    //         xanchor: "right",
    //         x: 1
    //     },
    //     title: {
    //         text: 'Frequência de número de eleitores por seção eleitoral por modelo de urna.',
    //         font: {
    //             size: 14
    //         }
    //     },
    //     xaxis: {
    //         title: {
    //             text: 'Frequência'
    //         },
    //         dtick: 500,
    //         showgrid: true,
    //         zeroline: true,
    //         showline: true,
    //         mirror: 'ticks',
    //         gridcolor: '#bdbdbd',
    //         gridwidth: 2,
    //         linecolor: '#636363',
    //         linewidth: 2,
    //         range: [-3000, 3000],
    //     },
    //     yaxis: {
    //         title: {
    //             text: 'Número de eleitores'
    //         },
    //         dtick: 100,
    //         showgrid: true,
    //         showline: true,
    //         mirror: 'ticks',
    //         gridcolor: '#bdbdbd',
    //         gridwidth: 1,
    //         linecolor: '#636363',
    //         linewidth: 2,
    //         range: [0, 800]
    //     },
    // }

    let urnas_2020 = votacaoPorUrna.filter(x => x.DS_MODELO_URNA == "2020")
    let urnas_antigas = votacaoPorUrna.filter(x => x.DS_MODELO_URNA != "2020")
    let maximo = getMaximoValor(votacaoPorUrna.map(x => x.QT_APTOS))

    urnas_2020 = groupBy(urnas_2020, 'QT_APTOS')
    urnas_antigas = groupBy(urnas_antigas, 'QT_APTOS')


    var numero_eleitores = []
    var freq_2020 = []
    var freq_antigas = []

    for (let i = 0; i <= maximo; i++) {
        numero_eleitores.push(i)
        freq_2020.push(urnas_2020.hasOwnProperty(i) ? urnas_2020[i].length : 0)
        freq_antigas.push(urnas_antigas.hasOwnProperty(i) ? urnas_antigas[i].length : 0)
    }


    let data = {
        labels: numero_eleitores,
        datasets: [{
            label: 'UE - 2020',
            data: freq_2020,
            backgroundColor: getColor(4),
            borderWidth: 0
        }, {
            label: 'UE - antiga',
            data: freq_antigas.map(x => x * -1),
            backgroundColor: getColor(3),
            borderWidth: 0
        }]
    }

    // Plotly.plot(frequencia_eleitores_urna, [
    //     {
    //         type: 'bar',
    //         x: freq_antigas.map(x => x * -1),
    //         y: numero_eleitores,
    //         orientation: 'h',
    //         name: 'Frequência de eleitores - UE antiga',
    //         text: freq_antigas,
    //         hoverinfo: 'text+y',
    //     },
    //     {
    //         type: 'bar',
    //         x: freq_2020,
    //         y: numero_eleitores,
    //         orientation: 'h',
    //         name: 'Frequência de eleitores - UE 2020',
    //         hoverinfo: 'x+y'
    //     }
    // ], options);




    const graficoFrequnciaEleitoresPorModeloUrnaCanvas2 = new Chart($('#graficoFrequnciaEleitoresPorModeloUrnaCanvas2'), {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            indexAxis: 'y',
            categoryPercentage: 1,
            barPercentage: 1,
            plugins: {
                chartAreaBorder: {
                    borderColor: '#636363',
                    borderWidth: 2,
                },
                title: {
                    display: true,
                    text: `Histograma - Número de elitores por modelo de urna`,
                    font: {
                        size: 14
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
                    callbacks: {
                        title: function (tooltipItem) {
                            return tooltipItem[0].label
                        },
                        label: function (tooltipItem) {
                            return [`UE 2020:  ${(tooltipItem.raw)}`,
                            `UE antiga:  ${(tooltipItem.raw.y.toLocaleString("pt-BR", { style: 'decimal', minimumFractionDigits: 3, maximumFractionDigits: 3 }))}`];
                        }
                    }
                }
            },
            scales: {
                y: {
                    text: 'Frequência',
                    min: 1,
                    max: 600,
                    reverse: true,
                    ticks: {
                        padding: 10,
                        autoSkip: false,
                        callback: value => [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600].includes(value) ? value : undefined,
                    },
                    grid: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'Número de eleitores',
                        align: 'middle'
                    },
                    stacked: true
                },
                x: {
                    stacked: true,
                    min: -3000,
                    max: 3000,
                    text: 'Eleitores',
                    ticks: {
                        maxTicksLimit: 10,
                        padding: 10,
                        callback: function (value, index, values) {
                            return Math.abs(value);
                        }
                    },
                    grid: {
                        color: `#bdbdbd`,
                        drawTicks: false,
                        z: -1
                    },
                    title: {
                        display: true,
                        text: 'Frequência',
                        align: 'middle'
                    },
                },
            },
        },
        plugins: [chartAreaBorder]
    })
}