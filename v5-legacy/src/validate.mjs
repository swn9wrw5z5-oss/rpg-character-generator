import { schemas, ABILITIES, GRADES, PARAMS, parameter } from './schema.mjs';

export function validateData(data) {
  const errors = [], warnings = [];
  const add = (list, code, table, id, message) => list.push({ code, table, id, message });
  const error = (code, table, id, message) => add(errors, code, table, id, message);
  const warn = (code, table, id, message) => add(warnings, code, table, id, message);
  if (data?.schemaVersion !== 1 || data?.formulaContract !== 'v5-four-values-floor-v1') error('UNSUPPORTED_SCHEMA', '', '', 'Unsupported schema/formula contract');
  if (!data?.source || !/^[a-f0-9]{64}$/i.test(data.source.sha256)) error('INVALID_PROVENANCE', '', '', 'Source SHA256 required');
  for (const [name, [, fields]] of Object.entries(schemas)) {
    if (!Array.isArray(data?.[name]) || !data[name].length) { error('MISSING_TABLE', name, '', 'Required nonempty table'); continue; }
    const seen = new Set();
    for (const r of data[name]) {
      if (!r || typeof r.id !== 'string' || !r.id.trim()) { error('MISSING_ID', name, '', 'ID must be a nonempty string'); continue; }
      if (seen.has(r.id)) error('DUPLICATE_ID', name, r.id, 'Duplicate primary key');
      seen.add(r.id);
      for (const f of fields.split(' ')) {
        const [key, type] = f.split('=')[0].split(':');
        if (type === 'n' && !Number.isFinite(r[key])) error('INVALID_NUMBER', name, r.id, key);
        if (type === 'b' && typeof r[key] !== 'boolean') error('INVALID_FLAG', name, r.id, key);
      }
      if ('weight' in r && (!Number.isFinite(r.weight) || r.weight < 0)) error('INVALID_WEIGHT', name, r.id, 'Weight must be finite and nonnegative');
      if ('cost' in r && (!Number.isFinite(r.cost) || r.cost < 0)) error('INVALID_COST', name, r.id, 'Cost must be finite and nonnegative');
    }
  }
  if (errors.length) return { errors, warnings };
  const lookup = (table, id) => data[table].find(r => r.id === id);
  const fk = (r, field, target, table, optional = false) => {
    if (optional && (r[field] === null || r[field] === '全部')) return;
    if (!lookup(target, r[field])) error('MISSING_REFERENCE', table, r.id, `${field}=${r[field]} → ${target}`);
  };
  for (const id of PARAMS) {
    const r = lookup('parameters', id);
    if (!r || typeof r.value !== 'number' || !Number.isFinite(r.value) || r.value < 0) error('INVALID_PARAMETER', 'parameters', id, 'Required nonnegative finite parameter');
  }
  if (errors.length) return { errors, warnings };
  for (const id of ['頁面最大寬', '頁面最大高', '培養目標等級']) {
    const n = parameter(data, id);
    if (!Number.isSafeInteger(n) || n < 1) error('INVALID_PARAMETER', 'parameters', id, 'Positive integer required');
  }
  if (!parameter(data, '背包計分倍率')) error('INVALID_PARAMETER', 'parameters', '背包計分倍率', 'Must be positive');
  if (data.families.length !== 5) error('FAMILY_SET', 'families', '', 'V5 requires five families');
  if (data.abilities.length !== 4 || ABILITIES.some(id => !lookup('abilities', id)?.enabled)) error('ABILITY_SET', 'abilities', '', 'Only the four enabled V5 abilities are supported');
  if (data.growth.length !== 5 || GRADES.some(id => !lookup('growth', id))) error('GRADE_SET', 'growth', '', 'Require S/A/B/C/D');
  for (const a of data.abilities) {
    if (a.min < 0 || a.min > a.max || a.perPoint <= 0 || a.zero > a.min) error('INVALID_ABILITY_RANGE', 'abilities', a.id, 'min/max/perPoint/zero');
    if (a.baseline < a.min || a.baseline > a.max) warn('BASELINE_OUTSIDE_RANGE', 'abilities', a.id, 'Baseline is not used for random values');
  }
  for (const g of data.growth) for (const id of ABILITIES) if (g[id] < 0) error('INVALID_GROWTH', 'growth', g.id, id);
  for (const s of data.species) {
    fk(s, 'familyId', 'families', 'species'); fk(s, 'skeletonId', 'skeletons', 'species'); fk(s, 'bodyId', 'assets', 'species');
    const values = [s.minWidth, s.maxWidth, s.minHeight, s.maxHeight];
    if (values.some(n => !Number.isSafeInteger(n) || n < 1) || s.minWidth > s.maxWidth || s.minHeight > s.maxHeight || s.maxWidth > parameter(data, '頁面最大寬') || s.maxHeight > parameter(data, '頁面最大高')) error('INVALID_SIZE', 'species', s.id, 'Invalid integer size range/global limit');
    const visuals = data.visuals.filter(v => v.enabled && v.speciesId === s.id);
    if (!visuals.length) warn('MISSING_VISUAL_RULE', 'species', s.id, 'Use text placeholder');
    for (const v of visuals) if (v.familyId !== s.familyId || v.skeletonId !== s.skeletonId) warn('VISUAL_MISMATCH', 'species', s.id, v.id);
    const body = lookup('assets', s.bodyId);
    if (body && (body.familyId !== s.familyId || body.skeletonId !== s.skeletonId || body.speciesId !== s.id)) warn('BODY_MAPPING_REVIEW', 'species', s.id, s.bodyId);
  }
  for (const a of data.assets) {
    fk(a, 'familyId', 'families', 'assets', true); fk(a, 'speciesId', 'species', 'assets', true); fk(a, 'skeletonId', 'skeletons', 'assets');
  }
  for (const v of data.visuals) {
    fk(v, 'familyId', 'families', 'visuals'); fk(v, 'speciesId', 'species', 'visuals'); fk(v, 'skeletonId', 'skeletons', 'visuals');
    for (const hair of tokens(v.hair)) if (!lookup('assets', hair)) warn('MISSING_HAIR_REFERENCE', 'visuals', v.id, hair);
    for (const [field, category] of [['hairColor','髮色'], ['skinColor','膚色'], ['eyes','眼睛']]) {
      if (!optionPool(data, v[field], category, v.familyId).length) warn('EMPTY_VISUAL_POOL', 'visuals', v.id, field);
    }
  }
  for (const o of data.options) {
    if (o.families !== '全部') for (const f of tokens(o.families)) if (!lookup('families', f)) error('MISSING_REFERENCE', 'options', o.id, `family=${f}`);
  }
  for (const t of data.talents) {
    if (!lookup('skills', t.skillId)) warn('MISSING_TALENT_SKILL', 'talents', t.id, `Excluded: ${t.skillId}`);
    else if (t.enabled && t.targetType !== '無') warn('UNRESOLVED_BINDING', 'talents', t.id, 'No target catalogue; example ID is not an actual binding');
  }
  for (const p of data.personalities) if (p.effectId && !lookup('skills', p.effectId)) error('MISSING_REFERENCE', 'personalities', p.id, `effectId=${p.effectId}`);
  for (const table of ['species', 'personalities', 'options']) {
    const pool = data[table].filter(r => r.enabled !== false);
    if (!pool.length || !Number.isFinite(pool.reduce((s,r) => s+r.weight, 0)) || pool.reduce((s,r) => s+r.weight, 0) <= 0) error('EMPTY_WEIGHT_POOL', table, '', 'Active weight sum must be finite and positive');
  }
  const ranges = data.rarities.filter(r => r.enabled).sort((a,b) => a.min-b.min);
  if (!ranges.length) error('EMPTY_RARITY_POOL', 'rarities', '', 'No enabled ranges');
  ranges.forEach((r,i) => {
    if (!Number.isSafeInteger(r.min) || !Number.isSafeInteger(r.max) || r.min < 0 || r.max < r.min) error('INVALID_RARITY_RANGE','rarities',r.id,'Require nonnegative integer closed interval');
    if (i && r.min <= ranges[i-1].max) error('RARITY_OVERLAP','rarities',r.id,'Overlapping interval');
    if ((i && r.min > ranges[i-1].max+1) || (!i && r.min !== 0)) error('RARITY_GAP','rarities',r.id,'Gap between integer intervals');
  });
  return { errors, warnings };
}
export function assertValidData(data) {
  const result = validateData(data);
  if (result.errors.length) throw new Error(`INVALID_DATA: ${JSON.stringify(result.errors)}`);
  return result;
}
export function tokens(value) { return typeof value === 'string' ? value.split(/[,，;；\s]+/u).filter(Boolean) : []; }
export function optionPool(data, pattern, category, familyId) {
  return data.options.filter(o => o.enabled && o.category === category && (o.families === '全部' || tokens(o.families).includes(familyId)) && tokens(pattern).some(p => p.endsWith('*') ? o.id.startsWith(p.slice(0,-1)) : o.id === p));
}
