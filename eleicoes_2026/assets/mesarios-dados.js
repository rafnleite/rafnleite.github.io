/* Restaura os dados estáticos da edição web antes de ativar filtros e consultas. */
window.dadosMesariosProntos = (async function () {
    const estado = document.getElementById("estado-dados-mesarios");
    const blocos = Array.from(document.querySelectorAll("[data-bloco-mesarios]"));

    async function ler(bloco) {
        const resposta = await fetch(bloco.dataset.blocoMesarios);
        if (!resposta.ok) throw new Error("Falha ao carregar o arquivo");
        const dados = new Uint8Array(await resposta.arrayBuffer());
        // Alguns servidores já desfazem a compressão na resposta HTTP.
        if (dados[0] === 0x1f && dados[1] === 0x8b) {
            const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream("gzip"));
            return new Response(fluxo).text();
        }
        return new TextDecoder("utf-8", {fatal: true}).decode(dados);
    }

    try {
        estado.hidden = false;
        const textos = await Promise.all(blocos.map(ler));
        for (const [indice, bloco] of blocos.entries()) {
            if (bloco.tagName === "SCRIPT") {
                bloco.textContent = textos[indice];
            } else {
                const molde = document.createElement("template");
                molde.innerHTML = textos[indice];
                bloco.replaceChildren(molde.content);
            }
        }
        estado.hidden = true;
        return true;
    } catch {
        const repetir = document.createElement("button");
        repetir.type = "button";
        repetir.textContent = "Tentar novamente";
        repetir.addEventListener("click", () => location.reload());
        const arquivos = document.createElement("a");
        arquivos.href = "relatorio.html#arquivos";
        arquivos.textContent = "Baixar o pacote completo";
        estado.replaceChildren("Não foi possível abrir os dados interativos. ", repetir, " · ", arquivos);
        estado.hidden = false;
        return false;
    }
})();
