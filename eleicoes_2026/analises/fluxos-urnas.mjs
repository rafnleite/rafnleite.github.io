// Read only the selected zone from the already published, audited per-urn CSV.
export async function readUrnaZone(bytes, scope, rows, columns, participationRate = null) {
  const municipio = Number(scope.municipio), zona = Number(scope.zona);
  if (!Number.isSafeInteger(municipio) || municipio < 1 || !Number.isSafeInteger(zona) || zona < 1) {
    throw new Error('Selecione município e zona para consultar as urnas.');
  }
  const fields = ['municipio', 'zona', 'secao', 'eleitorado_1t', 'eleitorado_2t', 'usada_no_treino'];
  for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) fields.push(`fluxo_${i}_${j}`);
  const prefix = `${municipio},${zona},`;
  const sections = [], seen = new Set();
  let header = false;
  function consume(rawLine) {
    const line = rawLine.replace(/\r$/, '');
    if (!header) {
      if (line.replace(/^\ufeff/, '') !== fields.join(',')) throw new Error('Arquivo por urna incompatível com o modelo.');
      header = true;
      return;
    }
    if (!line || !line.startsWith(prefix)) return;
    const cells = line.split(',');
    if (cells.length !== fields.length || cells.some(value => value.trim() === '')) throw new Error('Registro de urna incompleto.');
    const values = cells.map(Number);
    if (values.some(value => !Number.isFinite(value) || value < 0)
        || values.slice(0, 6).some(value => !Number.isSafeInteger(value))
        || values[2] < 1 || ![0, 1].includes(values[5])) throw new Error('Registro de urna inválido.');
    const [municipio, zona, secao, electorate1, electorate2, trainingCount] = values;
    if (seen.has(secao)) throw new Error('Seção duplicada no arquivo de urnas.');
    seen.add(secao);
    const flows = Array.from({length: rows}, (_, i) => values.slice(6 + i * columns, 6 + (i + 1) * columns));
    // The CSV stores six decimal places. Recover the observed integer margins
    // only when their distance from an integer is within its audited tolerance.
    const observed = value => {
      const rounded = Math.round(value);
      if (Math.abs(value - rounded) > 1e-5) throw new Error('As margens da urna não correspondem aos boletins.');
      return rounded;
    };
    const originTotals = flows.map(row => observed(row.reduce((sum, value) => sum + value, 0)));
    const destinationTotals = Array.from({length: columns}, (_, j) => observed(flows.reduce((sum, row) => sum + row[j], 0)));
    const total = Math.max(electorate1, electorate2);
    if (originTotals.reduce((sum, value) => sum + value, 0) !== total
        || destinationTotals.reduce((sum, value) => sum + value, 0) !== total) {
      throw new Error('O eleitorado da urna não corresponde às margens.');
    }
    let participationSwaps = 0, participationCappedCount = 0;
    if (Number.isFinite(participationRate) && rows === 17 && columns === 6) {
      const p1 = originTotals.slice(0, 15).reduce((sum, value) => sum + value, 0);
      const p2 = destinationTotals.slice(0, 4).reduce((sum, value) => sum + value, 0);
      participationSwaps = Math.min(participationRate * p1, p1, p2, total - p1, total - p2);
      participationCappedCount = Number(participationSwaps < participationRate * p1 - 1e-9);
    }
    sections.push({municipio, zona, secao, sectionCount: 1, trainingCount, electorate1, electorate2,
      participationSwaps, participationCappedCount,
      registrationChangeCount: Number(electorate1 !== electorate2), originTotals, destinationTotals, flows,
      lowerBounds: originTotals.map(a => destinationTotals.map(b => Math.max(0, a + b - total))),
      upperBounds: originTotals.map(a => destinationTotals.map(b => Math.min(a, b)))});
  }
  let stream = new Blob([bytes]).stream();
  if (bytes[0] === 31 && bytes[1] === 139) stream = stream.pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      buffer += value;
      let start = 0, end;
      while ((end = buffer.indexOf('\n', start)) !== -1) {
        consume(buffer.slice(start, end));
        start = end + 1;
      }
      buffer = buffer.slice(start);
    }
    if (buffer) consume(buffer);
    if (!header) throw new Error('Arquivo por urna vazio.');
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {reader.releaseLock();}
  return sections.sort((a, b) => a.secao - b.secao);
}
