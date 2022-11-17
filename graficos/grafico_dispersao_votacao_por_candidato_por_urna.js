
function criarGraficoDispersao() {

    dispersao_UE_2020 = document.getElementById('graficoDispersaoUrnas2020Canvas');
    dispersao_UE_antiga = document.getElementById('graficoDispersaoUrnasAntigasCanvas');

    let linhasReferencia = [{
        type: 'scattergl',
        mode: "lines",
        name: "350 votos",
        hoverinfo: 'skip',
        rangeColor: [1, 50],
        marker: {
            color: '#FFA600',
            line: {
                width: 1
            }
        },
        x: [0, 350],
        y: [350, 0]
    },
    {
        type: 'scattergl',
        mode: "lines",
        name: "450 votos",
        hoverinfo: 'skip',
        rangeColor: [1, 50],
        marker: {
            color: '#FF0000',
            line: {
                width: 1
            }
        },
        x: [0, 450],
        y: [450, 0]
    }]

    let options = {
        showlegend: true,
        legend: {
            orientation: "h",
            yanchor: "bottom",
            y: 1.02,
            xanchor: "right",
            x: 1
        },
        xaxis: {
            title: {
                text: 'Votos Bolsonaro'
            },
            dtick: 50,
            showgrid: true,
            zeroline: true,
            showline: true,
            mirror: 'ticks',
            gridcolor: '#bdbdbd',
            gridwidth: 1,
            linecolor: '#636363',
            linewidth: 2,
            range: [0, 550]
        },
        yaxis: {
            title: {
                text: 'Votos Lula'
            },
            dtick: 50,
            showgrid: true,
            showline: true,
            mirror: 'ticks',
            gridcolor: '#bdbdbd',
            gridwidth: 1,
            linecolor: '#636363',
            linewidth: 2,
            range: [0, 550]
        },
        title: {
            text: 'Distribuição dos votos por seção - UE 2020',
            font: {
                size: 14
            }
        },
        height: 480,
        width: 480
    }

    let config = {displayModeBar: false}

    let urnas_2020 = votacaoPorUrna.filter(x => x.DS_MODELO_URNA == "2020")
    let urnas_antigas = votacaoPorUrna.filter(x => x.DS_MODELO_URNA != "2020")

    // y = urnas_2020.map(x => x.BOLSONARO)
    // x = urnas_2020.map(x => x.LULA)

    // y = urnas_antigas.map(x => x.BOLSONARO)
    // x = urnas_antigas.map(x => x.LULA)

    urnas_2020.map(x => x.key = `${x.BOLSONARO}_${x.LULA}`)
    urnas_2020 = groupBy(urnas_2020, 'key')
    var y_2020 = []
    var x_2020 = []
    var cor_2020 = []
    for (par in urnas_2020) {
        x_2020.push(Number(par.split('_')[0]))
        y_2020.push(Number(par.split('_')[1]))
        cor_2020.push(urnas_2020[par].length)
    }

    urnas_antigas.map(x => x.key = `${x.BOLSONARO}_${x.LULA}`)
    urnas_antigas = groupBy(urnas_antigas, 'key')
    var y_antigas = []
    var x_antigas = []
    var cor_antigas = []
    for (par in urnas_antigas) {
        x_antigas.push(Number(par.split('_')[0]))
        y_antigas.push(Number(par.split('_')[1]))
        cor_antigas.push(urnas_antigas[par].length)
    }

    Plotly.plot(dispersao_UE_2020, [
        {
            type: 'scattergl',
            mode: "markers",
            hoverinfo: 'skip',
            showlegend: false,
            rangeColor: [1, 50],
            marker: {
                colorscale: [
                    ['0.0', '#33bbff80'],
                    ['1.0', '#1A0077']
                ],
                cmax: 35,
                cmin: 1,
                colorbar: {
                    thickness: 15,
                },
                color: cor_2020,
                size: 2
            },
            x: x_2020,
            y: y_2020
        }
    ].concat(linhasReferencia), options, config);

    options.title = {
        text: 'Distribuição dos votos por seção - UE antiga',
        font: {
            size: 14
        }
    }
    
    Plotly.plot(dispersao_UE_antiga, [{
        type: 'scattergl',
        mode: "markers",
        hoverinfo: 'skip',
        showlegend: false,
        marker: {
            colorscale: [
                ['0.0', '#33bbff80'],
                ['1.0', '#1A0077']
            ],
            cmax: 35,
            cmin: 1,
            colorbar: {
                thickness: 15,
            },
            color: cor_antigas,
            size: 2,
            line: {
                width: 0
            },

        },
        x: x_antigas,
        y: y_antigas
    }].concat(linhasReferencia), options, config);

}