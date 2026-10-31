/** Filters the static audit once indexed; no row queries during interaction. */
export const AUDIT_SEARCH_DEBOUNCE_MS = 180;

export function normalizeAuditText(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR').replace(/\s+/gu, ' ').trim();
}

export function createAuditIndex(rows) {
  const totals = new Map();
  const indexed = rows.map(row => {
    const ancestors = [...new Set(row.ancestors || [])];
    for (const id of ancestors) totals.set(id, (totals.get(id) || 0) + 1);
    return { id: row.id, uf: String(row.uf || '').trim().toUpperCase(),
      result: normalizeAuditText(row.result),
      text: normalizeAuditText(`${row.uf || ''} ${row.result || ''} ${row.text || ''}`), ancestors };
  });
  return { rows: indexed, totals, total: indexed.length };
}

export function filterAuditIndex(index, { uf = 'ALL', result = 'ALL', search = '' } = {}) {
  const selectedUF = String(uf || 'ALL').trim().toUpperCase();
  const selectedResult = result === 'ALL' || !result ? '' : normalizeAuditText(result);
  const terms = normalizeAuditText(search).split(' ').filter(Boolean);
  const visibleIds = new Set(), counts = new Map([...index.totals.keys()].map(id => [id, 0]));
  for (const row of index.rows) {
    if ((selectedUF !== 'ALL' && row.uf !== selectedUF) || (selectedResult && row.result !== selectedResult)
      || !terms.every(term => row.text.includes(term))) continue;
    visibleIds.add(row.id);
    for (const id of row.ancestors) counts.set(id, counts.get(id) + 1);
  }
  return { visibleIds, counts, matchingCount: visibleIds.size, total: index.total,
    active: selectedUF !== 'ALL' || Boolean(selectedResult) || terms.length > 0 };
}

const initialized = new WeakMap();

function directSummary(detail) {
  return [...detail.children].find(child => child.tagName === 'SUMMARY') || null;
}

function summaryLabel(detail) {
  const summary = directSummary(detail);
  if (!summary) return '';
  // Counts and municipality codes live in spans; keep those out of searches
  // so searching a section number does not match every row in a large group.
  const directText = [...summary.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join(' ').trim();
  return directText || summary.textContent;
}

function fillOptions(select, entries, fallbackLabel) {
  const selected = select.value || 'ALL';
  const allLabel = [...select.options].find(option => option.value === 'ALL')?.textContent || fallbackLabel;
  const doc = select.ownerDocument;
  const option = (value, label) => {
    const node = doc.createElement('option'); node.value = value; node.textContent = label; return node;
  };
  select.replaceChildren(option('ALL', allLabel), ...entries.map(([value, label]) => option(value, label)));
  if ([...select.options].some(item => item.value === selected)) select.value = selected;
}

export function initializeAuditFilters(root = document) {
  if (initialized.has(root)) return initialized.get(root);
  const stateSelect = root.querySelector('#auditState'), resultSelect = root.querySelector('#auditResult');
  const searchInput = root.querySelector('#auditSearch'), output = root.querySelector('#auditFilterCount');
  if (!stateSelect || !resultSelect || !searchInput || !output) return null;

  const rowNodes = new Map(), details = new Map(), stateLabels = new Map(), resultLabels = new Map(), rows = [];
  let detailId = 0;
  function detailRecord(element) {
    let record = details.get(element);
    if (!record) {
      const summary = directSummary(element), label = summaryLabel(element);
      const countNode = summary ? [...summary.children].find(child => child.tagName === 'SPAN') : null;
      record = { id: detailId++, element, summary, label, countNode, originalText: countNode?.textContent || '' };
      details.set(element, record);
      element.open = false;
    }
    return record;
  }

  for (const state of root.querySelectorAll('details.state')) {
    const stateInfo = detailRecord(state);
    const uf = (state.dataset.uf || stateInfo.label.match(/^\s*([a-z]{2})\b/iu)?.[1] || '').toUpperCase();
    if (!uf) continue;
    stateLabels.set(uf, uf);
    for (const row of state.querySelectorAll('tr')) {
      const badge = row.querySelector('.badge');
      if (!badge) continue; // Header rows never count as sections.
      const result = (row.dataset.result || badge.textContent).replace(/\s+/gu, ' ').trim();
      const ancestors = [], labels = [];
      let ancestor = row.closest('details');
      while (ancestor && (ancestor === state || state.contains(ancestor))) {
        const info = detailRecord(ancestor);
        ancestors.push(info.id); labels.push(info.label);
        ancestor = ancestor.parentElement?.closest('details') || null;
      }
      const id = rows.length;
      rowNodes.set(id, row);
      rows.push({ id, uf, result, text: `${labels.join(' ')} ${row.textContent}`, ancestors });
      if (!resultLabels.has(normalizeAuditText(result))) resultLabels.set(normalizeAuditText(result), result);
    }
  }

  const index = createAuditIndex(rows), number = new Intl.NumberFormat('pt-BR');
  fillOptions(stateSelect, [...stateLabels].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')), 'Todos os estados');
  fillOptions(resultSelect, [...resultLabels].sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR')), 'Todos os resultados');
  let timer = null;
  function apply() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    const result = filterAuditIndex(index, { uf: stateSelect.value, result: resultSelect.value, search: searchInput.value });
    for (const [id, row] of rowNodes) {
      const hidden = !result.visibleIds.has(id);
      if (row.hidden !== hidden) row.hidden = hidden;
    }
    for (const info of details.values()) {
      const matched = result.counts.get(info.id) || 0, total = index.totals.get(info.id) || 0;
      if (info.element.hidden !== (matched === 0)) info.element.hidden = matched === 0;
      if (!info.countNode && result.active && info.summary) {
        info.countNode = info.element.ownerDocument.createElement('span');
        info.countNode.className = 'audit-match-count'; info.summary.append(info.countNode);
      }
      if (info.countNode) {
        const count = `${number.format(matched)} de ${number.format(total)} seções`;
        const countPattern = /\d[\d.,\u00a0\u202f]*\s+seç(?:ão|ões)\b/iu;
        const label = !result.active ? info.originalText
          : countPattern.test(info.originalText) ? info.originalText.replace(countPattern, count)
            : `${info.originalText}${info.originalText ? ' · ' : ''}${count}`;
        if (info.countNode.textContent !== label) info.countNode.textContent = label;
        const hidden = !result.active && !info.originalText;
        if (info.countNode.hidden !== hidden) info.countNode.hidden = hidden;
      }
    }
    const label = `${number.format(result.matchingCount)} de ${number.format(result.total)} seções`;
    if (output.textContent !== label) output.textContent = label;
    return result;
  }
  function scheduleSearch() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(apply, AUDIT_SEARCH_DEBOUNCE_MS);
  }
  stateSelect.addEventListener('change', apply);
  resultSelect.addEventListener('change', apply);
  searchInput.addEventListener('input', scheduleSearch);
  const controller = { index, apply };
  initialized.set(root, controller);
  apply();
  return controller;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initializeAuditFilters(document), { once: true });
  else initializeAuditFilters(document);
}
