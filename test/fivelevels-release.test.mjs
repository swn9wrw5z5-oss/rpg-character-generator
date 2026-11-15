import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGenerator,assertBirthInvariants} from '../v5/releases/fivelevels-v3-20261116/src/skill-core.mjs';
import {stableStringify} from '../v5/releases/fivelevels-v3-20261116/src/core.mjs';
const runtime=new URL('../v5/releases/fivelevels-v3-20261116/',import.meta.url);
const [data,parameters,rules,parity,previous,manifest]=await Promise.all([new URL('data/fivelevels.json',runtime),new URL('config/fivelevels-parameters.json',runtime),new URL('config/fivelevels-rules.json',runtime),new URL('../release/parity.json',import.meta.url),new URL('../release/previous-manifest.json',import.meta.url),new URL('../release/manifest.json',import.meta.url)].map(async p=>JSON.parse(await readFile(p,'utf8'))));
function omitIcons(value){if(Array.isArray(value))return value.map(omitIcons);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='icon').map(([k,v])=>[k,omitIcons(v)]));return value;}
test('production parity: 1000 complete results match the tested development core (display icons excluded)',()=>{
 const generator=createGenerator(data,parameters,rules,parity.seed),hash=createHash('sha256');
 for(let i=0;i<parity.count;i++){const r=generator.generateAt(i);assert.equal(r.ok,true);assertBirthInvariants(r.character,rules);hash.update(stableStringify(omitIcons(r))+'\n');}
 assert.equal(hash.digest('hex'),parity.sha256);assert.equal(generator.generateAt(0).replay.algorithm,parity.algorithm);
});
test('published v0.2 root and previous V5 backup match pre-release hashes exactly',async()=>{
 for(const record of previous.files){const path=record.path.startsWith('v5/')?record.path.replace(/^v5\//,'v5-legacy/'):record.path;let bytes=await readFile(new URL('../'+path,import.meta.url));if(record.lineEndings==='lf-normalized')bytes=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'));assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256,path);}
});
test('five-level model: 27 skills, five data-driven levels and default constraints',()=>{
 assert.equal(rules.version,3);assert.equal(rules.skills.length,27);assert.equal(rules.levelTables.length,27);for(const table of rules.levelTables)assert.deepEqual(table.levels.map(l=>l.level),[1,2,3,4,5]);
 assert.deepEqual(rules.rarityProfiles.map(p=>p.weight),[7000,2200,650,130,20]);assert.equal(rules.mutation.probability,.1);assert.equal(rules.mutation.skillBudgetMultiplier,1.5);
});
test('static page: no local upload/API, and all default icon URLs refer to whitelisted files',async()=>{
 const files=new Set(manifest.files.map(f=>f.path)),base=manifest.runtimeBase;
 for(const skill of rules.skills){assert.ok(skill.icon.startsWith('./'));assert.ok(files.has(base+skill.icon.slice(2)));}
 const icons=JSON.parse(await readFile(new URL('config/species-icons.json',runtime),'utf8'));
 for(const style of Object.values(icons.species))for(const path of Object.values(style))assert.ok(files.has(base+path.slice(2)));
 const app=await readFile(new URL('web/app.mjs',runtime),'utf8'),main=await readFile(new URL('web/main.mjs',runtime),'utf8');assert.ok(app.includes('./public-statistics.mjs'));assert.ok(!app.includes('./excel-panel.mjs'));assert.ok(main.includes('../data/fivelevels.json'));assert.ok(!main.includes('../data/v5.json'));
 const html=await readFile(new URL('../v5/index.html',import.meta.url),'utf8');assert.ok(html.includes('<base href="./releases/fivelevels-v3-20261116/">'));assert.ok(!manifest.files.some(f=>/xlsx|evidence|test\/|tools\/|baseline|inspection/i.test(f.path)));
});
