function criarMapaModelosUrna() {
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

    L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png', {
        maxNativeZoom: 19, // OSM max available zoom is at 19.
        maxZoom: 22, // Match the map maxZoom, or leave map.options.maxZoom undefined.
        attribution: `&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openPmap.org">OpenStreetMap</a> contributors`
    }).addTo(mapaModelosUrna);

    mapaModelosUrna.markersMunicipios = L.featureGroup()

    atualizarMapaModelosUrna()
}

function atualizarMapaModelosUrna() {
    if (window.hasOwnProperty('markersMunicipios'))
        mapaModelosUrna.removeLayer(markersMunicipios);

    centroideMunicipios.features.map(function (mun) {
        agregadorPorModeloUrna(mun.properties, votacaoPorZonaPorMunicipio.filter(x => x.CD_MUNICIPIO == mun.properties.CD_MUNICIPIO))
    })

    maximoEleitoresMunicipio = 

    console.log(centroideMunicipios)
    window.markersMunicipios = L.geoJson(centroideMunicipios, {
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                radius: 2 + 10 * (feature.properties.eleitores_aptos > 1500000 ? 1500000 : feature.properties.eleitores_aptos) / 1500000 +  10 * (feature.properties.eleitores_aptos > 1500000 ? feature.properties.eleitores_aptos - 1500000 : 0)  / 7500000,
                fillColor: chroma.mix("#C5B800", "#FF0000", feature.properties.eleitores_aptos_ue_2020_perc),
                color: "#000",
                weight: 0,
                opacity: 0,
                fillOpacity: 0.7
            })
        },
        onEachFeature: tooltipMunicipios
    }).addTo(mapaModelosUrna)

    mapaModelosUrna.invalidateSize()
}

function tooltipMunicipios(feature, layer)  {
    layer.bindPopup(function () {
        return `<div class="h6">${feature.properties.NM_MUNICIPIO}/${feature.properties.NM_UF}</div>
        ${feature.properties.CD_MUNICIPIO}<br>
        ${feature.properties.eleitores_aptos}<br>
        ${feature.properties.bolsonaro}<br>
        ${feature.properties.lula}`
    });
}