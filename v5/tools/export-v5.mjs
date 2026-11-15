import { readFile, writeFile, mkdir, mkdtemp, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { importWorkbook } from './import-workbook.mjs';
import { validateData } from '../src/validate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] || 'C:/Users/johnn/Downloads/RPG_角色生成器_V5_完整可編輯.xlsx');
const output = resolve(process.argv[3] || join(root, 'data/v5.json'));
const temp = await mkdtemp(join(tmpdir(), 'rpg-v5-'));
try {
  if (extname(source).toLowerCase() !== '.xlsx' || extname(output).toLowerCase() !== '.json') throw new Error('INVALID_FILE_TYPE: source must be .xlsx and output must be .json; original Excel cannot be an output');
  const before = createHash('sha256').update(await readFile(source)).digest('hex');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'tools/read-xlsx.ps1'), '-Source', source, '-Output', join(temp, 'raw.json')], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  const raw = JSON.parse((await readFile(join(temp, 'raw.json'), 'utf8')).replace(/^\uFEFF/, ''));
  const after = createHash('sha256').update(await readFile(source)).digest('hex');
  if (before !== after || after !== raw.sha256.toLowerCase()) throw new Error('SOURCE_CHANGED_DURING_EXPORT');
  const data = importWorkbook(raw);
  const validation = validateData(data);
  if (validation.errors.length) throw new Error(JSON.stringify(validation, null, 2));
  const payload = { ...data, validation };
  await mkdir(dirname(output), { recursive: true });
  // A failed validation never replaces the last valid JSON.
  await writeFile(output + '.tmp', JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await rename(output + '.tmp', output);
  console.log(`Exported ${output}\nSHA256 ${after}\n${validation.errors.length} errors, ${validation.warnings.length} warnings`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await rm(temp, { recursive: true, force: true }); }
