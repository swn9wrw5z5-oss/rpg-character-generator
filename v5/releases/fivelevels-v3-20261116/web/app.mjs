import { createGenerator, playerView } from '../src/skill-core.mjs';
import { simulateCharacters } from '../src/skill-statistics.mjs';
import {portrait,mountPortraitPreview} from './species-portrait.mjs';
import {mountExcelPanel} from './public-statistics.mjs';

const labels={HP:'HP',MP:'MP',HP_REGEN:'HP 回復',MP_REGEN:'MP 回復'};
const number=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:8});
const fmt=value=>number.format(value);
function el(doc,tag,attrs={},...children){
  const node=doc.createElement(tag);
  for(const [key,value] of Object.entries(attrs)) {
    if(key==='text') node.textContent=value;
    else if(key==='class') node.className=value;
    else node.setAttribute(key,value);
  }
  for(const child of children.flat()) if(child!==null && child!==undefined) node.append(typeof child==='string'?doc.createTextNode(child):child);
  return node;
}
export function mountApp(root,{data,parameters,rules,speciesIcons={},seed='v5-demo',speciesId=null,autoGenerate=true}){
  const doc=root.ownerDocument;
  const h=(tag,attrs,...children)=>el(doc,tag,attrs,...children);
  const state={mode:'player',result:null,lastError:null,portraitStyle:'pixel'};
  const jsonBaseline=structuredClone({data,parameters,rules});
  root.innerHTML=`<div class="shell">
    <header class="masthead"><div class="brand"><img src="./web/mark.svg" alt="" width="44" height="44"><div><p class="eyebrow">RPG CHARACTER LAB / EXPERIMENT</p><h1>旅人檔案</h1></div></div><span class="version">${rules.version===3?rules.skills.length+'技能・五級版':'技能滿格 V2'}</span></header>
    <div class="intro"><p>每一位旅人，都有不同的可能。<br>角色生成與數值平衡模擬器</p><div class="mode-switch" role="group" aria-label="顯示模式"><button type="button" id="player-mode" aria-pressed="true">玩家模式</button><button type="button" id="developer-mode" aria-pressed="false">開發者模式</button></div></div>
    <main class="layout"><section class="panel" aria-labelledby="settings-title"><div class="section-kicker"><h2 id="settings-title">生成設定</h2><span class="index">01 / GENERATE</span></div>
      <form id="generation-form"><label class="field"><span class="field-label">選擇種族</span><select id="species" name="species" aria-describedby="species-hint"><option value="">全部隨機</option></select><small id="species-hint">依 V5 的種族出現權重抽取。</small></label>
      <label class="field"><span class="field-label seed-label">隨機種子 Seed <span>可重現</span></span><input id="seed" name="seed" type="text" maxlength="160" autocomplete="off" autocapitalize="off" spellcheck="false" required aria-describedby="seed-hint"><small id="seed-hint">相同 Seed 與設定，會得到相同角色。</small></label>
      <button class="button-primary" type="submit" id="generate"><span aria-hidden="true">◇</span> 隨機生成角色</button><p class="form-hint">指定種族時，只在該種族範圍內生成。<br>想換一位旅人？請使用下方「換 Seed，再生成」。</p></form>
      <p class="dataset-note"><span class="dot"></span>獨立技能預算 · 出生稀有度依技能容量<br>權重、技能類型／等級與異變均為暫定測試。</p>
    </section>
    <div class="result-column"><p id="status" class="status-line" role="status" aria-live="polite">準備生成角色</p><div id="error" role="alert" hidden></div><section id="character" aria-label="角色檔案"></section><section id="developer-region" class="developer" aria-label="開發者計算明細" hidden></section></div></main>
    <footer class="footnote">RPG 角色生成實驗室 · V5<br>設定與結果供平衡測試使用</footer></div>`;
  const get=id=>root.querySelector('#'+id);
  for(const s of data.species.filter(s=>s.enabled)) get('species').append(h('option',{value:s.id,text:s.name+(s.status.includes('占位')?'（暫定）':'')}));
  if(speciesId && !data.species.some(s=>s.id===speciesId && s.enabled)) throw new Error('無效或未啟用的種族ID');
  get('species').value=speciesId || '';
  get('seed').value=seed;
  function renderCharacter(){
    const target=get('character');target.replaceChildren();
    const c=playerView(state.result);
    if(!c){target.append(h('div',{class:'sheet empty-state'},h('span',{class:'muted',text:'◇'}),h('h2',{text:state.result?'這次未能生成角色':'下一位旅人，等待出發'}),h('p',{class:'muted',text:state.result?'請檢查提示，或換一個 Seed 再試。':'選擇種族與 Seed，開始建立角色檔案。'})));return;}
    const family=data.families.find(f=>f.id===c.familyId);
    const header=h('div',{class:'character-head'},
      h('div',{class:'character-top'},h('p',{class:'category',text:`角色檔案 / ${family?.name || c.familyId}`}),h('span',{class:'rarity','data-rarity':c.birthRarity.id,text:`出生稀有度：${c.birthRarity.name}`})),
      h('div',{class:'identity'},portrait(doc,{speciesId:c.speciesId,speciesName:c.speciesName,rarity:c.birthRarity,mutated:c.mutated,style:state.portraitStyle,config:speciesIcons}),h('div',{},h('h2',{'data-testid':'species-name',text:c.speciesName}),h('p',{class:'id mono','data-testid':'character-id',text:c.id}),c.speciesStatus.includes('占位')?h('p',{class:'status-chip',text:c.speciesStatus}):null)));
    const stats=h('div',{class:'stats'});
    for(const id of Object.keys(labels)) stats.append(h('div',{class:'stat','data-stat':id},h('div',{class:'stat-top'},h('span',{class:'stat-label',text:labels[id]}),h('span',{class:'grade','data-grade':c.growth[id],'aria-label':`${labels[id]}成長評級 ${c.growth[id]}`,text:c.growth[id]})),h('p',{class:'stat-value mono',text:fmt(c.stats[id])})));
    const sectionTitle=(title,note)=>h('div',{class:'section-title'},h('h3',{text:title}),note?h('small',{text:note}):null);
    const body=h('div',{class:'sheet-body'},sectionTitle('基礎能力','右上角為成長評級'),stats);
    body.append(h('div',{class:'block personality'},h('h3',{text:'個性'}),c.personality?h('span',{class:'pill',text:c.personality.name}):h('p',{class:'empty-note',text:'本次未生成個性'})));
    const skills=h('div',{class:'block'},sectionTitle('技能',`${c.skills.length} 項`));
    skills.append(c.skills.length?h('ul',{class:'ability-list skill-list'},c.skills.map(s=>{
      const fallback='./assets/skills/placeholder.svg';
      const icon=h('img',{class:'skill-icon',alt:'',width:'48',height:'48',decoding:'async'});
      const path=typeof s.icon==='string'&&/^\.\/assets\/skills\/[A-Za-z0-9_-]+\.(png|svg|webp)$/i.test(s.icon)?s.icon:fallback;
      icon.addEventListener('error',()=>{
        if(icon.dataset.fallback==='true'){icon.hidden=true;return;}
        icon.dataset.fallback='true';icon.src=fallback;
      });
      icon.src=path;
      return h('li',{'data-skill':s.id},h('span',{class:'skill-icon-frame','aria-hidden':'true'},icon),h('span',{class:'skill-label',text:`${s.name} Lv.${s.currentLevel} · ${s.type==='active'?'主動':'被動'}${s.locked?' · 鎖定':''}`}));
    })):h('p',{class:'empty-note',text:'未取得技能；請檢查設定錯誤。新版要求所有出生技能格填滿。'}));
    skills.append(h('p',{class:'effect-note',text:'僅展示技能設定，實際效果與施放消耗尚未實作。'}));body.append(skills);
    const talents=h('div',{class:'block'},sectionTitle('先天天賦',c.talents.length?`${c.talents.length} 項`:'未取得'));
    talents.append(h('p',{class:'empty-note',text:'個體天賦表保留；本技能格實驗版未啟用舊天賦抽取。'}));body.append(talents);
    if(c.mutated)body.append(h('p',{class:'status-chip',text:'異變：出生技能預算提升（測試）'}));
    const grid=h('div',{class:'inventory-grid',role:'img','aria-label':`背包寬 ${c.backpack.width} 格、高 ${c.backpack.height} 格，共 ${c.backpack.cells} 格`,'data-testid':'backpack-grid'});
    grid.style.setProperty('--columns',c.backpack.width);
    for(let i=0;i<c.backpack.cells;i++) grid.append(h('span',{class:'inventory-cell','aria-hidden':'true'}));
    body.append(h('div',{class:'block'},sectionTitle('隨身背包',`${c.backpack.width} × ${c.backpack.height}`),h('div',{class:'inventory'},grid,h('p',{class:'inventory-foot'},h('span',{text:`${c.backpack.cells} 格容量`}),h('span',{text:'依本次結果繪製'})))));
    const another=h('button',{type:'button',class:'button-secondary',id:'another-seed',text:'換 Seed，再生成'});another.addEventListener('click',generateNewSeed);
    body.append(h('div',{class:'result-actions'},another));
    target.append(h('article',{class:'sheet'},header,body));
  }
  function details(title,...contents){return h('details',{},h('summary',{text:title}),h('div',{class:'detail-body'},...contents));}
  function renderDeveloper(){
    const target=get('developer-region');target.replaceChildren();target.hidden=state.mode!=='developer';
    if(target.hidden)return;
    target.append(h('p',{class:'dev-banner',text:'技能格實驗版 · 稀有度依出生容量判定；技能預算不影響背包、基礎能力或成長。'}));
    const r=state.result,c=r?.calculation;
    if(c){
      const list=h('dl');for(const [key,label] of [['backpack','背包分'],['base','基礎能力分'],['affixes','技能／天賦詞綴分'],['hidden','隱藏潛力分']])list.append(h('dt',{text:label}),h('dd',{text:fmt(c.subtotals[key])}));
      list.append(h('dt',{class:'total-row',text:'總價值（不決定稀有度）'}),h('dd',{class:'total-row','data-testid':'total-score',text:fmt(c.total)}));
      const character=r.character;
      target.append(details('三類獨立計分與出生稀有度',list,h('p',{'data-testid':'rarity-proof',text:`出生容量 ${character.birthSkillSlots} → ${character.birthRarity.name}；目前容量 ${character.currentSkillSlots} → ${character.currentRarity.name}。實得 ${character.skills.length} 項技能不會改變出生稀有度。`} )));
      const budget=h('dl');for(const [label,value]of [['異變前出生技能預算',character.birthSkillBaseBudget],['出生可用技能預算',character.birthSkillBudget],['已花費',character.skillBudget.spent],['剩餘（不轉移）',character.skillBudget.remaining]])budget.append(h('dt',{text:label}),h('dd',{text:fmt(value)}));
      target.append(details('出生技能預算、異變與逐格抽取',budget,h('p',{text:'先保留後續格的一級成本（依外部等級表）；本格超額逐級降級，以最終成本扣款。不重抽、不強迫花完；綁定優先。設定無法填滿時拒絕生成。'}),h('pre',{class:'mono','data-testid':'skill-attempts',text:JSON.stringify({mutation:character.mutation,slots:character.skillSlots,birthSkills:character.birthSkills,breakthrough:character.breakthrough},null,2)})));
      const table=h('table',{class:'breakdown'},h('caption',{class:'muted',text:'各項取得成本／價值分錄'}),h('thead',{},h('tr',{},h('th',{scope:'col',text:'項目'}),h('th',{scope:'col',text:'分數'}))));
      const tbody=h('tbody');for(const row of c.ledger)tbody.append(h('tr',{},h('td',{text:`${({backpack:'背包',ability:'基礎能力',skill:'技能',talent:'天賦',potential:'隱藏潛力'})[row.kind]} · ${labels[row.id] || row.id}`}),h('td',{text:fmt(row.points)})));table.append(tbody);
      target.append(details('逐項成本與隱藏潛力',table,h('p',{text:`背包：${c.backpack.width}×${c.backpack.height}，免費格數${c.backpack.freeCells}，每格成本${c.backpack.perCell}，倍率${fmt(c.backpack.multiplier)}。`} ),h('p',{text:'能力分、成長潛力成本與培養後數值均直接引用核心結果。'}),h('pre',{class:'mono',text:JSON.stringify({abilities:c.abilities,potential:c.potential,cultivated:c.cultivated},null,2)})));
    }
    const warnings=r?.warnings || data.validation?.warnings || [];
    target.append(details(`資料警告與待確認事項（${warnings.length}）`,h('ul',{class:'warning-list'},warnings.map(w=>h('li',{},h('strong',{text:`${w.code}${w.id?' · '+w.id:''}`}),h('p',{text:w.message || ''}))))));
    target.append(details('暫定規則、外部資料表與 Seed',h('p',{text:'保留V5基礎公式。舊總分判級／整體預算／技能數量設定不套用於此實驗版；新規則由外部JSON控制。'}),h('pre',{class:'mono',text:JSON.stringify({replay:r?.replay,foundationParameters:parameters,skillRules:rules},null,2)})));
    if(r)target.append(details('完整核心結果 JSON',h('pre',{class:'mono raw-json','data-testid':'raw-result',text:JSON.stringify(r,null,2)})));
    if(state.lastError)target.append(details('設定錯誤',h('pre',{text:state.lastError})));
    const count=h('select',{id:'batch-count','aria-label':'批次角色數'},h('option',{value:'100',text:'100 名'}),h('option',{value:'1000',text:'1,000 名'}));
    const run=h('button',{type:'button',class:'button-secondary',id:'run-batch',text:'執行固定 Seed 批次'}),output=h('pre',{class:'mono raw-json',id:'batch-result',text:'尚未執行'});
    run.addEventListener('click',()=>{try{output.textContent=JSON.stringify(simulateCharacters(data,parameters,rules,{seed:get('seed').value,count:Number(count.value),speciesId:get('species').value||null}),null,2);}catch(error){output.textContent=error.message;}});
    target.append(details('批次模擬與統計',count,run,output));
  }
  function render(){renderCharacter();renderDeveloper();}
  function generate(){
    const inputSeed=get('seed').value;
    get('error').hidden=true;get('error').replaceChildren();state.lastError=null;
    if(!inputSeed.trim()){
      get('error').className='error';get('error').textContent='請輸入 Seed，才能重現生成結果。';get('error').hidden=false;get('seed').focus();return;
    }
    try{
      // The UI delegates every character draw to the independent skill core.
      state.result=createGenerator(data,parameters,rules,inputSeed).generateAt(0,{speciesId:get('species').value || null});
      get('status').textContent=state.result.ok?'角色檔案已更新 · 相同 Seed 可重現':'生成失敗 · 未修改預算或重新抽樣';
      if(!state.result.ok){get('error').className='error';get('error').textContent='本次生成未通過核心檢查。'+state.result.errors.map(e=>e.code==='BUDGET_EXCEEDED'?'測試預算不足，請換 Seed 或由開發者檢查測試設定。':`錯誤代碼：${e.code}`).join(' ');get('error').hidden=false;}
    }catch(error){
      state.result=null;state.lastError=error.message;get('status').textContent='設定無法載入';get('error').className='error';get('error').textContent='資料或測試規則無效，無法生成。開發者模式可查看詳細錯誤。';get('error').hidden=false;
    }
    render();
  }
  function generateNewSeed(){
    // UI only chooses a new seed; it never rolls character stats or rarity.
    const values=new Uint32Array(2);doc.defaultView.crypto.getRandomValues(values);
    get('seed').value=`旅人-${Array.from(values,n=>n.toString(16).padStart(8,'0')).join('')}`;generate();
  }
  function setMode(mode){state.mode=mode;get('player-mode').setAttribute('aria-pressed',String(mode==='player'));get('developer-mode').setAttribute('aria-pressed',String(mode==='developer'));renderDeveloper();}
  get('generation-form').addEventListener('submit',event=>{event.preventDefault();generate();});
  get('species').addEventListener('change',()=>{get('species-hint').textContent=get('species').value?'依指定種族的合法尺寸與 V5 設定生成。':'依 V5 的種族出現權重抽取。';get('status').textContent='種族設定已變更，按「隨機生成角色」套用。';});
  get('player-mode').addEventListener('click',()=>setMode('player'));
  get('developer-mode').addEventListener('click',()=>setMode('developer'));
  mountPortraitPreview(root.querySelector('.result-column'),{data,config:speciesIcons,onStyle:style=>{state.portraitStyle=style;renderCharacter();}});
  function applySettings(settings){
    // Validate ownership snapshot before changing any active inputs.
    createGenerator(settings.data,settings.parameters,settings.rules,'import-validation');
    const next=structuredClone(settings),selected=get('species').value;
    data=next.data;parameters=next.parameters;rules=next.rules;
    get('species').replaceChildren(h('option',{value:'',text:'全部隨機'}),...data.species.filter(s=>s.enabled).map(s=>h('option',{value:s.id,text:s.name})));
    get('species').value=data.species.some(s=>s.id===selected&&s.enabled)?selected:'';generate();
  }
  mountExcelPanel(root.querySelector('.result-column'),{onApply:applySettings,onRestore:()=>applySettings(jsonBaseline),getSettings:()=>structuredClone({data,parameters,rules}),getOptions:()=>({seed:get('seed').value,speciesId:get('species').value||null})});
  render();if(autoGenerate)generate();
  return {generate,getResult:()=>structuredClone(state.result)};
}
