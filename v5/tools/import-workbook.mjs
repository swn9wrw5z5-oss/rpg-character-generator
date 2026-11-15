import { schemas } from '../src/schema.mjs';
import formulaContract from './formula-contract.json' with { type: 'json' };

export function importWorkbook(raw) {
  const sheets = new Map(raw.sheets.map(s => [s.name, s]));
  if (sheets.size !== raw.sheets.length) throw new Error('DUPLICATE_SHEET');
  const cellMaps = new Map(raw.sheets.map(s => [s.name, new Map(s.rows.flatMap(r => r.cells.map(c => [c.cell, c])))]));
  // A changed workbook formula is a new contract, not permission to keep using old JS arithmetic.
  const canonical = text => (text || '').replace(/\$/g, '').replace(/\s+/g, '').replace(/^=/, '');
  for (const [address, expected] of Object.entries(formulaContract)) {
    if (canonical(cellMaps.get('角色計算')?.get(address)?.formula) !== canonical(expected)) {
      throw new Error(`FORMULA_CONTRACT_CHANGED: 角色計算!${address}; review core semantics before importing`);
    }
  }
  const visiting = new Set();
  // Only direct cell references are supported in active source tables. Never trust a formula cache.
  function value(sheet, c) {
    if (!c) return null;
    if (c.formulaXml || c.formula) {
      const key = `${sheet}!${c.cell}`;
      if (visiting.has(key)) throw new Error(`FORMULA_CYCLE: ${key}`);
      const ref = c.formula.match(/^=?('?)([^'!]+)\1!\$?([A-Z]+)\$?(\d+)$/);
      if (!ref) throw new Error(`UNSUPPORTED_FORMULA: ${key}: ${c.formula || 'shared formula'}`);
      const target = cellMaps.get(ref[2])?.get(ref[3] + ref[4]);
      if (!target) throw new Error(`MISSING_FORMULA_REFERENCE: ${key}`);
      visiting.add(key);
      const result = value(ref[2], target);
      visiting.delete(key);
      return result;
    }
    if (c.type === 'e') throw new Error(`EXCEL_ERROR: ${sheet}!${c.cell}`);
    if (c.value === '') return null;
    if (!c.type || c.type === 'n') {
      const n = Number(c.value);
      if (!Number.isFinite(n)) throw new Error(`INVALID_NUMBER: ${sheet}!${c.cell}`);
      return n;
    }
    if (c.type === 'b') {
      if (!['0','1'].includes(c.value)) throw new Error(`INVALID_FLAG: ${sheet}!${c.cell}`);
      return c.value === '1';
    }
    return c.value;
  }
  const data = { schemaVersion: 1, formulaContract: 'v5-four-values-floor-v1', source: { file: raw.source, sha256: raw.sha256, sheetCount: raw.sheets.length } };
  for (const [name, [sheetName, fields]] of Object.entries(schemas)) {
    const sheet = sheets.get(sheetName);
    if (!sheet || !sheet.rows.length) throw new Error(`MISSING_SHEET: ${sheetName}`);
    const headers = new Map();
    for (const c of sheet.rows[0].cells) {
      if (headers.has(c.value)) throw new Error(`DUPLICATE_COLUMN: ${sheetName} ${c.value}`);
      headers.set(c.value, c.cell.replace(/\d/g, ''));
    }
    const mappings = fields.split(' ').map(f => {
      const [keyType, header] = f.split('=');
      const [key, type] = keyType.split(':');
      if (!headers.has(header)) throw new Error(`MISSING_COLUMN: ${sheetName} ${header}`);
      return { key, type, header, column: headers.get(header) };
    });
    data[name] = [];
    for (const row of sheet.rows.slice(1)) {
      const cells = new Map(row.cells.map(c => [c.cell.replace(/\d/g, ''), c]));
      // Ignore formatting-only rows, but never discard a populated row with a missing primary key.
      if (!row.cells.some(c => c.value !== '' || c.formula || c.formulaXml)) continue;
      const record = { source: { sheet: sheetName, row: row.row }, raw: {} };
      for (const [header, col] of headers) {
        const c = cells.get(col);
        // Preserve non-operative formula text/cache (e.g. talent reference checks) without executing it.
        record.raw[header] = c ? { value: c.value, type: c.type, formula: c.formula, formulaXml: c.formulaXml } : null;
      }
      for (const { key, type, column } of mappings) {
        const v = value(sheetName, cells.get(column));
        if (type === 'n' && (typeof v !== 'number' || !Number.isFinite(v))) throw new Error(`INVALID_NUMBER: ${sheetName} row ${row.row} ${key}`);
        if (type === 'b' && ![0, 1, false, true].includes(v)) throw new Error(`INVALID_FLAG: ${sheetName} row ${row.row} ${key}`);
        record[key] = type === 'b' ? Boolean(v) : v;
      }
      data[name].push(record);
    }
  }
  // Retain documentation and calculation exemplars as evidence, not configuration fallback.
  data.referenceSheets = raw.sheets.filter(s => !Object.values(schemas).some(([n]) => s.name === n) && s.name !== 'V4原值與註解');
  return data;
}
