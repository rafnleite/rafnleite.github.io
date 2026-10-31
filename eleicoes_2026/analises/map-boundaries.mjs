// Separate SVG renderer keeps state outlines visible when markers use Canvas.
const basemaps=new WeakSet();
const layers=new WeakMap();
export function addStateBoundaries(map){
  if(!basemaps.has(map)){
    map.getContainer().style.backgroundColor='#dfe8eb';
    L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png',{
      maxZoom:19,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · Tiles: <a href="https://tile.openstreetmap.de/">OSM.de</a>',
    }).addTo(map);
    map.attributionControl.addAttribution('Limites estaduais: <a href="https://servicodados.ibge.gov.br/api/docs/malhas?versao=3">IBGE</a>');
    basemaps.add(map);
  }
  if(layers.has(map))return layers.get(map);
  const pane=map.getPane('state-boundaries')||map.createPane('state-boundaries');
  pane.style.zIndex='350';pane.style.pointerEvents='none';
  const ready=fetch(new URL('./state-boundaries.geojson',import.meta.url),{cache:'force-cache'}).then(response=>{
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return response.json();
  }).then(data=>{
    if(data.type!=='FeatureCollection'||data.features?.length!==27)throw new Error('Malha estadual incompatível.');
    return L.geoJSON(data,{pane:'state-boundaries',renderer:L.svg({pane:'state-boundaries'}),interactive:false,bubblingMouseEvents:false,
      style:{color:'#556e64',weight:1.1,opacity:.95,fill:false},
    }).addTo(map);
  }).catch(error=>console.warn('Não foi possível carregar os contornos estaduais.',error));
  layers.set(map,ready);return ready;
}
