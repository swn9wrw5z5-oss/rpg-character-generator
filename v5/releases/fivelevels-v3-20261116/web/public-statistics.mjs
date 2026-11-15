import {simulateCharacters} from '../src/skill-statistics.mjs';
// Static Pages adapter: no file upload, API request or local-server dependency.
export function mountExcelPanel(root,{onRestore,getSettings,getOptions}){
 const doc=root.ownerDocument,h=(tag,text)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 const section=h('section');section.className='excel-panel';section.append(h('h2','批次模擬'),h('p','使用已發布的27技能五級設定。固定Seed可重現結果。'));
 const label=h('label','模擬人數 '),count=h('select');count.id='public-count';for(const n of [100,1000]){const o=h('option',n.toLocaleString('zh-TW'));o.value=String(n);count.append(o);}label.append(count);
 const run=h('button','以目前 Seed 執行模擬');run.type='button';run.className='button-secondary';run.id='public-simulate';
 const reset=h('button','重設為發布設定');reset.type='button';reset.className='button-secondary';reset.addEventListener('click',()=>{onRestore();output.replaceChildren();});
 const output=h('div');output.id='public-statistics';output.setAttribute('aria-live','polite');section.append(label,run,reset,output);
 run.addEventListener('click',async()=>{
  run.disabled=true;output.replaceChildren(h('p','模擬中…'));await new Promise(resolve=>doc.defaultView.setTimeout(resolve,0));
  try{
   const settings=getSettings(),r=simulateCharacters(settings.data,settings.parameters,settings.rules,{...getOptions(),count:Number(count.value)}),pct=n=>(n*100).toFixed(2)+'%';
   output.replaceChildren(h('p',`成功 ${r.succeeded}／${r.count}；平均技能數 ${r.meanSkills.toFixed(3)}；預算使用率 ${pct(r.skillBudget.weightedUsage)}；異變率 ${pct(r.mutation.triggered.ratio)}`));
   function table(title,rows){const t=h('table');t.className='breakdown';t.append(h('caption',title));for(const row of rows){const tr=h('tr');for(const value of row)tr.append(h('td',String(value)));t.append(tr);}output.append(t);}
   table('出生稀有度',Object.entries(r.birthRarities).map(([id,n])=>[settings.data.rarities.find(v=>v.id===id)?.name??id,n.count,pct(n.ratio)]));
   table('技能出生等級',Array.from({length:5},(_,i)=>{const level=i+1,n=r.birthSkillLevels[level]??{count:0,ratio:0};return ['Lv.'+level,n.count,pct(n.ratio)];}));
  }catch(error){output.replaceChildren(h('p','模擬失敗：'+error.message));}finally{run.disabled=false;}
 });
 root.append(section);
}
