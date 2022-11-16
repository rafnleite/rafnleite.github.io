function criarTabelaUrnasUnanimes() {

    if (window.hasOwnProperty('tabelaUrnasUnanimes'))
        $(`#tabelaUrnasUnanimes`).DataTable().destroy();
    window.tabelaUrnasUnanimes = $(`#tabelaUrnasUnanimes`).DataTable({
        data: urnasUnanimes,
        dom: 'lrftp',
        columns: [
            {
                title: 'Estado',
                data: 'SG_UF',
                class: 'small text-center align-middle'
            },
            {
                title: 'Município',
                data: 'NM_MUNICIPIO',
                class: 'small text-center align-middle'
            },
            {
                title: 'Zona/Seção',
                data: 'NR_ZONA',
                class: 'small text-center align-middle',
                render: function (data, type, full, meta) {
                    if (type == 'sort')
                        return `${pad(full.NR_ZONA, 4)}_${pad(full.NR_SECAO, 4)}`
                    return `Z:${full.NR_ZONA} | S:${full.NR_SECAO}`
                }
            },
            {
                title: 'Local',
                data: 'NM_LOCAL_VOTACAO',
                class: 'small text-center align-middle',
                render: function (data, type, full, meta) {
                    return `${full.NM_LOCAL_VOTACAO}${criarTags(full.tags)}<br><small>${full.DS_LOCAL_VOTACAO_ENDERECO}</small>`
                }
            },
            {
                title: 'Votos Lula',
                data: 'LULA',
                class: 'small text-center align-middle',
                render: function (data, type, full, meta) {
                    if (type == 'sort')
                        return data
                    return data ? `<b>${data}</b>` : data
                }
            },
            {
                title: 'Votos Bolsonaro',
                data: 'BOLSONARO',
                class: 'small text-center align-middle',
                render: function (data, type, full, meta) {
                    if (type == 'sort')
                        return data
                    return data ? `<b>${data}</b>` : data
                }
            },
        ]
    })

    $(`#tabelaUrnasUnanimesLegenda`).html(criarTags([{
        tipo: `TI`,
        nome: `TERRAS INDÍGENAS`
    },
    {
        tipo: `CDP`,
        nome: `UNIDADES PRISIONAIS`
    },
    {
        tipo: `QUILOMBOLA`,
        nome: `COMUNIDADES QUILOMBOLAS`
    },
    {
        tipo: `MST`,
        nome: `ASSENTAMENTOS MST`
    },
    {
        tipo: `RURAL`,
        nome: `POVOADOS RURAIS`
    },
    {
        tipo: `POUCO`,
        nome: `MENOS QUE 100 ELEITORES`
    }]))
}