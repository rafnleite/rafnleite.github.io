// Endereços: regulamento publicado pelo Verdemar (Anexo I, 2025).
// Coordenadas: geocodificação dos endereços pelo ArcGIS World Geocoding Service, conferida com OpenStreetMap quando disponível.
// https://selosmeuverdemar.com.br/wp-content/uploads/2025/07/4-MINUTA-Regulamento-MEU-SELINHO-VERDEMAR-1107.pdf
var json_verdemar = {
  type: 'FeatureCollection',
  features: [
    ['Buritis', 'Avenida Professor Mário Werneck, 1500', 'Belo Horizonte', -43.964825, -19.969750],
    ['Castelo', 'Avenida Presidente Tancredo Neves, 2700', 'Belo Horizonte', -43.993613, -19.886025],
    ['Cidade Nova', 'Avenida Cristiano Machado, 2130', 'Belo Horizonte', -43.929048, -19.888909],
    ['Diamond Mall', 'Avenida Olegário Maciel, 1600', 'Belo Horizonte', -43.946824, -19.928219],
    ['Jardim Canadá', 'Rua Vancouver, 40', 'Nova Lima', -43.979945, -20.063171],
    ['Pampulha', 'Avenida Santa Rosa, 846', 'Belo Horizonte', -43.966266, -19.853639],
    ['Prado', 'Rua Turquesa, 721', 'Belo Horizonte', -43.964824, -19.926959],
    ['Pátio Savassi', 'Avenida do Contorno, 6099', 'Belo Horizonte', -43.934289, -19.940140],
    ['Raja Gabáglia', 'Avenida Raja Gabáglia, 3600', 'Belo Horizonte', -43.955673, -19.963921],
    ['Savassi', 'Rua Fernandes Tourinho, 471', 'Belo Horizonte', -43.939086, -19.938691],
    ['Serra', 'Rua do Ouro, 195', 'Belo Horizonte', -43.923331, -19.933495],
    ['Shopping Woods', 'Rua Guaicuí, 700', 'Belo Horizonte', -43.955517, -19.947344],
    ['Sion', 'Avenida Nossa Senhora do Carmo, 1900', 'Belo Horizonte', -43.939818, -19.954175],
    ['São Pedro', 'Rua Viçosa, 572', 'Belo Horizonte', -43.939199, -19.946101],
    ['Padaria Cataguases', 'Rua Paulo Afonso, 720', 'Belo Horizonte', -43.946023, -19.943744],
    ['Cristina', 'Rua Cristina, 991', 'Belo Horizonte', -43.939019, -19.946348],
    ['Belvedere', 'Rua Diciola Horta, 30', 'Belo Horizonte', -43.935394, -19.973890]
  ].map(([unidade, logradouro, municipio, longitude, latitude]) => ({
    type: 'Feature',
    properties: {
      nome: unidade === 'Padaria Cataguases' ? unidade : `Verdemar ${unidade}`,
      endereco: `${logradouro} - ${municipio}, MG`,
      municipio,
      tipo: unidade === 'Padaria Cataguases' ? 'Padaria' : 'Supermercado',
      fonte: 'Verdemar'
    },
    geometry: { type: 'Point', coordinates: [longitude, latitude] }
  }))
};
