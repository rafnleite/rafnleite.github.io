function criarMapaLocaisMunicipiosDivergentes() {

    window.mapaMacapa = L.map('mapaMacapa', {
        zoom: 8,
        minZoom: 7,
        maxZoom: 18,
        maxBounds: [
        [2.5, -49],
        [-0.5, -52]
        ],
        center:[0.6, -50.5],
        preferCanvas: true
    });
    window.mapaPacaraima = L.map('mapaPacaraima', {
        zoom: 9,
        minZoom: 7,
        maxZoom: 18,
        maxBounds: [
            [3.1, -62.4],
            [5.6, -59.6]
            ],
        center:[4.1, -60.7],
        preferCanvas: true
    });
    window.mapaBonfim = L.map('mapaBonfim', {
        zoom: 9,
        minZoom: 7,
        maxZoom: 18,
        maxBounds: [
        [1.4, -59.2],
        [3.9, -60.9]
        ],
        center:[2.8, -60],
        preferCanvas: true
    });
    window.mapaPortoVelho = L.map('mapaPortoVelho', {
        zoom: 9,
        minZoom: 7,
        maxZoom: 18,
        maxBounds: [
        [-9.5, -64.6],
        [-7.2, -61.8]
        ],
        center:[-8.6, -63.4],
        preferCanvas: true
    });
    window.myRenderer = L.canvas({
        padding: 0.5
    });

    L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/light-v9/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoicmFmYWVsbmxlaXRlIiwiYSI6ImNrMm1tZTYyeDAyNGMzY3NqZ2xnb2c5OXQifQ.on3Iv5VGNdnlAjPaqwz84Q', {
        maxNativeZoom: 19, // OSM max available zoom is at 19.
        maxZoom: 22, // Match the map maxZoom, or leave map.options.maxZoom undefined.
        attribution: `ranleite`
    }).addTo(mapaMacapa)
    L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/light-v9/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoicmFmYWVsbmxlaXRlIiwiYSI6ImNrMm1tZTYyeDAyNGMzY3NqZ2xnb2c5OXQifQ.on3Iv5VGNdnlAjPaqwz84Q', {
        maxNativeZoom: 19, // OSM max available zoom is at 19.
        maxZoom: 22, // Match the map maxZoom, or leave map.options.maxZoom undefined.
        attribution: `ranleite`
    }).addTo(mapaPacaraima)
    L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/light-v9/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoicmFmYWVsbmxlaXRlIiwiYSI6ImNrMm1tZTYyeDAyNGMzY3NqZ2xnb2c5OXQifQ.on3Iv5VGNdnlAjPaqwz84Q', {
        maxNativeZoom: 19, // OSM max available zoom is at 19.
        maxZoom: 22, // Match the map maxZoom, or leave map.options.maxZoom undefined.
        attribution: `ranleite`
    }).addTo(mapaBonfim)
    L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/light-v9/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoicmFmYWVsbmxlaXRlIiwiYSI6ImNrMm1tZTYyeDAyNGMzY3NqZ2xnb2c5OXQifQ.on3Iv5VGNdnlAjPaqwz84Q', {
        maxNativeZoom: 19, // OSM max available zoom is at 19.
        maxZoom: 22, // Match the map maxZoom, or leave map.options.maxZoom undefined.
        attribution: `ranleite`
    }).addTo(mapaPortoVelho)

    atualizarMapaLocaisMunicipiosDivergentes()
}

function atualizarMapaLocaisMunicipiosDivergentes() {
    if (window.hasOwnProperty('markersLocais')) {
        mapaMacapa.removeLayer(markersLocais);
        mapaPacaraima.removeLayer(markersLocais);
        mapaBonfim.removeLayer(markersLocais);
        mapaPortoVelho.removeLayer(markersLocais);
    }

    window.markersMacapa = L.geoJson(locaisMacapa, {
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                radius: 3 + (7 * (feature.properties.eleitores_aptos) / 6800),
                fillColor: chroma.mix("#FFC400", "#FF0000", feature.properties.perc_eleitores_aptos_ue_2020),
                color: "#000",
                weight: 0,
                opacity: 0,
                fillOpacity: 0.7
            })
        },
        onEachFeature: tooltipLocais
    })
    window.markersPacaraima = L.geoJson(locaisPacaraima, {
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                radius: 3 + (7 * (feature.properties.eleitores_aptos) / 6800),
                fillColor: chroma.mix("#FFC400", "#FF0000", feature.properties.perc_eleitores_aptos_ue_2020),
                color: "#000",
                weight: 0,
                opacity: 0,
                fillOpacity: 0.7
            })
        },
        onEachFeature: tooltipLocais
    })
    window.markersBonfim = L.geoJson(locaisBonfim, {
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                radius: 3 + (7 * (feature.properties.eleitores_aptos) / 6800),
                fillColor: chroma.mix("#FFC400", "#FF0000", feature.properties.perc_eleitores_aptos_ue_2020),
                color: "#000",
                weight: 0,
                opacity: 0,
                fillOpacity: 0.7
            })
        },
        onEachFeature: tooltipLocais
    })
    window.markersPortoVelho = L.geoJson(locaisPortoVelho, {
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                radius: 3 + (7 * (feature.properties.eleitores_aptos) / 6800),
                fillColor: chroma.mix("#FFC400", "#FF0000", feature.properties.perc_eleitores_aptos_ue_2020),
                color: "#000",
                weight: 0,
                opacity: 0,
                fillOpacity: 0.7
            })
        },
        onEachFeature: tooltipLocais
    })

    markersMacapa.addTo(mapaMacapa)
    markersPacaraima.addTo(mapaPacaraima)
    markersBonfim.addTo(mapaBonfim)
    markersPortoVelho.addTo(mapaPortoVelho)


    mapaMacapa.invalidateSize()
    mapaPacaraima.invalidateSize()
    mapaBonfim.invalidateSize()
    mapaPortoVelho.invalidateSize()
}

function tooltipLocais(feature, layer) {
    layer.bindPopup(function () {
        return `<div class="h6">${feature.properties.NM_LOCAL_VOTACAO}</div>
        ${feature.properties.DS_LOCAL_VOTACAO_ENDERECO} - ${feature.properties.NM_MUNICIPIO}/${feature.properties.SG_UF}<br>
        Eleitores aptos: ${feature.properties.eleitores_aptos.toLocaleString('pt-Br')}<br>
        UE 2020: ${feature.properties.eleitores_aptos_ue_2020.toLocaleString('pt-Br')} (${(feature.properties.perc_eleitores_aptos_ue_2020/100).toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})<br>
        UE antiga: ${feature.properties.eleitores_aptos_ue_antiga.toLocaleString('pt-Br')} (${(feature.properties.perc_eleitores_aptos_ue_antiga/100).toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})<br>
        <hr>
        ${feature.properties.bolsonaro > feature.properties.lula ?
                `Bolsonaro: ${feature.properties.bolsonaro.toLocaleString('pt-Br')} (${(feature.properties.perc_bolsonaro/100).toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})<br>
        Lula: ${feature.properties.lula.toLocaleString('pt-Br')} (${(feature.properties.perc_lula/100).toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})` :
                `Lula: ${feature.properties.lula.toLocaleString('pt-Br')} (${(feature.properties.perc_lula/100).toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})<br>
        Bolsonaro: ${feature.properties.bolsonaro.toLocaleString('pt-Br')} (${(feature.properties.perc_bolsonaro/100).toLocaleString("pt-BR", { style: 'percent', minimumFractionDigits: 1 })})`
            }`
    })
}
