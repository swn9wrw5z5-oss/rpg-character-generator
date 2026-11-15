import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { mountApp } from '../web/app.mjs';
import { createGenerator } from '../src/core.mjs';
import { buildWeb } from '../tools/build-web.mjs';
import { startServer } from '../tools/serve.mjs';

const data=JSON.parse(await readFile(new URL('../data/v5.json',import.meta.url),'utf8'));
const parameters=JSON.parse(await readFile(new URL('../config/test-parameters.json',import.meta.url),'utf8'));
function app(options={}){
  const dom=new JSDOM('<!doctype html><html lang="zh-Hant"><body><div id="app"></div></body></html>',{url:'http://localhost/'});
  const doc=dom.window.document,root=doc.querySelector('#app');
  const instance=mountApp(root,{data,parameters,seed:'v5-demo',speciesId:'S003',...options});
  const q=selector=>root.querySelector(selector);
  const submit=()=>q('#generation-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  return {dom,doc,root,q,instance,submit};
}
test('web: initial display and developer JSON match phase-2 core exactly',()=>{
  const a=app(),expected=createGenerator(data,parameters,'v5-demo').generateAt(0,{speciesId:'S003'});
  assert.equal(a.q('[data-testid="species-name"]').textContent,'狼人');assert.deepEqual(a.instance.getResult(),expected);
  a.q('#developer-mode').click();assert.deepEqual(JSON.parse(a.q('[data-testid="raw-result"]').textContent),expected);
  a.dom.window.close();
});
test('web: four ability values and S/A/B/C/D badges are the core values',()=>{
  const a=app(),c=a.instance.getResult().character;
  assert.equal(a.root.querySelectorAll('[data-stat]').length,4);
  for(const [id,n] of Object.entries(c.stats)){
    assert.equal(Number(a.q(`[data-stat="${id}"] .stat-value`).textContent),n);
    assert.equal(a.q(`[data-stat="${id}"] .grade`).textContent,c.growth[id]);
  }
  a.dom.window.close();
});
test('web: ID, family, rarity, personality and skills all originate from core',()=>{
  const a=app(),c=a.instance.getResult().character;
  assert.equal(a.q('[data-testid="character-id"]').textContent,c.id);
  assert.ok(a.q('.category').textContent.includes(data.families.find(f=>f.id===c.familyId).name));
  assert.equal(a.q('.rarity').textContent,c.rarity.name);assert.ok(a.q('.personality').textContent.includes(c.personality.name));
  assert.deepEqual([...a.root.querySelectorAll('[data-skill]')].map(n=>n.dataset.skill),c.skills.map(s=>s.id));a.dom.window.close();
});
test('web: backpack renders actual dimensions and cell count',()=>{
  const a=app(),c=a.instance.getResult().character,grid=a.q('.inventory-grid');
  assert.equal(grid.children.length,c.backpack.width*c.backpack.height);
  assert.equal(grid.style.getPropertyValue('--columns'),String(c.backpack.width));
  assert.ok(grid.getAttribute('aria-label').includes(`高 ${c.backpack.height} 格`));a.dom.window.close();
});
test('web: maximum 10x8 backpack uses all 80 cells',()=>{
  let seed;
  for(let i=0;i<200;i++){const s='grid-'+i,r=createGenerator(data,parameters,s).generateAt(0,{speciesId:'S003'});if(r.ok&&r.character.backpack.cells===80){seed=s;break;}}
  assert.ok(seed);const a=app({seed});assert.equal(a.q('.inventory-grid').children.length,80);assert.equal(a.q('.inventory-grid').style.getPropertyValue('--columns'),'10');a.dom.window.close();
});
test('web: player mode has no hidden calculation DOM or raw JSON',()=>{
  const a=app();assert.equal(a.q('#developer-region').hidden,true);assert.equal(a.q('#developer-region').children.length,0);
  assert.equal(a.q('[data-testid="raw-result"]'),null);assert.ok(!a.root.textContent.includes('157.2'));assert.equal(a.q('#player-mode').getAttribute('aria-pressed'),'true');a.dom.window.close();
});
test('web: developer expands scores and switching back removes them without regenerating',()=>{
  const a=app(),before=a.instance.getResult();a.q('#developer-mode').click();
  assert.equal(a.q('#developer-region').hidden,false);assert.equal(Number(a.q('[data-testid="total-score"]').textContent),157.2);
  assert.ok(a.q('#developer-region').textContent.includes('隱藏潛力分'));assert.ok(a.q('[data-testid="rarity-proof"]').textContent.includes('157 → 稀有'));
  for(const details of a.root.querySelectorAll('#developer-region details')){details.open=true;assert.equal(details.open,true);}
  a.q('#player-mode').click();assert.equal(a.q('#developer-region').children.length,0);assert.deepEqual(a.instance.getResult(),before);a.dom.window.close();
});
test('web: changing species waits for submit then uses selected species in core',()=>{
  const a=app();a.q('#species').value='S001';a.q('#species').dispatchEvent(new a.dom.window.Event('change'));
  assert.equal(a.q('[data-testid="species-name"]').textContent,'狼人');a.submit();assert.equal(a.q('[data-testid="species-name"]').textContent,'人類');
  assert.deepEqual(a.instance.getResult(),createGenerator(data,parameters,'v5-demo').generateAt(0,{speciesId:'S001'}));a.dom.window.close();
});
test('web: all-random option delegates weighted species draw to core',()=>{
  const a=app();a.q('#species').value='';a.submit();assert.deepEqual(a.instance.getResult(),createGenerator(data,parameters,'v5-demo').generateAt(0));a.dom.window.close();
});
test('web: same seed/settings produce identical result through repeated form submits',()=>{
  const a=app();a.q('#seed').value='手機種子-123';a.submit();const first=a.instance.getResult();a.submit();assert.deepEqual(a.instance.getResult(),first);a.q('#developer-mode').click();a.q('#player-mode').click();assert.deepEqual(a.instance.getResult(),first);a.dom.window.close();
});
test('web: new-seed action changes only seed then calls same core',()=>{
  const a=app();a.q('#another-seed').click();assert.notEqual(a.q('#seed').value,'v5-demo');assert.deepEqual(a.instance.getResult(),createGenerator(data,parameters,a.q('#seed').value).generateAt(0,{speciesId:'S003'}));a.dom.window.close();
});
test('web: whitespace seed gives user error without losing last valid character',()=>{
  const a=app(),before=a.instance.getResult();a.q('#seed').value=' ';a.submit();assert.equal(a.q('#error').hidden,false);assert.ok(a.q('#error').textContent.includes('請輸入 Seed'));assert.deepEqual(a.instance.getResult(),before);a.dom.window.close();
});
test('web: V5 reference and visual warnings are preserved',()=>{
  const a=app({speciesId:'S014'}),r=a.instance.getResult();assert.equal(r.warnings.filter(w=>w.code==='MISSING_TALENT_SKILL').length,4);
  assert.equal(r.warnings.filter(w=>['VISUAL_MISMATCH','MISSING_VISUAL_RULE','BODY_MAPPING_REVIEW'].includes(w.code)).length,6);
  assert.equal(a.q('[data-testid="species-name"]').textContent,'精靈族');assert.equal(r.character.appearance.imagePath,null);a.dom.window.close();
});
test('web: draft talents display unconfirmed bindings and no invented targets',()=>{
  const p=structuredClone(parameters);p.allowDraftTalents=true;p.talentChance=1;p.talentCount={min:2,max:2};
  const a=app({parameters:p});assert.equal(a.root.querySelectorAll('[data-talent]').length,2);assert.ok(a.q('#character').textContent.includes('綁定待確認'));assert.ok(a.instance.getResult().character.talents.every(t=>t.binding.targetId===null));a.dom.window.close();
});
test('web: failed generation clears old character and hides numeric failures from player',()=>{
  const p=structuredClone(parameters);p.budget=0;const a=app({parameters:p});assert.equal(a.instance.getResult().ok,false);assert.equal(a.q('[data-testid="character-id"]'),null);assert.equal(a.q('#error').hidden,false);
  assert.ok(a.q('#error').textContent.includes('預算不足'));assert.ok(!a.q('#error').textContent.includes('Required'));assert.equal(a.q('#developer-region').children.length,0);
  a.q('#developer-mode').click();assert.equal(JSON.parse(a.q('[data-testid="raw-result"]').textContent).ok,false);a.dom.window.close();
});
test('web: invalid initial species rejects rather than inventing a fallback',()=>assert.throws(()=>app({speciesId:'UNKNOWN'}),/無效/));
test('web: no-generation initial state can generate when requested',()=>{
  const a=app({autoGenerate:false});assert.equal(a.instance.getResult(),null);assert.equal(a.q('[data-testid="character-id"]'),null);a.submit();assert.equal(a.instance.getResult().ok,true);a.dom.window.close();
});
test('web: source strings are rendered as text, not executable markup',()=>{
  const d=structuredClone(data);d.species.find(s=>s.id==='S003').name='<img src=x onerror=alert(1)>';
  const a=app({data:d});assert.equal(a.q('[data-testid="species-name"]').textContent,'<img src=x onerror=alert(1)>');assert.equal(a.q('#character img'),null);a.dom.window.close();
});
test('web build and HTTP: relative module assets work under project prefix; sensitive files excluded',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'v5-web-'));let server;
  try{
    const root=await buildWeb({output:join(temp,'public')});server=await startServer({root,port:0});const origin=`http://127.0.0.1:${server.address().port}`;
    const html=await fetch(origin+'/');assert.equal(html.status,200);assert.match(await html.text(),/lang="zh-Hant"/);
    for(const path of ['/web/main.mjs','/web/app.mjs','/src/core.mjs','/data/v5.json','/config/test-parameters.json','/web/style.css'])assert.equal((await fetch(origin+path)).status,200,path);
    assert.match((await fetch(origin+'/src/core.mjs')).headers.get('content-type'),/javascript/);
    for(const path of ['/.git/config','/evidence/workbook-inspection.json','/tools/serve.mjs','/__qa/runner.html','/src/%2e%2e/.git/config'])assert.equal((await fetch(origin+path)).status,404,path);
    assert.equal((await fetch(origin+'/',{method:'POST'})).status,405);
    const main=await (await fetch(origin+'/web/main.mjs')).text();assert.ok(main.includes("new URL('../data/v5.json',import.meta.url)"));
    const prefixed=new URL('../data/v5.json','https://example.test/repository/web/main.mjs');assert.equal(prefixed.pathname,'/repository/data/v5.json');
    await access(join(root,'.nojekyll'));await assert.rejects(access(join(root,'evidence')));
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});}
});
test('web: standard build removes browser QA assets from a previous QA build',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'v5-web-qa-'));
  try{
    await buildWeb({output:temp,qa:true});await access(join(temp,'__qa/runner.html'));
    await buildWeb({output:temp});await assert.rejects(access(join(temp,'__qa/runner.html')));
  }finally{await rm(temp,{recursive:true,force:true});}
});
async function bootstrap({query='',failure=false,invalid=false}={}){
  const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/'+query});
  const original={document:globalThis.document,location:globalThis.location,fetch:globalThis.fetch};
  globalThis.document=dom.window.document;globalThis.location=dom.window.location;
  globalThis.fetch=async url=>{
    if(failure)return new Response('missing',{status:404});
    const payload=String(url).includes('/data/')?(invalid?{schemaVersion:99}:data):parameters;
    return new Response(JSON.stringify(payload),{headers:{'Content-Type':'application/json'}});
  };
  try{await import(new URL('../web/main.mjs?case='+JSON.stringify({query,failure,invalid}),import.meta.url));return dom;}
  finally{for(const [key,value] of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
}
test('web bootstrap loads JSON and applies URL seed/species to the existing core',async()=>{
  const dom=await bootstrap({query:'?seed=url-seed&species=S001'}),d=dom.window.document;
  assert.equal(d.documentElement.dataset.appReady,'true');assert.equal(d.querySelector('#seed').value,'url-seed');assert.equal(d.querySelector('[data-testid="species-name"]').textContent,'人類');dom.window.close();
});
test('web bootstrap reports missing data without inventing default characters',async()=>{
  const dom=await bootstrap({failure:true});assert.equal(dom.window.document.documentElement.dataset.appReady,'error');assert.equal(dom.window.document.querySelector('[data-testid="character-id"]'),null);assert.ok(dom.window.document.querySelector('[role="alert"]').textContent.includes('讀取失敗'));dom.window.close();
});
test('web bootstrap shows invalid data error and no substitute character',async()=>{
  const dom=await bootstrap({invalid:true});assert.equal(dom.window.document.querySelector('[data-testid="character-id"]'),null);assert.ok(dom.window.document.querySelector('[role="alert"]').textContent.includes('無法啟動'));dom.window.close();
});
