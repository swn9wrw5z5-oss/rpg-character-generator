import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildIntegration, repositoryRoot } from '../tools/build-integration.mjs';
import { startIntegrationServer } from '../tools/serve-integration.mjs';
import { createGenerator } from '../v5/src/core.mjs';
const require=createRequire(new URL('../v5/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const data=JSON.parse(await readFile(new URL('../v5/data/v5.json',import.meta.url),'utf8'));
const parameters=JSON.parse(await readFile(new URL('../v5/config/test-parameters.json',import.meta.url),'utf8'));
const legacyBase='1fa1240b57abcb80ea639bf35ca9bb43fb7486fc';
const git=(args)=>execFileSync('git',args,{cwd:repositoryRoot,encoding:'utf8'}).trim();
async function withSite(prefix,fn){
  const temp=await mkdtemp(join(tmpdir(),'rpg-integration-'));let server;
  try{const root=await buildIntegration({output:join(temp,'public')});server=await startIntegrationServer({root,port:0,prefix});await fn({root,base:`http://127.0.0.1:${server.address().port}${prefix}`});}
  finally{if(server)await new Promise(resolvePromise=>server.close(resolvePromise));await rm(temp,{recursive:true,force:true});}
}
test('integration: original root index.html and README match remote main blobs',()=>{
  for(const path of ['index.html','README.md'])assert.equal(git(['hash-object',path]),git(['rev-parse',legacyBase+':'+path]));
});
test('integration: every file imported from V5 94cea44 matches its original Git blob',()=>{
  const manifest=require('../integration/v5-snapshot.json');
  assert.equal(manifest.sourceCommit,'94cea441fc93e7466a49e1bb8c364ca909450318');
  for(const [path,expected] of Object.entries(manifest.files))assert.equal(git(['hash-object','--no-filters','v5/'+path]),expected,path);
});
for(const prefix of ['/','/rpg-character-generator/']){
  test(`integration: ${prefix}v5/ loads HTML, CSS, modules, JSON using only V5-relative paths`,()=>withSite(prefix,async({base})=>{
    const page=new URL('v5/?seed=subpath-check&species=S003',base),response=await fetch(page);
    assert.equal(response.status,200);const html=await response.text();const dom=new JSDOM(html,{url:page.href});
    const resources=[...dom.window.document.querySelectorAll('script[src],link[href]')].map(node=>new URL(node.getAttribute('src')||node.getAttribute('href'),page));
    assert.ok(resources.length>=3);
    for(const resource of resources){assert.ok(resource.pathname.startsWith(new URL('v5/',base).pathname));assert.equal((await fetch(resource)).status,200,resource.href);}
    const mainUrl=new URL('./web/main.mjs',page);
    for(const relative of ['../data/v5.json','../config/test-parameters.json']){
      const url=new URL(relative,mainUrl);assert.ok(url.pathname.startsWith(new URL('v5/',base).pathname));const r=await fetch(url);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/json/);
    }
    const appUrl=new URL('./web/app.mjs',page);const coreUrl=new URL('../src/core.mjs',appUrl);
    assert.equal((await fetch(coreUrl)).status,200);assert.match((await fetch(coreUrl)).headers.get('content-type'),/javascript/);
    dom.window.close();
  }));
  test(`integration: ${prefix}v5 redirects to trailing slash while preserving Seed query`,()=>withSite(prefix,async({base})=>{
    const r=await fetch(new URL('v5?seed=demo',base),{redirect:'manual'});assert.equal(r.status,308);assert.equal(r.headers.get('location'),prefix+'v5/?seed=demo');
  }));
  test(`integration: V5 bootstrap under ${prefix}v5/ fetches its own data and matches existing core`,()=>withSite(prefix,async({base})=>{
    const page=new URL('v5/?seed=integrated-seed&species=S003',base),dom=new JSDOM(await(await fetch(page)).text(),{url:page.href});
    const saved={document:globalThis.document,location:globalThis.location,fetch:globalThis.fetch};
    const requested=[];const nativeFetch=saved.fetch;
    globalThis.document=dom.window.document;globalThis.location=dom.window.location;
    globalThis.fetch=async input=>{
      const url=new URL(input);assert.ok(url.pathname.includes('/v5/'),url.href);
      // main.mjs resolves via import.meta.url; translate the local module URL into its HTTP counterpart.
      const relative=url.protocol==='file:'?url.pathname.split('/v5/').at(-1):null;
      const target=relative?new URL('v5/'+relative,base):url;requested.push(target.href);return nativeFetch(target);
    };
    try{
      await import(new URL('../v5/web/main.mjs?integration='+encodeURIComponent(prefix),import.meta.url));
      assert.equal(dom.window.document.documentElement.dataset.appReady,'true');assert.equal(requested.length,2);
      for(const url of requested)assert.ok(new URL(url).pathname.startsWith(new URL('v5/',base).pathname));
      dom.window.document.querySelector('#developer-mode').click();
      const actual=JSON.parse(dom.window.document.querySelector('[data-testid="raw-result"]').textContent);
      assert.deepEqual(actual,createGenerator(data,parameters,'integrated-seed').generateAt(0,{speciesId:'S003'}));
    }finally{
      for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}dom.window.close();
    }
  }));
}
test('integration: release artifact preserves legacy homepage and contains only public V5 assets',()=>withSite('/',async({root,base})=>{
  assert.deepEqual(await readFile(join(root,'index.html')),await readFile(join(repositoryRoot,'index.html')));
  assert.deepEqual((await readdir(root)).sort(),['.nojekyll','index.html','v5']);
  assert.deepEqual((await readdir(join(root,'v5'))).sort(),['.nojekyll','config','data','index.html','src','web']);
  await access(join(root,'.nojekyll'));
  for(const path of ['v5/evidence/workbook-inspection.json','v5/test/web.test.mjs','v5/tools/export-v5.mjs','v5/__qa/runner.html','.git/config','.local/pages-inspection.json'])assert.equal((await fetch(new URL(path,base))).status,404,path);
}));
test('integration: all V5 CSS/module/runtime resource references stay relative and isolated',async()=>{
  const files=['web/main.mjs','web/app.mjs','src/core.mjs','src/validate.mjs','src/schema.mjs'];
  for(const path of files){
    const text=await readFile(join(repositoryRoot,'v5',path),'utf8');
    for(const match of text.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g))assert.match(match[1],/^\.\.?\//,`${path}: ${match[1]}`);
    assert.ok(!text.includes('raceData')&&!text.includes('rpgRanges'),path);
  }
  const css=await readFile(join(repositoryRoot,'v5/web/style.css'),'utf8');assert.ok(!/url\(\s*['"]?(?:\/|https?:)/i.test(css));
});
