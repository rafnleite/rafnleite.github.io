function criarMapaUrnasAtrasadas() {

    $('.colorScaleVotos').each(function () {
        atualizarPaletaDeCores($(this), chroma.scale(["#004E04", "#FF0000"]).colors(60))
    })
    let bounds = [
        [-90, -180], // Northeast coordinates
        [90, 180] // Southwest coordinates
    ];
    let mapCenter = [-15.7, -53.2];

    window.mapaUrnasAtrasadas = L.map('mapaUrnasAtrasadas', {
        zoom: 4,
        minZoom: 1,
        maxZoom: 18,
        maxBounds: bounds,
        center: mapCenter,
        preferCanvas: true
    });

    window.myRenderer = L.canvas({
        padding: 0.5
    });

    L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/light-v9/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoicmFmYWVsbmxlaXRlIiwiYSI6ImNsYW42bHR0NDBtNXozb250Z2JxamF2bW0ifQ.GDItGW-VtqsNm1qqDmnRzg', {
        maxNativeZoom: 19, // OSM max available zoom is at 19.
        maxZoom: 22, // Match the map maxZoom, or leave map.options.maxZoom undefined.
        attribution: `ranleite`
    }).addTo(mapaUrnasAtrasadas);

    mapaUrnasAtrasadas.markersLocais = L.featureGroup()

    mapaUrnasAtrasadas.createPane('markersLocaisPane');
    mapaUrnasAtrasadas.createPane('estadosGeometriaPane');
    mapaUrnasAtrasadas.getPane('markersLocaisPane').style.zIndex = 500;
    mapaUrnasAtrasadas.getPane('estadosGeometriaPane').style.zIndex = 400;

}

function atualizarMapaUrnasAtrasadas(urnasAtrasadasFiltradas) {
    if (window.hasOwnProperty('markersLocais'))
    mapaUrnasAtrasadas.removeLayer(markersLocais);
    if (window.hasOwnProperty('estadosGeometria'))
    mapaUrnasAtrasadas.removeLayer(estadosGeometria);

    window.markersLocais = L.geoJson(urnasAtrasadasFiltradas, {
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                pane: 'markersLocaisPane',
                radius: 3 + 4 * (feature.properties.qt_aptos / 400),
                fillColor: chroma.mix("#00FF0D", "#FF0000", (feature.properties.lula/(feature.properties.bolsonaro + feature.properties.lula))),
                color: "#000",
                weight: 0,
                opacity: 0,
                fillOpacity: 0.5
            })
        },
        onEachFeature: tooltipUrnas
    }).addTo(mapaUrnasAtrasadas)

    console.log(window.markersLocais)

    window.estadosGeometria = L.geoJson(estadosShape, {
        style: {
            pane: 'estadosGeometriaPane',
            fillColor: "#E0E0E0",
            color: "#000000",
            weight: 2,
            fillOpacity: 0.3
        }
    }).addTo(mapaUrnasAtrasadas)

    mapaUrnasAtrasadas.invalidateSize()
}

function tooltipMunicipios(feature, layer) {
    layer.bindPopup(function () {
        return `<div class="h6">${feature.properties.nm_mun}/${feature.properties.sigla}</div>
        Eleitores aptos: ${feature.properties.eleitores_aptos.toLocaleString('pt-Br')}<br>
        UE 2020: ${feature.properties.eleitores_aptos_ue_2020.toLocaleString('pt-Br')} (${feature.properties.eleitores_aptos_ue_2020_perc.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})<br>
        UE antiga: ${feature.properties.eleitores_aptos_ue_antiga.toLocaleString('pt-Br')} (${feature.properties.eleitores_aptos_ue_antiga_perc.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})<br>
        <hr>
        ${feature.properties.bolsonaro > feature.properties.lula ?
                `Bolsonaro: ${feature.properties.bolsonaro.toLocaleString('pt-Br')} (${feature.properties.bolsonaro_perc.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})<br>
        Lula: ${feature.properties.lula.toLocaleString('pt-Br')} (${feature.properties.lula_perc.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})` :
                `Lula: ${feature.properties.lula.toLocaleString('pt-Br')} (${feature.properties.lula_perc.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})<br>
        Bolsonaro: ${feature.properties.bolsonaro.toLocaleString('pt-Br')} (${feature.properties.bolsonaro_perc.toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})`
            }`
    })
}

function tooltipUrnas(feature, layer) {
    layer.bindPopup(function () {
        let atraso = feature.properties.atraso.split(`:`) 
        return `<b>Zona ${pad(feature.properties.nr_zona,4)} Seção ${pad(feature.properties.nr_secao,4)}<br>
        ${feature.properties.nm_municipio}/${feature.properties.sg_uf}</b><br>
        <small>${feature.properties.nm_local_votacao} - ${feature.properties.nm_bairro}</small><br>
        Atraso: ${Number(atraso[0]) > 0 ? 
            `${Number(atraso[0])} hora${atraso[0] > 1 ?
                 's' : ''}` : ''}${(atraso[0] > 0 && atraso[1] > 0) ? ` e ` : ``}${Number(atraso[1]) > 0 ? `${Number(atraso[1])} minuto${atraso[1] > 1 ? 's' : ''}` : ``}<br>
        Eleitores aptos: ${feature.properties.qt_aptos.toLocaleString('pt-Br')}<br>
        Modelo de urna: ${feature.properties.ds_modelo_urna}<br>
        <hr>
        ${feature.properties.bolsonaro > feature.properties.lula ?
                `Bolsonaro: ${feature.properties.bolsonaro.toLocaleString('pt-Br')} (${(feature.properties.bolsonaro / (feature.properties.bolsonaro + feature.properties.lula)).toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})<br>
        Lula: ${feature.properties.lula.toLocaleString('pt-Br')} (${(feature.properties.lula / (feature.properties.bolsonaro + feature.properties.lula)).toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})` :
                `Lula: ${feature.properties.lula.toLocaleString('pt-Br')} (${(feature.properties.lula / (feature.properties.bolsonaro + feature.properties.lula)).toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})<br>
        Bolsonaro: ${feature.properties.bolsonaro.toLocaleString('pt-Br')} (${(feature.properties.bolsonaro / (feature.properties.bolsonaro + feature.properties.lula)).toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})`
            }`
    })
}

