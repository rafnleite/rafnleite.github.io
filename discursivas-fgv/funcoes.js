function percentualBR(numero) {
    return numero.toLocaleString('pt-BR', {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function contarFrequencias(array) {
    var frequencies = {};
    
    for (var i = 0; i < array.length; i++) {
      var element = array[i];
      
      if (frequencies[element]) {
        frequencies[element]++;
      } else {
        frequencies[element] = 1;
      }
    }
    
    return frequencies;
  }