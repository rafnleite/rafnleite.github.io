function criarTabelaConcurso(dados) {

    if (window.hasOwnProperty('tabelaConcurso')) {
        $(`#tabelaConcurso`).DataTable().destroy();
    }

    colunas = [];
    candidatos = dados.Candidatos.map(c => {
        return {
            "Inscrição": c.Inscrição,
            "Nome": c.Nome,
            "Posição Definitiva": c["Posição Definitiva"],
            "Posição Preliminar": c["Posição Preliminar"],
            "Resultado Definitivo": c["Resultado Definitivo"],
            "Resultado Preliminar": c["Resultado Preliminar"],
            "Prova Objetiva": c["Resultado Objetiva"]["Prova Objetiva"],
        }
    });

    colunas.push({
        title: 'Posição definitiva',
        data: 'Posição Definitiva',
        class: 'small text-center align-middle',
        render: function (data, type, full, meta) {
            if (type == 'sort' || type == 'type') {
                return data;
            }

            if (full["Posição Definitiva"] != full["Posição Preliminar"]) {
                if (full["Posição Preliminar"] != null) {
                    let variação = full["Posição Preliminar"] - full["Posição Definitiva"]
                    return `${full["Posição Definitiva"]} (${variação > 0 ? `▲ ${variação}` : `▼ ${-1 * variação}`})`;
                } else {
                    return `${full["Posição Definitiva"]} (★)`;
                }
            } else {
                return data;
            }
        }
    });

    colunas.push({
        title: 'Inscrição',
        data: 'Inscrição',
        class: 'small text-center align-middle'
    });

    colunas.push({
        title: 'Nome',
        data: 'Nome',
        class: 'small text-center align-middle'
    });

    colunas.push({
        title: 'Prova Objetiva',
        data: 'Prova Objetiva',
        class: 'small text-center align-middle'
    });

    console.log(dados)
    for (Questão in dados.Questões) {
        let q = dados.Questões[Questão]
        console.log(q)
        colunas.push({
            title: q.Nome,
            data: "Resultado Definitivo",
            class: 'small text-center align-middle',
            render: function (data, type, full, meta) {
                // console.log(full);
                if (full["Resultado Preliminar"]) {
                    if (full["Resultado Preliminar"][q.Nome] != full["Resultado Definitivo"][q.Nome]) {
                        return `<s>${full["Resultado Preliminar"][q.Nome]}</s> <b>${full["Resultado Definitivo"][q.Nome]}</b>`;
                    }
                    return full["Resultado Definitivo"][q.Nome];
                } else {
                    return full["Resultado Definitivo"][q.Nome];
                }
            }
        });
    }

    colunas.push({
        title: 'Prova Discursiva',
        data: 'Prova Discursiva',
        class: 'small text-center align-middle',
        render: function (data, type, full, meta) {
            if (full["Resultado Preliminar"]) {
                if (full["Resultado Preliminar"]["Prova Discursiva"] != full["Resultado Definitivo"]["Prova Discursiva"]) {
                    return `<s>${full["Resultado Preliminar"]["Prova Discursiva"]}</s> <b>${full["Resultado Definitivo"]["Prova Discursiva"]}</b>`;
                }
                return full["Resultado Definitivo"]["Prova Discursiva"];
            } else {
                return full["Resultado Definitivo"]["Prova Discursiva"];
            }
        }
    });

    colunas.push({
        title: 'Total',
        data: 'Prova Objetiva',
        class: 'small text-center align-middle',
        render: function (data, type, full, meta) {
            return full["Resultado Definitivo"]["Prova Discursiva"] + full["Prova Objetiva"];
        }
    });

    window.tabelaConcurso = $(`#tabelaConcurso`).DataTable({
        data: candidatos.filter(d => d["Posição Definitiva"]),
        dom: 'rft',
        pageLength: -1,
        columns: colunas
    });

}