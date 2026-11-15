import { createGenerator } from '../src/core.mjs';
import { mountApp } from '../web/app.mjs';
const frame=document.querySelector('#phone'),results=[];
const assert=(condition,message='Assertion failed')=>{if(!condition)throw new Error(message);};
const equal=(a,b)=>assert(JSON.stringify(a)===JSON.stringify(b),`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const tick=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
async function check(name,fn){try{await fn();results.push({name,pass:true});}catch(error){results.push({name,pass:false,message:error.message});}const row=document.createElement('li');row.className=results.at(-1).pass?'pass':'fail';row.textContent=`${results.at(-1).pass?'通過':'失敗'} · ${name}${results.at(-1).message?' · '+results.at(-1).message:''}`;document.querySelector('#results').append(row);}
const timeout=Date.now()+15000;
while(frame.contentDocument?.documentElement.dataset.appReady!=='true'){if(Date.now()>timeout)throw new Error('App load timeout');await new Promise(r=>setTimeout(r,50));}
const d=frame.contentDocument,w=frame.contentWindow,q=selector=>d.querySelector(selector);
const [data,parameters]=await Promise.all(['data/v5.json','config/test-parameters.json'].map(async path=>(await fetch('../'+path)).json()));
const submit=()=>q('#generation-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
const changeSpecies=id=>{q('#species').value=id;q('#species').dispatchEvent(new w.Event('change',{bubbles:true}));submit();};
const readResult=()=>{q('#developer-mode').click();return JSON.parse(q('[data-testid="raw-result"]').textContent);};
await check('初始玩家模式顯示 V5 角色與四能力評級',()=>{
  equal(q('[data-testid="species-name"]').textContent,'狼人');equal(d.querySelectorAll('[data-stat]').length,4);equal(d.querySelectorAll('.grade').length,4);equal(q('#player-mode').getAttribute('aria-pressed'),'true');
});
await check('網頁完整角色／分數等於第二階段核心輸出',()=>{
  equal(readResult(),createGenerator(data,parameters,'v5-demo').generateAt(0,{speciesId:'S003'}));
});
await check('能力數值、成長、技能與個性均直接呈現核心結果',()=>{
  const r=readResult();for(const [id,value] of Object.entries(r.character.stats)){equal(Number(q(`[data-stat="${id}"] .stat-value`).textContent.replaceAll(',','')),value);equal(q(`[data-stat="${id}"] .grade`).textContent,r.character.growth[id]);}
  equal([...d.querySelectorAll('[data-skill]')].map(n=>n.dataset.skill),r.character.skills.map(s=>s.id));assert(q('.personality').textContent.includes(r.character.personality.name));
});
await check('背包格數與寬高來自生成結果',()=>{
  const r=readResult(),grid=q('[data-testid="backpack-grid"]');equal(grid.children.length,r.character.backpack.cells);equal(Number(grid.style.getPropertyValue('--columns')),r.character.backpack.width);assert(grid.getAttribute('aria-label').includes(`高 ${r.character.backpack.height} 格`));
});
await check('開發者模式可展開總分、隱藏潛力、成本與判級',()=>{
  q('#developer-mode').click();for(const details of d.querySelectorAll('#developer-region details'))details.open=true;
  assert(!q('#developer-region').hidden);assert(q('#developer-region').textContent.includes('隱藏潛力'));equal(Number(q('[data-testid="total-score"]').textContent),157.2);assert(q('[data-testid="rarity-proof"]').textContent.includes('157 → 稀有'));
});
await check('切回玩家移除全部開發者資料而非僅用 CSS 隱藏',()=>{
  q('#player-mode').click();assert(q('#developer-region').hidden);equal(q('#developer-region').children.length,0);assert(!q('[data-testid="raw-result"]'));assert(!q('#app').textContent.includes('157.2'));assert(q('[data-testid="species-name"]'));
});
await check('指定種族可切換，未提交前不偷換角色',()=>{
  q('#species').value='S001';q('#species').dispatchEvent(new w.Event('change',{bubbles:true}));equal(q('[data-testid="species-name"]').textContent,'狼人');submit();equal(q('[data-testid="species-name"]').textContent,'人類');equal(readResult().character.speciesId,'S001');
});
await check('全部隨機使用核心種族權重抽樣',()=>{
  changeSpecies('');equal(readResult(),createGenerator(data,parameters,'v5-demo').generateAt(0));
});
await check('相同 Seed 與設定重現完整結果，模式切換不改變角色',()=>{
  q('#seed').value='手機種子-123';changeSpecies('S003');const first=readResult();q('#player-mode').click();q('#developer-mode').click();equal(readResult(),first);submit();equal(readResult(),first);
});
await check('換 Seed 再生成會更新種子與核心結果',()=>{
  const before=q('#seed').value;q('#another-seed').click();assert(q('#seed').value!==before);equal(readResult(),createGenerator(data,parameters,q('#seed').value).generateAt(0,{speciesId:'S003'}));
});
await check('空 Seed 回報錯誤且不替換上一個有效角色',()=>{
  const id=q('[data-testid="character-id"]').textContent;q('#seed').value=' ';submit();assert(!q('#error').hidden);assert(q('#error').textContent.includes('請輸入 Seed'));equal(q('[data-testid="character-id"]').textContent,id);q('#seed').value='v5-demo';submit();
});
await check('原四天賦／六外觀問題與警告仍存在',()=>{
  const r=readResult();equal(r.warnings.filter(x=>x.code==='MISSING_TALENT_SKILL').length,4);equal(r.warnings.filter(x=>['VISUAL_MISMATCH','MISSING_VISUAL_RULE','BODY_MAPPING_REVIEW'].includes(x.code)).length,6);
});
await check('S014 外觀問題顯示角色文字，不虛構圖片',()=>{
  changeSpecies('S014');equal(q('[data-testid="species-name"]').textContent,'精靈族');equal(readResult().character.appearance.imagePath,null);
});
await check('草案天賦開啟時，名稱與未定綁定可見',()=>{
  const p=structuredClone(parameters);p.allowDraftTalents=true;p.talentChance=1;p.talentCount={min:2,max:2};
  mountApp(q('#app'),{data,parameters:p,seed:'draft-test',speciesId:'S003'});equal(d.querySelectorAll('[data-talent]').length,2);assert(q('#character').textContent.includes('綁定待確認'));
});
await check('預算失敗不顯示舊角色，玩家不洩漏計算數字',()=>{
  const p=structuredClone(parameters);p.budget=0;mountApp(q('#app'),{data,parameters:p,seed:'failed'});assert(!q('[data-testid="character-id"]'));assert(!q('#error').hidden);assert(!q('#error').textContent.includes('Required'));equal(q('#developer-region').children.length,0);assert(readResult().ok===false);
});
mountApp(q('#app'),{data,parameters,seed:'v5-demo',speciesId:'S003'});
for(const width of [320,375,390,430,768,1280])await check(`${width}px 寬度無橫向捲動且主要按鈕達44px`,async()=>{
  frame.style.width=width+'px';await tick();assert(d.documentElement.scrollWidth<=w.innerWidth,`${d.documentElement.scrollWidth}>${w.innerWidth}`);
  for(const selector of ['#generate','#another-seed','#player-mode','#developer-mode','#species','#seed'])assert(q(selector).getBoundingClientRect().height>=44,selector);
  const r=createGenerator(data,parameters,'v5-demo').generateAt(0,{speciesId:'S003'});equal(w.getComputedStyle(q('.inventory-grid')).gridTemplateColumns.split(' ').length,r.character.backpack.width);
});
await check('390px 開發者展開長 JSON 仍無橫向捲動',async()=>{
  frame.style.width='390px';q('#developer-mode').click();for(const details of d.querySelectorAll('#developer-region details'))details.open=true;await tick();assert(d.documentElement.scrollWidth<=w.innerWidth);
});
await check('參考最大背包10×8可完整顯示80格',async()=>{
  let chosen;
  for(let i=0;i<200;i++){const seed='grid-'+i;const r=createGenerator(data,parameters,seed).generateAt(0,{speciesId:'S003'});if(r.ok&&r.character.backpack.cells===80){chosen=seed;break;}}
  assert(chosen);q('#seed').value=chosen;changeSpecies('S003');equal(q('.inventory-grid').children.length,80);await tick();assert(d.documentElement.scrollWidth<=w.innerWidth);
});
const report={date:new Date().toISOString(),browser:navigator.userAgent,tests:results.length,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results};
document.querySelector('#summary').textContent=`測試完成：${report.passed} / ${report.tests} 通過，${report.failed} 失敗`;
document.title=`${report.failed?'FAIL':'PASS'} ${report.passed}/${report.tests} · V5 網頁驗收`;
await fetch('/__qa/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});
