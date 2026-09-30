(function (root) {
  'use strict';

  const fields = [
    { key: 'nome_condominio', label: 'Nome do condomínio', type: 'text' },
    { key: 'endereco', label: 'Endereço / bairro', type: 'text' },
    { key: 'descricao', label: 'Descrição', type: 'text' },
    { key: 'tamanho_minimo_imoveis', label: 'Área mínima (m²)', type: 'number', sliderMax: 300 },
    { key: 'min_quartos', label: 'Quartos mínimos', type: 'number', sliderMax: 5 },
    { key: 'max_quartos', label: 'Quartos máximos', type: 'number', sliderMax: 5 },
    { key: 'garagem_maximo', label: 'Vagas máximas', type: 'number', sliderMax: 3 },
    { key: 'comodidades', label: 'Comodidade', type: 'list' }
  ];
  const operators = {
    text: [['contains', 'contém'], ['not_contains', 'não contém'], ['eq', 'é igual a'], ['neq', 'é diferente de'], ['empty', 'está vazio'], ['not_empty', 'está preenchido']],
    number: [['eq', '='], ['neq', '≠'], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'], ['empty', 'está vazio'], ['not_empty', 'está preenchido']],
    list: [['contains', 'contém'], ['not_contains', 'não contém'], ['empty', 'está vazio'], ['not_empty', 'está preenchido']],
    date: [['eq', '='], ['neq', '≠'], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'], ['empty', 'está vazio'], ['not_empty', 'está preenchido']]
  };
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  const empty = value => value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

  function matches(properties, condition) {
    const field = fields.find(item => item.key === condition.field);
    if (!field) return false;
    const current = properties[condition.field];
    if (condition.operator === 'empty') return empty(current);
    if (condition.operator === 'not_empty') return !empty(current);
    if (empty(current)) return false;
    if (field.type === 'list') {
      const values = Array.isArray(current) ? current : String(current).split(';');
      const present = values.some(value => normalize(value) === normalize(condition.value));
      return condition.operator === 'contains' ? present : !present;
    }
    if (field.type === 'text') {
      const left = normalize(current), right = normalize(condition.value);
      switch (condition.operator) {
        case 'contains': return left.includes(right);
        case 'not_contains': return !left.includes(right);
        case 'eq': return left === right;
        case 'neq': return left !== right;
        default: return false;
      }
    }
    const left = field.type === 'date' ? String(current) : Number(current);
    const right = field.type === 'date' ? String(condition.value) : Number(String(condition.value).replace(',', '.'));
    if (field.type === 'number' && (!Number.isFinite(left) || !Number.isFinite(right))) return false;
    switch (condition.operator) {
      case 'eq': return left === right;
      case 'neq': return left !== right;
      case 'gt': return left > right;
      case 'gte': return left >= right;
      case 'lt': return left < right;
      case 'lte': return left <= right;
      default: return false;
    }
  }

  function predicate(conditions, mode = 'all') {
    if (!conditions.length) return () => true;
    return properties => mode === 'any' ? conditions.some(condition => matches(properties, condition)) : conditions.every(condition => matches(properties, condition));
  }

  const api = { fields, operators, matches, predicate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GEOFilters = api;
})(typeof window !== 'undefined' ? window : globalThis);
