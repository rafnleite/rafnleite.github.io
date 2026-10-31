const fmt = new Intl.NumberFormat('pt-BR');
const pct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** Rows use the ranking schema, with UF prepended. Each valid urn has weight one. */
export function aggregateBiometryHistogram(rows, width = 1) {
  if (![1, 2, 5, 10].includes(width)) throw new RangeError('Faixa inválida. Use 1, 2, 5 ou 10 pontos percentuais.');
  const bins = Array.from({ length: 100 / width }, (_, i) => ({ start: i * width, end: (i + 1) * width, count: 0 }));
  let total = 0, zeroCount = 0, invalidCount = 0, sumRates = 0;
  const rates = [];
  for (const row of rows) {
    const votes = row?.[6], failures = row?.[7];
    if (!Number.isSafeInteger(votes) || votes <= 0 || !Number.isSafeInteger(failures) || failures < 0 || failures > votes) {
      invalidCount++;
      continue;
    }
    // Divide integer counts only once; keep 100% in the final, closed interval.
    const index = Math.min(bins.length - 1, Math.floor(failures * 100 / (votes * width)));
    bins[index].count++;
    total++;
    const rate = failures * 100 / votes;
    rates.push(rate);
    sumRates += rate;
    if (failures === 0) zeroCount++;
  }
  rates.sort((a, b) => a - b);
  const middle = Math.floor(total / 2);
  const mean = total ? sumRates / total : null;
  const median = total ? total % 2 ? rates[middle] : (rates[middle - 1] + rates[middle]) / 2 : null;
  let accumulated = 0;
  const cumulativeCounts = bins.map(bin => accumulated += bin.count);
  const cumulativePercentages = cumulativeCounts.map(count => total ? count * 100 / total : 0);
  return { bins, total, zeroCount, invalidCount, mean, median, cumulativeCounts, cumulativePercentages };
}

const rangeLabel = bin => `${bin.start}% a ${bin.end === 100 ? '' : 'menos de '}${bin.end}%`;

export function createBiometryHistogram({ element, interval, status, table, scope, meanLegend, medianLegend }) {
  if (!globalThis.echarts) {
    status.textContent = 'Não foi possível carregar o gráfico. Recarregue a página para tentar novamente.';
    return { setRows() {}, loading() {}, error() {} };
  }
  const chart = echarts.init(element, null, { renderer: 'canvas' });
  let sourceRows = [], currentScope = null, ready = false;
  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(element);
  const render = (resetZoom = false) => {
    const width = Number(interval.value);
    const result = aggregateBiometryHistogram(sourceRows, width);
    const { bins, total, zeroCount, invalidCount, mean, median, cumulativeCounts, cumulativePercentages } = result;
    const oldZoom = resetZoom ? null : chart.getOption()?.dataZoom?.[0];
    chart.hideLoading();
    status.textContent = total
      ? `${fmt.format(total)} urnas no recorte · ${fmt.format(zeroCount)} com 0% após falha. Cada urna conta uma vez. Faixas de ${width} ${width === 1 ? 'ponto percentual' : 'pontos percentuais'}.`
      : 'Nenhuma urna com dados disponíveis neste recorte.';
    if (invalidCount) status.textContent += ` ${fmt.format(invalidCount)} urna(s) sem contagens válidas foram excluídas.`;
    meanLegend.textContent = `Média (${mean === null ? '—' : pct.format(mean) + '%'})`;
    medianLegend.textContent = `Mediana (${median === null ? '—' : pct.format(median) + '%'})`;
    element.setAttribute('aria-label', `Histograma de urnas por percentual de eleitores habilitados após falha biométrica. ${status.textContent} ${total ? `Média ${pct.format(mean)}%; mediana ${pct.format(median)}%. Linha de percentual acumulado no eixo direito.` : ''} Consulte a tabela de frequências abaixo do gráfico.`);
    table.innerHTML = total ? bins.map((bin, i) => `<tr><th scope="row">${rangeLabel(bin)}</th><td>${fmt.format(bin.count)}</td><td>${pct.format(bin.count * 100 / total)}%</td><td>${fmt.format(cumulativeCounts[i])}</td><td>${pct.format(cumulativePercentages[i])}%</td></tr>`).join('') : '<tr><td colspan="5">Nenhuma urna com dados disponíveis.</td></tr>';
    chart.setOption({
      animation: false,
      textStyle: { fontFamily: 'Inter, Segoe UI, Arial, sans-serif', color: '#65766b' },
      grid: { left: 18, right: 24, top: 45, bottom: 108, containLabel: true },
      tooltip: {
        trigger: 'axis', confine: true, axisPointer: { type: 'shadow' },
        backgroundColor: '#fffefb', borderColor: '#ccd8cf', textStyle: { color: '#173f48' },
        formatter: params => {
          const point = params.find(p => p.seriesName === 'Urnas') || params[0];
          if (!point) return '';
          if (point.seriesName !== 'Urnas' && point.dataIndex === 0) {
            return `<b>0% exatamente</b><br>${fmt.format(zeroCount)} urnas sem habilitações após falha<br><b>Acumulado: ${fmt.format(zeroCount)} urnas · ${pct.format(total ? zeroCount * 100 / total : 0)}%</b>`;
          }
          const index = Math.min(bins.length - 1, Math.max(0, point.seriesName === 'Urnas' ? point.dataIndex : point.dataIndex - 1));
          const bin = bins[index];
          return `<b>${rangeLabel(bin)}</b><br>${fmt.format(bin.count)} urnas · ${pct.format(total ? bin.count * 100 / total : 0)}% do recorte<br><b>Acumulado: ${fmt.format(cumulativeCounts[index])} urnas · ${pct.format(cumulativePercentages[index])}%</b>`;
        },
      },
      xAxis: {
        type: 'value', min: 0, max: 100, minInterval: width,
        axisLabel: { hideOverlap: true, formatter: value => `${pct.format(value)}%` },
        axisLine: { lineStyle: { color: '#cdd8cf' } },
      },
      yAxis: [{
        type: 'value', name: 'Quantidade de urnas', min: 0, minInterval: 1,
        nameTextStyle: { align: 'left', padding: [0, 0, 7, 0] },
        axisLabel: { formatter: value => fmt.format(value) },
        splitLine: { lineStyle: { color: '#e6ece1' } },
      }, {
        type: 'value', name: 'Urnas acumuladas', position: 'right', min: 0, max: 100,
        nameTextStyle: { align: 'right', padding: [0, 0, 7, 0], color: '#247967' },
        axisLabel: { formatter: value => `${value}%`, color: '#247967' },
        splitLine: { show: false },
      }],
      dataZoom: [
        { type: 'slider', xAxisIndex: 0, bottom: 15, height: 25, start: oldZoom?.start ?? 0, end: oldZoom?.end ?? 100, brushSelect: false, borderColor: '#d7dfd0', fillerColor: '#b13e2320', handleStyle: { color: '#b13e23' }, labelFormatter: value => `${pct.format(value)}%`, textStyle: { fontSize: 10 } },
        { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false },
      ],
      series: [{
        type: 'bar', name: 'Urnas', data: total ? bins.map(bin => [(bin.start + bin.end) / 2, bin.count]) : [],
        encode: { x: 0, y: 1 }, barCategoryGap: '4%', barGap: '0%',
        itemStyle: { color: '#b13e23' }, emphasis: { itemStyle: { color: '#80331f' } },
        markLine: { silent: true, symbol: 'none', label: { show: false }, data: total ? [
          { name: 'Média', xAxis: mean, lineStyle: { color: '#005fcc', type: 'dashed', width: 1.5 } },
          { name: 'Mediana', xAxis: median, lineStyle: { color: '#6515c7', type: 'dotted', width: 1.5 } },
        ] : [] },
      }, {
        type: 'line', name: 'Acumulado de urnas', yAxisIndex: 1,
        data: total ? [[0, zeroCount * 100 / total], ...bins.map((bin, i) => [bin.end, cumulativePercentages[i]])] : [],
        step: 'end', showSymbol: false, z: 4,
        lineStyle: { color: '#247967', width: 2.5 }, itemStyle: { color: '#247967' },
      }],
      graphic: total ? [] : [{ type: 'text', left: 'center', top: '40%', style: { text: 'Nenhuma urna no recorte', fill: '#65766b', fontSize: 14 } }],
    }, { notMerge: true });
  };
  interval.onchange = () => { if (ready) render(true); };
  return {
    setRows(rows, scopeKey) {
      const reset = currentScope !== scopeKey;
      sourceRows = rows;
      currentScope = scopeKey;
      ready = true;
      scope.textContent = scopeKey || 'Brasil e exterior · Todas as zonas';
      render(reset);
    },
    loading() {
      ready = false;
      status.textContent = 'Carregando urnas do recorte…';
      meanLegend.textContent = 'Média (—)';
      medianLegend.textContent = 'Mediana (—)';
      table.replaceChildren();
      chart.clear();
      chart.showLoading({ text: 'Carregando urnas…', color: '#b13e23', maskColor: '#fffefbe8' });
    },
    error(message) {
      ready = false;
      chart.hideLoading();
      chart.clear();
      status.textContent = message;
      meanLegend.textContent = 'Média (—)';
      medianLegend.textContent = 'Mediana (—)';
      table.replaceChildren();
    },
  };
}
