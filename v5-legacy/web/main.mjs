import { mountApp } from './app.mjs';
try{
  const responses=await Promise.all([fetch(new URL('../data/v5.json',import.meta.url)),fetch(new URL('../config/test-parameters.json',import.meta.url))]);
  if(responses.some(r=>!r.ok))throw new Error('V5 資料或測試參數讀取失敗。');
  const [data,parameters]=await Promise.all(responses.map(r=>r.json()));
  const query=new URLSearchParams(location.search);
  mountApp(document.querySelector('#app'),{data,parameters,seed:query.get('seed') ?? 'v5-demo',speciesId:query.get('species') || null});
  document.documentElement.dataset.appReady='true';
}catch(error){
  const message=document.createElement('p');message.className='error';message.setAttribute('role','alert');message.textContent=`無法啟動模擬器：${error.message} 請以本機 HTTP 伺服器開啟，確認 JSON 檔案可用。`;
  document.querySelector('#app').replaceChildren(message);document.documentElement.dataset.appReady='error';
}
