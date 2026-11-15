import { createGenerator, playerView } from '../src/core.mjs';

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
export function mountApp(root,{data,parameters,seed='v5-demo',speciesId=null,autoGenerate=true}){
  const doc=root.ownerDocument;
  const h=(tag,attrs,...children)=>el(doc,tag,attrs,...children);
  const state={mode:'player',result:null};
  root.innerHTML=`<div class="shell">
    <header class="masthead"><div class="brand"><img src="./web/mark.svg" alt="" width="44" height="44"><div><p class="eyebrow">RPG CHARACTER LAB</p><h1>旅人檔案</h1></div></div><span class="version">V5 測試版</span></header>
    <div class="intro"><p>每一位旅人，都有不同的可能。<br>角色生成與數值平衡模擬器</p><div class="mode-switch" role="group" aria-label="顯示模式"><button type="button" id="player-mode" aria-pressed="true">玩家模式</button><button type="button" id="developer-mode" aria-pressed="false">開發者模式</button></div></div>
    <main class="layout"><section class="panel" aria-labelledby="settings-title"><div class="section-kicker"><h2 id="settings-title">生成設定</h2><span class="index">01 / GENERATE</span></div>
      <form id="generation-form"><label class="field"><span class="field-label">選擇種族</span><select id="species" name="species" aria-describedby="species-hint"><option value="">全部隨機</option></select><small id="species-hint">依 V5 的種族出現權重抽取。</small></label>
      <label class="field"><span class="field-label seed-label">隨機種子 Seed <span>可重現</span></span><input id="seed" name="seed" type="text" maxlength="160" autocomplete="off" autocapitalize="off" spellcheck="false" required aria-describedby="seed-hint"><small id="seed-hint">相同 Seed 與設定，會得到相同角色。</small></label>
      <button class="button-primary" type="submit" id="generate"><span aria-hidden="true">◇</span> 隨機生成角色</button><p class="form-hint">指定種族時，只在該種族範圍內生成。<br>想換一位旅人？請使用下方「換 Seed，再生成」。</p></form>
      <p class="dataset-note"><span class="dot"></span>以 V5 資料生成 · 測試規則尚未定案<br>美術以文字代替，技能效果尚未實作。</p>
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
      h('div',{class:'character-top'},h('p',{class:'category',text:`角色檔案 / ${family?.name || c.familyId}`}),h('span',{class:'rarity','data-rarity':c.rarity.id,text:c.rarity.name})),
      h('div',{class:'identity'},h('div',{class:'avatar','aria-hidden':'true'},h('span',{text:c.speciesName.slice(0,1)})),h('div',{},h('h2',{'data-testid':'species-name',text:c.speciesName}),h('p',{class:'id mono','data-testid':'character-id',text:c.id}),c.speciesStatus.includes('占位')?h('p',{class:'status-chip',text:c.speciesStatus}):null)));
    const stats=h('div',{class:'stats'});
    for(const id of Object.keys(labels)) stats.append(h('div',{class:'stat','data-stat':id},h('div',{class:'stat-top'},h('span',{class:'stat-label',text:labels[id]}),h('span',{class:'grade','data-grade':c.growth[id],'aria-label':`${labels[id]}成長評級 ${c.growth[id]}`,text:c.growth[id]})),h('p',{class:'stat-value mono',text:fmt(c.stats[id])})));
    const sectionTitle=(title,note)=>h('div',{class:'section-title'},h('h3',{text:title}),note?h('small',{text:note}):null);
    const body=h('div',{class:'sheet-body'},sectionTitle('基礎能力','右上角為成長評級'),stats);
    body.append(h('div',{class:'block personality'},h('h3',{text:'個性'}),c.personality?h('span',{class:'pill',text:c.personality.name}):h('p',{class:'empty-note',text:'本次未生成個性'})));
    const skills=h('div',{class:'block'},sectionTitle('技能',`${c.skills.length} 項`));
    skills.append(c.skills.length?h('ul',{class:'ability-list'},c.skills.map(s=>h('li',{'data-skill':s.id,text:s.name}))):h('p',{class:'empty-note',text:'本次沒有技能'}));
    skills.append(h('p',{class:'effect-note',text:'僅展示技能設定，實際效果與施放消耗尚未實作。'}));body.append(skills);
    const talents=h('div',{class:'block'},sectionTitle('先天天賦',c.talents.length?`${c.talents.length} 項`:'未取得'));
    talents.append(c.talents.length?h('ul',{class:'ability-list'},c.talents.map(t=>h('li',{'data-talent':t.id,text:`${t.name} · ${t.status}／綁定待確認`} ))):h('p',{class:'empty-note',text:parameters.talentChance===0?'目前測試設定未開啟天賦抽取。':'本次沒有先天天賦。'}));body.append(talents);
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
    target.append(h('p',{class:'dev-banner',text:'開發者模式 · 下列分數與抽樣規則均供測試，非正式設定。'}));
    const r=state.result,c=r?.calculation;
    if(c){
      const list=h('dl');for(const [key,label] of [['backpack','背包分'],['base','基礎能力分'],['affixes','技能／天賦詞綴分'],['hidden','隱藏潛力分']])list.append(h('dt',{text:label}),h('dd',{text:fmt(c.subtotals[key])}));
      list.append(h('dt',{class:'total-row',text:'實際總分'}),h('dd',{class:'total-row','data-testid':'total-score',text:fmt(c.total)}),h('dt',{text:'生成預算'}),h('dd',{text:fmt(c.budget)}),h('dt',{text:'剩餘預算'}),h('dd',{text:fmt(c.remainingBudget)}));
      target.append(details('總分與稀有度判定',list,h('p',{text:'四類價值相加後才判定稀有度；取得成本不從總價值重扣。'}),h('p',{'data-testid':'rarity-proof',text:`核心判定：向下取整分數 ${c.rarity.integerScore} → ${c.rarity.name}（${c.rarity.id}）`} ),h('p',{class:'muted',text:data.rarities.filter(x=>x.enabled).map(x=>`${x.name} ${x.min}–${x.max}`).join('；')})));
      const table=h('table',{class:'breakdown'},h('caption',{class:'muted',text:'各項取得成本／價值分錄'}),h('thead',{},h('tr',{},h('th',{scope:'col',text:'項目'}),h('th',{scope:'col',text:'分數'}))));
      const tbody=h('tbody');for(const row of c.ledger)tbody.append(h('tr',{},h('td',{text:`${({backpack:'背包',ability:'基礎能力',skill:'技能',talent:'天賦',potential:'隱藏潛力'})[row.kind]} · ${labels[row.id] || row.id}`}),h('td',{text:fmt(row.points)})));table.append(tbody);
      target.append(details('逐項成本與隱藏潛力',table,h('p',{text:`背包：${c.backpack.width}×${c.backpack.height}，免費格數${c.backpack.freeCells}，每格成本${c.backpack.perCell}，倍率${fmt(c.backpack.multiplier)}。`} ),h('p',{text:'能力分、成長潛力成本與培養後數值均直接引用核心結果。'}),h('pre',{class:'mono',text:JSON.stringify({abilities:c.abilities,potential:c.potential,cultivated:c.cultivated},null,2)})));
    }
    const warnings=r?.warnings || data.validation?.warnings || [];
    target.append(details(`資料警告與待確認事項（${warnings.length}）`,h('ul',{class:'warning-list'},warnings.map(w=>h('li',{},h('strong',{text:`${w.code}${w.id?' · '+w.id:''}`}),h('p',{text:w.message || ''}))))));
    target.append(details('暫定生成參數與 Seed',h('p',{text:'採用第二階段核心；單次嘗試，不足預算直接回傳失敗，不會重抽或補造設定。'}),h('pre',{class:'mono',text:JSON.stringify(r?.replay || {testParameters:parameters},null,2)})));
    if(r)target.append(details('完整核心結果 JSON',h('pre',{class:'mono raw-json','data-testid':'raw-result',text:JSON.stringify(r,null,2)})));
  }
  function render(){renderCharacter();renderDeveloper();}
  function generate(){
    const inputSeed=get('seed').value;
    get('error').hidden=true;get('error').replaceChildren();
    if(!inputSeed.trim()){
      get('error').className='error';get('error').textContent='請輸入 Seed，才能重現生成結果。';get('error').hidden=false;get('seed').focus();return;
    }
    try{
      // All randomness, ability values, costs and rarity come from the phase-2 core.
      state.result=createGenerator(data,parameters,inputSeed).generateAt(0,{speciesId:get('species').value || null});
      get('status').textContent=state.result.ok?'角色檔案已更新 · 相同 Seed 可重現':'生成失敗 · 未修改預算或重新抽樣';
      if(!state.result.ok){get('error').className='error';get('error').textContent='本次生成未通過核心檢查。'+state.result.errors.map(e=>e.code==='BUDGET_EXCEEDED'?'測試預算不足，請換 Seed 或由開發者檢查測試設定。':`錯誤代碼：${e.code}`).join(' ');get('error').hidden=false;}
    }catch(error){
      state.result=null;get('status').textContent='設定無法載入';get('error').className='error';get('error').textContent='資料或測試參數無效，無法生成。'+error.message;get('error').hidden=false;
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
  render();if(autoGenerate)generate();
  return {generate,getResult:()=>structuredClone(state.result)};
}
