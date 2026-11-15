import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const source=process.env.V5_SOURCE || 'C:/Users/johnn/Downloads/RPG_角色生成器_V5_完整可編輯.xlsx';
let available=process.platform==='win32';
try {await access(source);} catch {available=false;}
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
test('real Excel export: deterministic JSON, unchanged original, preserved warnings',{skip:!available,timeout:30000},async()=>{
  const temp=await mkdtemp(join(tmpdir(),'v5-integration-'));
  try {
    const before=sha(await readFile(source)),out=join(temp,'v5.json');
    const run=()=>spawnSync(process.execPath,[resolve(root,'tools/export-v5.mjs'),source,out],{encoding:'utf8',timeout:12000});
    let r=run();assert.equal(r.status,0,r.stderr);const first=await readFile(out,'utf8');
    r=run();assert.equal(r.status,0,r.stderr);assert.equal(await readFile(out,'utf8'),first);
    assert.equal(sha(await readFile(source)),before);
    const d=JSON.parse(first);assert.equal(d.source.sha256.toLowerCase(),before);assert.equal(d.validation.warnings.length,14);assert.equal(d.validation.errors.length,0);
  } finally {await rm(temp,{recursive:true,force:true});}
});
test('failed export leaves existing destination untouched',{skip:process.platform!=='win32',timeout:15000},async()=>{
  const temp=await mkdtemp(join(tmpdir(),'v5-failure-'));
  try {
    const out=join(temp,'last-good.json');await writeFile(out,'last valid data');
    const r=spawnSync(process.execPath,[resolve(root,'tools/export-v5.mjs'),join(temp,'missing.xlsx'),out],{encoding:'utf8',timeout:10000});
    assert.notEqual(r.status,0);assert.equal(await readFile(out,'utf8'),'last valid data');
  } finally {await rm(temp,{recursive:true,force:true});}
});
test('export and generation reject Excel output without touching original',{skip:!available,timeout:15000},async()=>{
  const before=sha(await readFile(source));
  for(const args of [
    [resolve(root,'tools/export-v5.mjs'),source,source],
    [resolve(root,'tools/generate.mjs'),'--seed','protected','--output',source],
  ]) {
    const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:10000});assert.notEqual(r.status,0);assert.match(r.stderr,/\.json/);
    assert.equal(sha(await readFile(source)),before);
  }
});
