// Separate SVG renderer keeps state outlines visible when markers use Canvas.
const layers=new WeakMap();
export function addStateBoundaries(map){
  if(layers.has(map))return layers.get(map);
  const pane=map.getPane('state-boundaries')||map.createPane('state-boundaries');
  pane.style.zIndex='450';pane.style.pointerEvents='none';
  const ready=fetch('./state-boundaries.geojson',{cache:'force-cache'}).then(response=>{
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return response.json();
  }).then(data=>{
    if(data.type!=='FeatureCollection'||data.features?.length!==27)throw new Error('Malha estadual incompatível.');
    return L.geoJSON(data,{pane:'state-boundaries',renderer:L.svg({pane:'state-boundaries'}),interactive:false,bubblingMouseEvents:false,
      style:{color:'#40524d',weight:1.2,opacity:.95,fill:false},
      attribution:'Limites estaduais: <a href="https://servicodados.ibge.gov.br/api/docs/malhas?versao=3" target="_blank" rel="noopener noreferrer">IBGE</a>',
    }).addTo(map);
  }).catch(error=>console.warn('Não foi possível carregar os contornos estaduais.',error));
  layers.set(map,ready);return ready;
}
