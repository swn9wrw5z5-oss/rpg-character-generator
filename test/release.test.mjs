import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { buildSite, verifySite, publicFiles, root } from '../tools/release.mjs';
import { createGenerator } from '../v5-legacy/src/core.mjs';
const data=JSON.parse(await readFile(new URL('../v5-legacy/data/v5.json',import.meta.url),'utf8'));
const config=JSON.parse(await readFile(new URL('../v5-legacy/config/test-parameters.json',import.meta.url),'utf8'));
async function artifact(fn){const directory=await mkdtemp(join(tmpdir(),'rpg-clean-'));try{const output=await buildSite({output:join(directory,'public')});await fn(output);}finally{await rm(directory,{recursive:true,force:true});}}
test('release sources: exact reviewed settings, code, relative resources and fourteen warnings',async()=>{
  const report=await verifySite(root,{exact:false});assert.equal(report.files.length,44);assert.equal(report.warningCount,14);
});
test('artifact: forty-four files only and byte-identical legacy homepage',()=>artifact(async output=>{
  assert.equal((await verifySite(output)).files.length,44);assert.deepEqual(await readFile(join(output,'index.html')),await readFile(join(root,'index.html')));
}));
test('source JSON contains no raw cells, reference sheets, file paths or coordinate metadata',()=>{
  assert.deepEqual(Object.keys(data.source),['sha256']);assert.ok(!('referenceSheets'in data));
  for(const value of Object.values(data))if(Array.isArray(value))for(const record of value){assert.ok(!('raw'in record));assert.ok(!('source'in record));assert.ok(!('formulaXml'in record));}
});
test('golden gameplay: same V5 seed yields expected stats, grades, bag, total and rarity',()=>{
  const result=createGenerator(data,config,'v5-demo').generateAt(0,{speciesId:'S003'});assert.equal(result.ok,true);
  assert.deepEqual(result.character.stats,{HP:36,MP:33,HP_REGEN:6,MP_REGEN:8.2});
  assert.deepEqual(result.character.growth,{HP:'S',MP:'D',HP_REGEN:'D',MP_REGEN:'A'});
  assert.deepEqual(result.character.backpack,{width:7,height:5,cells:35});assert.equal(result.calculation.total,157.2);assert.equal(result.calculation.rarity.id,'RAR_R');
  assert.deepEqual(result.character.skills.map(s=>s.id),['K003','K004']);
});
test('same Seed and all species reproduce with the unmodified V5 core',()=>{
  const a=createGenerator(data,config,'release-replay'),b=createGenerator(data,config,'release-replay');
  for(let i=0;i<data.species.length;i++)assert.deepEqual(a.generateAt(i,{speciesId:data.species[i].id}),b.generateAt(i,{speciesId:data.species[i].id}));
});
test('artifact URLs: all forty-four files load below the GitHub Pages repository prefix',()=>artifact(async output=>{
  const prefix='/rpg-character-generator/';
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://local'),path=url.pathname.slice(prefix.length);
    const file=path===''?'index.html':path==='v5/'?'v5/index.html':path;
    if(!url.pathname.startsWith(prefix)||!publicFiles.includes(file)){res.writeHead(404);res.end();return;}
    const type=file.endsWith('.mjs')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':'text/html';
    res.writeHead(200,{'Content-Type':type});res.end(await readFile(join(output,file)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const base=`http://127.0.0.1:${server.address().port}${prefix}`;for(const file of publicFiles)assert.equal((await fetch(base+file)).status,200,file);
    const settings=await(await fetch(base+'v5-legacy/data/v5.json')).json();assert.deepEqual(settings,data);
    for(const missing of ['v5/evidence/workbook-inspection.json','v5/test/core.test.mjs','v5/tools/export-v5.mjs','.git/config'])assert.equal((await fetch(base+missing)).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));}
}));
test('rebuild removes accidental internal files from generated dist',()=>artifact(async output=>{
  await mkdir(join(output,'evidence'));await writeFile(join(output,'evidence/unused.json'),'internal');
  await buildSite({output});assert.equal((await verifySite(output)).files.length,44);
}));
test('build refuses to clean the repository source',()=>assert.rejects(buildSite({output:root}),/output must/));
for(const [name,change] of [
  ['extra file',output=>writeFile(join(output,'private.txt'),'internal')],
  ['missing runtime',output=>rm(join(output,'v5/releases/fivelevels-v3-20261116/web/main.mjs'))],
  ['modified legacy homepage',output=>writeFile(join(output,'index.html'),'changed')],
  ['raw JSON metadata',async output=>{const changed=structuredClone(data);changed.referenceSheets=[];await writeFile(join(output,'v5-legacy/data/v5.json'),JSON.stringify(changed));}],
  ['modified probabilities',async output=>{const changed=structuredClone(config);changed.growthWeights.HP.S=100;await writeFile(join(output,'v5/releases/fivelevels-v3-20261116/config/fivelevels-parameters.json'),JSON.stringify(changed));}],
])test('artifact rejects '+name,()=>artifact(async output=>{await change(output);await assert.rejects(verifySite(output));}));
test('workflow: dependency-free, manual only, main plus explicit publish required',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(workflow,/workflow_dispatch:/);assert.match(workflow,/default: false/);assert.match(workflow,/github\.ref == 'refs\/heads\/main' && inputs\.publish == true/);
  assert.ok(!/^\s+(push|pull_request|schedule):/m.test(workflow));assert.ok(!workflow.includes('npm --prefix'));assert.ok(!workflow.includes('npm ci'));
  assert.match(workflow,/path: dist/);assert.match(workflow,/node tools\/release.mjs verify dist/);assert.match(workflow,/persist-credentials: false/);assert.match(workflow,/needs: build/);
  assert.ok(!workflow.includes('build-integration'));assert.ok(!workflow.includes('evidence/'));
  for(const [,hash] of workflow.matchAll(/uses: actions\/[\w-]+@([a-f0-9]+)/g))assert.equal(hash.length,40);
});
