import { mountApp } from './app.mjs';
try{
  const responses=await Promise.all([fetch(new URL('../data/fivelevels.json',import.meta.url)),fetch(new URL('../config/fivelevels-parameters.json',import.meta.url)),fetch(new URL('../config/fivelevels-rules.json',import.meta.url))]);
  if(responses.some(r=>!r.ok))throw new Error('V5 資料或測試參數讀取失敗。');
  const [data,parameters,rules]=await Promise.all(responses.map(r=>r.json()));
  let speciesIcons={};
  try{const response=await fetch(new URL('../config/species-icons.json',import.meta.url));if(response.ok)speciesIcons=await response.json();}catch{/* Optional artwork config falls back to local placeholders. */}
  const query=new URLSearchParams(location.search);
  mountApp(document.querySelector('#app'),{data,parameters,rules,speciesIcons,seed:query.get('seed') ?? 'skill-test-demo',speciesId:query.get('species') || null});
  document.documentElement.dataset.appReady='true';
}catch(error){
  const message=document.createElement('p');message.className='error';message.setAttribute('role','alert');message.textContent=`無法啟動模擬器：${error.message} 請重新整理或稍後再試，確認網頁設定可以載入。`;
  document.querySelector('#app').replaceChildren(message);document.documentElement.dataset.appReady='error';
}
