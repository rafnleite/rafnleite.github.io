// Display-only controlled rounding. The stored model and territorial sums
// retain their original fractional estimates.
export function integerUrnaFlows(matrix, originTotals, destinationTotals) {
  const rows = originTotals.length, columns = destinationTotals.length;
  if (matrix.length !== rows || matrix.some(row => row.length !== columns)) throw Error('Matriz de urna incompatível.');
  const result = matrix.map(row => row.map(value => {
    if (!Number.isFinite(value) || value < 0) throw Error('Fluxo inválido na urna.');
    return Math.floor(value);
  }));
  const source = rows + columns, sink = source + 1, size = sink + 1;
  const graph = Array.from({length: size}, () => []), cells = [];
  function edge(from, to, capacity, cost) {
    const forward = {to, reverse: graph[to].length, capacity, cost};
    const backward = {to: from, reverse: graph[from].length, capacity: 0, cost: -cost};
    graph[from].push(forward); graph[to].push(backward);
    return forward;
  }
  let required = 0, destinationsRequired = 0;
  for (let i = 0; i < rows; i++) {
    const need = originTotals[i] - result[i].reduce((a, b) => a + b, 0);
    if (!Number.isSafeInteger(need) || need < 0) throw Error('Margem de origem inválida.');
    required += need;
    edge(source, i, need, 0);
    for (let j = 0; j < columns; j++) {
      const fraction = matrix[i][j] - result[i][j];
      if (fraction > 0) cells.push({i, j, edge: edge(i, rows + j, 1, 1 - fraction)});
    }
  }
  for (let j = 0; j < columns; j++) {
    const need = destinationTotals[j] - result.reduce((sum, row) => sum + row[j], 0);
    if (!Number.isSafeInteger(need) || need < 0) throw Error('Margem de destino inválida.');
    destinationsRequired += need;
    edge(rows + j, sink, need, 0);
  }
  if (required !== destinationsRequired) throw Error('Totais da urna incompatíveis.');
  const potential = Array(size).fill(0);
  for (let flow = 0; flow < required; flow++) {
    const distance = Array(size).fill(Infinity), visited = Array(size).fill(false);
    const previousNode = Array(size).fill(-1), previousEdge = Array(size).fill(-1);
    distance[source] = 0;
    for (let step = 0; step < size; step++) {
      let node = -1;
      for (let v = 0; v < size; v++) if (!visited[v] && (node < 0 || distance[v] < distance[node])) node = v;
      if (node < 0 || !Number.isFinite(distance[node])) break;
      visited[node] = true;
      graph[node].forEach((item, index) => {
        const candidate = distance[node] + item.cost + potential[node] - potential[item.to];
        if (item.capacity > 0 && candidate < distance[item.to] - 1e-12) {
          distance[item.to] = candidate; previousNode[item.to] = node; previousEdge[item.to] = index;
        }
      });
    }
    if (previousNode[sink] < 0) throw Error('Não foi possível apresentar a urna em inteiros preservando seus totais.');
    for (let v = 0; v < size; v++) if (Number.isFinite(distance[v])) potential[v] += distance[v];
    for (let v = sink; v !== source; v = previousNode[v]) {
      const item = graph[previousNode[v]][previousEdge[v]];
      item.capacity--; graph[v][item.reverse].capacity++;
    }
  }
  for (const cell of cells) if (cell.edge.capacity === 0) result[cell.i][cell.j]++;
  for (let i = 0; i < rows; i++) if (result[i].reduce((a, b) => a + b, 0) !== originTotals[i]) throw Error('Total de origem não preservado.');
  for (let j = 0; j < columns; j++) if (result.reduce((sum, row) => sum + row[j], 0) !== destinationTotals[j]) throw Error('Total de destino não preservado.');
  return result;
}
