export function aggregate(items, rows, columns) {
  const matrix = () => Array.from({length: rows}, () => Array(columns).fill(0));
  const result = {status: 'empty', sectionCount: 0, trainingCount: 0,
    participationSwaps: 0, participationCappedCount: 0,
    totalElectorate1: 0, totalElectorate2: 0, registrationChangeCount: 0,
    originTotals: Array(rows).fill(0), destinationTotals: Array(columns).fill(0),
    flows: matrix(), lowerBounds: matrix(), upperBounds: matrix()};
  for (const item of items) {
    result.sectionCount += item.sectionCount;
    result.trainingCount += item.trainingCount;
    result.totalElectorate1 += item.electorate1;
    result.totalElectorate2 += item.electorate2;
    result.registrationChangeCount += item.registrationChangeCount;
    result.participationSwaps += item.participationSwaps || 0;
    result.participationCappedCount += item.participationCappedCount || 0;
    for (let i = 0; i < rows; i++) {
      result.originTotals[i] += item.originTotals[i];
      for (let j = 0; j < columns; j++) for (const field of ['flows', 'lowerBounds', 'upperBounds']) {
        const value = item[field][i][j];
        if (!Number.isFinite(value) || value < 0) throw new Error('Matriz de fluxos inválida.');
        result[field][i][j] += value;
      }
    }
    for (let j = 0; j < columns; j++) result.destinationTotals[j] += item.destinationTotals[j];
  }
  result.outOfTrainingCount = result.sectionCount - result.trainingCount;
  result.electorate = result.originTotals.reduce((a, b) => a + b, 0);
  result.status = result.sectionCount ? 'ok' : 'empty';
  return result;
}

export function sensitivityEnvelope(central, scenarios) {
  const lowerBounds = central.map(row => [...row]), upperBounds = central.map(row => [...row]);
  for (const matrix of scenarios) for (let i = 0; i < central.length; i++) for (let j = 0; j < central[i].length; j++) {
    lowerBounds[i][j] = Math.min(lowerBounds[i][j], matrix[i][j]);
    upperBounds[i][j] = Math.max(upperBounds[i][j], matrix[i][j]);
  }
  return scenarios.length ? {lowerBounds, upperBounds, scenarios: scenarios.length} : null;
}
