const styles=['pixel','fantasy'];
const safe=path=>typeof path==='string'&&/^\.\/assets\/species\/[A-Za-z0-9_-]+\.(png|svg|webp)$/i.test(path);
export function portrait(doc,{speciesId,speciesName,rarity,mutated=false,style='pixel',config={}}){
  if(!styles.includes(style))style='pixel';
  const frame=doc.createElement('div');frame.className='species-portrait';frame.dataset.rarity=rarity.id;frame.dataset.style=style;frame.dataset.species=speciesId;
  frame.setAttribute('role','img');frame.setAttribute('aria-label',`${speciesName}，出生稀有度${rarity.name}${mutated?'，異變':''}`);
  const fallback=safe(config.styles?.[style]?.fallback)?config.styles[style].fallback:`./assets/species/placeholder-${style}.svg`;
  const path=config.species?.[speciesId]?.[style],image=doc.createElement('img');image.alt='';image.width=128;image.height=128;
  image.addEventListener('error',()=>{if(image.dataset.fallback==='true'){image.hidden=true;return;}image.dataset.fallback='true';image.src=fallback;});
  image.src=safe(path)?path:fallback;frame.append(image);
  const label=doc.createElement('span');label.className='portrait-rarity';label.textContent=rarity.name;frame.append(label);
  if(mutated){const badge=doc.createElement('span');badge.className='mutation-badge';badge.textContent='✦ 異變';frame.append(badge);}
  return frame;
}
export function mountPortraitPreview(root,{data,config={},onStyle=()=>{}}){
  const doc=root.ownerDocument,section=doc.createElement('details');section.className='portrait-lab';
  const summary=doc.createElement('summary');summary.textContent='種族 ICON／稀有度外框測試';section.append(summary);
  const note=doc.createElement('p');note.className='muted';note.textContent='以下為獨立外觀預覽，不代表抽取結果。不新增種族；目前兩種風格均為佔位圖。風格亦套用上方角色頭像。';section.append(note);
  function select(id,title,options){const label=doc.createElement('label');label.className='field';label.textContent=title;const input=doc.createElement('select');input.id=id;for(const [value,text]of options){const option=doc.createElement('option');option.value=value;option.textContent=text;input.append(option);}label.append(input);section.append(label);return input;}
  const species=select('portrait-species','預覽種族',data.species.filter(s=>s.enabled).map(s=>[s.id,`${s.name}（${s.id}）`])),rarity=select('portrait-rarity','預覽出生稀有度',data.rarities.filter(r=>r.enabled).map(r=>[r.id,r.name])),style=select('portrait-style','圖示風格',[['pixel','像素風（佔位）'],['fantasy','精緻奇幻風（佔位）']]);
  const label=doc.createElement('label'),mutation=doc.createElement('input');mutation.type='checkbox';mutation.id='portrait-mutation';label.append(mutation,doc.createTextNode(' 顯示異變標記（不改變稀有度）'));section.append(label);
  const output=doc.createElement('div');output.id='portrait-preview';output.setAttribute('aria-live','polite');section.append(output);
  function render(){const s=data.species.find(s=>s.id===species.value),r=data.rarities.find(r=>r.id===rarity.value);output.replaceChildren(portrait(doc,{speciesId:s.id,speciesName:s.name,rarity:r,mutated:mutation.checked,style:style.value,config}));const name=doc.createElement('p');name.textContent=`外觀預覽：${s.name} · ${r.name}`;output.append(name);}
  for(const input of [species,rarity,mutation])input.addEventListener('change',render);
  style.addEventListener('change',()=>{render();onStyle(style.value);});render();root.append(section);
}
