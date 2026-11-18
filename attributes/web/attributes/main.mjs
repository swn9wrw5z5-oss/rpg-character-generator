import {mountAttributes} from './app.mjs';
const load=async p=>{const r=await fetch(new URL('../../'+p,import.meta.url));if(!r.ok)throw new Error(p+'載入失敗');return r.json();};
try{const [data,parameters,settings,portraitConfig]=await Promise.all(['data/fivelevels.json','config/fivelevels-parameters.json','config/attributes-settings.json','config/species-icons.json'].map(load));mountAttributes(document.querySelector('#app'),{data,parameters,settings,portraitConfig});}catch(e){document.querySelector('#app').textContent='無法啟動：'+e.message;}
