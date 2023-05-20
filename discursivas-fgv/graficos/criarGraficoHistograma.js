function criarGraficoHistograma(div, obj) {
    var dataPairs = Object.entries(obj);
    dataPairs = dataPairs.map(d => d[0] != "Reclassificado" ? [Number(d[0]), d[1]] : [d[0], d[1]]);
    dataPairs.sort((a, b) => a[0] == "Reclassificado" ? 1 : b[0] == "Reclassificado" ? -1 : a[0] - b[0]);

    // Separar os rótulos e valores ordenados
    var labels = dataPairs.map(pair => pair[0]);
    var values = dataPairs.map(pair => pair[1]);

    // Configurar os dados do gráfico
    var data = {
        labels: labels,
        datasets: [{
            label: 'Frequências',
            data: values,
            backgroundColor: 'rgba(75, 192, 192, 0.6)',
            borderWidth: 1
        }]
    };

    // Configurar as opções do gráfico
    var options = {
        responsive: true,
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Valores'
                }
            },
            y: {
                title: {
                    display: true,
                    text: 'Contagens'
                },
                ticks: {
                    stepSize: 1, // Define o espaçamento unitário
                    beginAtZero: true
                }
            }
        }
    };

    // Criar o gráfico usando Chart.js
    var ctx = document.getElementById(div).getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: data,
        options: options
    });
}