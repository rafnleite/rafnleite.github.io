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

    atualizarMapaModelosUrna()
}

function atualizarMapaModelosUrna() {
    mapaModelosUrna.invalidateSize()
}