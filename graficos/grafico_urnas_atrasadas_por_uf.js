
function criarGraficoUrnasAtrasadas(urnasAtrasadasFiltradas) {

    let statsGrafico = urnasAtrasadasFiltradas.features.map(x => x.properties)
    statsGraficoAg = groupBy(statsGrafico,'sg_uf')
    contadorPorUF = []

    for (let uf in statsGraficoAg) {
        contadorPorUF.push({
            'uf': uf,
            'contagem': statsGraficoAg[uf].length
        })
    }

    contadorPorUF = contadorPorUF.sort((x, y) => y.contagem - x.contagem)

    const data = {
        labels: contadorPorUF.map(x => x.uf),
        datasets: [{
            label: 'UF',
            data: contadorPorUF.map(x => x.contagem),
            backgroundColor: contadorPorUF.map(x => getColorUF(x.uf)),
            barThickness: 15,
        }]
    }
    


        if(window.hasOwnProperty('graficoUrnasAtrasadas')) {
        console.log('entrou')
            graficoUrnasAtrasadas.data = data
            graficoUrnasAtrasadas.options.scales.x2.suggestedMax = getMaximoValor(contadorPorUF.map(x => x.contagem))
            graficoUrnasAtrasadas.update()
            return
        }

        console.log('passou')

    window.graficoUrnasAtrasadas = new Chart($('#graficoUrnasAtrasadasCanvas'), {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            indexAxis: 'y',
            animation: {
                    duration: 0
                },
            plugins: {
                chartAreaBorder: {
                    borderColor: '#636363',
                    borderWidth: 2,
                },
                title: {
                    display: true,
                    text: `Urnas não encerradas por UF`,
                    font: {
                        size: 14
                    }
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
                    caretPadding: 10
                }
            },
            scales: {
                y: {
                   ticks: {
                        padding: 10,
                    },
                    grid: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'UF',
                        align: 'middle'
                    },
                    stacked: true
                },
                x: {
                    stacked: true,
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
                        text: 'Número de urnas',
                        align: 'middle'
                    },
                },
                x2: {
                    position: 'top',
                    min: 0,
                    suggestedMax: getMaximoValor(contadorPorUF.map(x => x.contagem))
                },
            },
        },
        plugins: [chartAreaBorder]
    })
}