
function criarGraficoSimulacaoVotosRetasDiagnais() {


    datasets = [{
        type: 'scatter',
        label: 'Grupo 1 (100 votos)',
        data: [{
            x: 50,
            y: 50
        }, {
            x: 70,
            y: 30
        }, {
            x: 25,
            y: 75
        }, {
            x: 40,
            y: 60
        }],
        backgroundColor: '#e6194B'
    },
    {
        type: 'scatter',
        label: 'Grupo 2 (200 votos)',
        data: [{
            x: 90,
            y: 110
        }, {
            x: 60,
            y: 140
        }, {
            x: 120,
            y: 80
        }, {
            x: 130,
            y: 70
        }],
        backgroundColor: '#3cb44b'
    },
    {
        type: 'scatter',
        label: 'Grupo 3 (300 votos)',
        data: [{
            x: 190,
            y: 110
        }, {
            x: 230,
            y: 70
        }, {
            x: 250,
            y: 50
        }, {
            x: 75,
            y: 225
        }],
        backgroundColor: '#4363d8'
    },
    {
        type: 'scatter',
        label: 'Grupo 4 (400 votos)',
        data: [{
            x: 200,
            y: 200
        }, {
            x: 300,
            y: 100
        }, {
            x: 150,
            y: 250
        }, {
            x: 175,
            y: 225
        }],
        backgroundColor: '#f58231'
    },
    {
        type: 'line',
        data: [{
            x: -100,
            y: 200
        }, {
            x: 200,
            y: -100
        }
        ],
        borderColor: '#f28ca5'
    },
    {
        type: 'line',
        data: [{
            x: -100,
            y: 300
        }, {
            x: 300,
            y: -100
        }
        ],
        borderColor: '#9dd9a5'
    },
    {
        type: 'line',
        data: [{
            x: -100,
            y: 400
        }, {
            x: 400,
            y: -100
        }
        ],
        borderColor: '#a1b1eb'
    },
    {
        type: 'line',
        data: [{
            x: -100,
            y: 500
        }, {
            x: 500,
            y: -100
        }
        ],
        borderColor: '#fac098'
    }
    ]




    if (window.hasOwnProperty('graficoSimulacaoVotosRetasDiagnais') && graficoSimulacaoVotosRetasDiagnais) {
        graficoSimulacaoVotosRetasDiagnais.destroy();
    }

    window.graficoSimulacaoVotosRetasDiagnais = new Chart($('#graficoSimulacaoVotosRetasDiagnaisCanvas'), {
        type: 'mixed',
        data: {
            datasets: datasets
        },
        options: {
            pointRadius: 5,
            plugins: {
                title: {
                    display: true,
                    text: `Simulação de votos em grupos com mesmo somatório (L + B constantes)`,
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
                            return (item.text);
                        }
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
                            return tooltipItem[0].dataset.label
                        },
                        label: function (tooltipItem) {
                            return [`Bolsonaro: ${tooltipItem.raw.x}`,
                            `Lula:  ${tooltipItem.raw.y}`];
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
                    max: 350,
                    ticks: {
                        padding: 10,
                    },
                    grid: {
                        color: `#bdbdbd`,
                        drawTicks: false,
                        z: -1
                    },
                    title: {
                        display: true,
                        text: 'Votos Bolsonaro',
                        align: 'center'
                    }
                },
                y: {
                    type: 'linear',
                    min: 0,
                    max: 350,
                    ticks: {
                        padding: 10,
                    },
                    grid: {
                        color: `#bdbdbd`,
                        drawTicks: false,
                        z: -1
                    },
                    title: {
                        display: true,
                        text: 'Votos Lula',
                        align: 'middle'
                    },
                },
            }
        },
        plugins: [chartAreaBorder]
    })
}