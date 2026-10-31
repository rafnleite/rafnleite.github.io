/** View-only histogram zoom: bin values and full-population totals stay intact. */
export function clampBinWindow(total, window = null, extent = null) {
  if (!Number.isInteger(total) || total <= 0) return [0, 0];
  const [minimum, maximum] = extent ? clampBinWindow(total, extent) : [0, total];
  if (!Array.isArray(window) || window.length !== 2 || !window.every(Number.isFinite)
    || window[1] <= window[0]) return [minimum, maximum];
  const width = Math.max(1, Math.min(maximum - minimum, Math.round(window[1] - window[0])));
  const start = Math.max(minimum, Math.min(maximum - width, Math.round(window[0])));
  return [start, start + width];
}

export function zoomBinWindow(total, current, deltaY, anchorRatio = .5, minBins = 2, extent = null) {
  const [start, end] = clampBinWindow(total, current, extent);
  if (!Number.isInteger(total) || total <= 0 || !Number.isFinite(deltaY) || deltaY === 0) return [start, end];
  const [minimumIndex, maximumIndex] = extent ? clampBinWindow(total, extent) : [0, total];
  const available = maximumIndex - minimumIndex;
  const anchor = Number.isFinite(anchorRatio) ? Math.max(0, Math.min(1, anchorRatio)) : .5;
  const width = end - start, minimum = Math.max(1, Math.min(available, Math.round(minBins) || 1));
  let nextWidth = Math.round(width * Math.exp(Math.max(-2, Math.min(2, deltaY / 120)) * .25));
  if (nextWidth === width) nextWidth += Math.sign(deltaY);
  nextWidth = Math.max(minimum, Math.min(available, nextWidth));
  const focalBin = start + width * anchor;
  const nextStart = Math.max(minimumIndex, Math.min(maximumIndex - nextWidth, Math.round(focalBin - nextWidth * anchor)));
  return [nextStart, nextStart + nextWidth];
}

/** Trim only empty tails; time gaps between observations remain visible. */
export function histogramDataExtent(histogram, metric, { preserveRange = false } = {}) {
  const bins = histogram.bins || [];
  if (preserveRange) return [0, bins.length];
  const first = bins.findIndex(bin => bin[metric] > 0);
  if (first < 0) return [0, bins.length]; // No positive observation to infer limits from.
  let end = bins.length;
  while (end > first && !(bins[end - 1][metric] > 0)) end--;
  return [first, end];
}

export function histogramZoomView(histogram, window = null, extent = null) {
  const allBins = histogram.bins || [], [start, end] = clampBinWindow(allBins.length, window, extent);
  const [minimum, maximum] = extent ? clampBinWindow(allBins.length, extent) : [0, allBins.length];
  const bins = allBins.slice(start, end), prefixAccumulated = {};
  for (const metric of ['urnas', 'eleitores', 'votos']) {
    const denominator = histogram.populationTotals[metric];
    prefixAccumulated[metric] = denominator > 0
      ? start > 0 ? allBins[start - 1].accumulated[metric] : histogram.prefixTotals[metric] / denominator
      : null;
  }
  return { bins, startIndex: start, endIndex: end,
    domain: bins.length ? [bins[0].start, bins.at(-1).end] : histogram.domain,
    prefixAccumulated, extent: [minimum, maximum], autoTrimmed: minimum !== 0 || maximum !== allBins.length,
    zoomed: start !== minimum || end !== maximum };
}
