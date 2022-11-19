function criarMapaModelosUrna() {

    $('.colorScaleModeloUrna').each(function () {
        atualizarPaletaDeCores($(this), chroma.scale(["#FFC400", "#FF0000"]).colors(60))
    })

    let bounds = [
        [6, -78], // Northeast coordinates
        [-35, -29] // Southwest coordinates
    ];
    let mapCenter = [-23.195, -45.865];
    window.mapaModelosUrna = L.map('mapaModelosUrna', {
        zoom: 4,
        minZoom: 4,
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
    }).addTo(mapaModelosUrna);

    mapaModelosUrna.markersMunicipios = L.featureGroup()

    mapaModelosUrna.createPane('markersMunicipiosPane');
    mapaModelosUrna.createPane('estadosGeometriaPane');
    mapaModelosUrna.createPane('rmGeometriaPane');
    mapaModelosUrna.getPane('markersMunicipiosPane').style.zIndex = 500;
    mapaModelosUrna.getPane('estadosGeometriaPane').style.zIndex = 400;
    mapaModelosUrna.getPane('rmGeometriaPane').style.zIndex = 450;


    atualizarMapaModelosUrna()
}

function atualizarMapaModelosUrna() {
    if (window.hasOwnProperty('markersMunicipios'))
        mapaModelosUrna.removeLayer(markersMunicipios);
    if (window.hasOwnProperty('estadosGeometria'))
        mapaModelosUrna.removeLayer(estadosGeometria);
    if (window.hasOwnProperty('rmGeometria'))
        mapaModelosUrna.removeLayer(rmGeometria);

    window.markersMunicipios = L.geoJson(centroideMunicipios, {
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                pane: 'markersMunicipiosPane',
                radius: 2 + 10 * (feature.properties.eleitores_aptos > 1500000 ? 1500000 : feature.properties.eleitores_aptos) / 1500000 + 10 * (feature.properties.eleitores_aptos > 1500000 ? feature.properties.eleitores_aptos - 1500000 : 0) / 7500000,
                fillColor: chroma.mix("#FFC400", "#FF0000", feature.properties.eleitores_aptos_ue_2020_perc),
                color: "#000",
                weight: 0,
                opacity: 0,
                fillOpacity: 0.7
            })
        },
        onEachFeature: tooltipMunicipios
    }).addTo(mapaModelosUrna)

    window.estadosGeometria = L.geoJson(estadosShape, {
        style: {
            pane: 'estadosGeometriaPane',
            fillColor: "#E0E0E0",
            color: "#000000",
            weight: 2,
            fillOpacity: 0.3
        }
    }).addTo(mapaModelosUrna)

    window.rmGeometria = L.geoJson(rmShape, {
        style: {
            pane: 'rmGeometriaPane',
            fillColor: "#5C5C5C",
            color: "#000000",
            weight: 0,
            fillOpacity: 0.7
        }
    }).addTo(mapaModelosUrna)

    mapaModelosUrna.invalidateSize()
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
