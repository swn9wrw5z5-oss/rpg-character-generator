import {FORMAT,ALGORITHM,allocate,validateSettings} from './attributes.mjs';
import {fingerprint} from './random.mjs';
import {sampleBirth,sampleGrades} from './sampling.mjs';
export {allocate,FORMAT,ALGORITHM};
export const TABLES=['species','skills','skill-links','skill-levels','species-bindings'];
export function validateBundle(bundle){
 const errors=[],s=bundle?.settings,add=(path,message)=>errors.push({path,message});
 if(bundle?.format!=='rpg-v6-bundle-v1')return [{path:'format',message:'請使用 V6 設定；舊版檔案不能直接套用。'}];
 try{errors.push(...validateSettings(null,s));}catch{add('settings','設定結構不完整');}
 for(const key of TABLES){const t=bundle.tables?.[key];if(t?.format!==`rpg-v6-${key}-v1`||!Array.isArray(t?.rows)){add('tables.'+key,'缺少版本標記或 rows 陣列');continue;}
  if(t.rows.length)add('tables.'+key,'本階段僅支援空白目錄；新增資料須先確認欄位與規則，不會套用或忽略。');
 }
 const rules=s?.skills,profiles=rules?.rarityProfiles;
 if(!Array.isArray(profiles)||profiles.length!==5)add('settings.skills.rarityProfiles','必須保留五種品質與容量');
 else{
  const ids=new Set(),slots=new Set();let weight=0;
  for(const [i,p]of profiles.entries()){
   const path=`settings.skills.rarityProfiles.${i}`;
   if(typeof p.rarityId!=='string'||ids.has(p.rarityId))add(path,'品質 ID 缺失或重複');ids.add(p.rarityId);
   if(!Number.isInteger(p.skillSlots)||p.skillSlots<1||p.skillSlots>5||slots.has(p.skillSlots))add(path,'技能容量須為不重複的 1～5');slots.add(p.skillSlots);
   if(!Number.isFinite(p.weight)||p.weight<0)add(path+'.weight','權重須為有限非負數');else weight+=p.weight;
   if(!Number.isSafeInteger(p.budgetMin)||!Number.isSafeInteger(p.budgetMax)||p.budgetMin<0||p.budgetMax<p.budgetMin)add(path,'預算範圍不合法');
   if(s.rarities?.filter(r=>r.id===p.rarityId&&typeof r.name==='string').length!==1)add(path,'缺少唯一品質名稱');
  }if(!(weight>0)||!Number.isFinite(weight))add('settings.skills.rarityProfiles','總權重須為有限正數');
 }
 const m=rules?.mutation;
 if(!m||!Number.isFinite(m.probability)||m.probability<0||m.probability>1||!Number.isFinite(m.skillBudgetMultiplier)||m.skillBudgetMultiplier<1||m.rounding!=='floor')add('settings.skills.mutation','異變機率、正向倍率或取整規則不合法');
 if(profiles?.some(p=>!Number.isSafeInteger(Math.floor(p.budgetMax*(m?.skillBudgetMultiplier??NaN)))))add('settings.skills','異變後預算超出安全整數');
 return errors;
}
export function createGenerator(input,seed){
 const bundle=structuredClone(input),errors=validateBundle(bundle);
 if(errors.length)throw Object.assign(new Error(errors.map(e=>e.path+': '+e.message).join('\n')),{errors});
 const settings=bundle.settings,settingsFingerprint=fingerprint(bundle);let cursor=0;
 function generateAt(index){
  if(!Number.isSafeInteger(index)||index<0)throw new Error('INVALID_INDEX');
  const {profile,baseBudget,triggered,multiplier,available}=sampleBirth(settings.skills,seed,index);
  const rarity={...settings.rarities.find(r=>r.id===profile.rarityId),source:'birth-skill-capacity'};
  const character={format:FORMAT,schemaVersion:6,id:`V6_${fingerprint([seed,index,settingsFingerprint])}`,speciesId:null,speciesName:null,familyId:null,backpack:null,personality:null,appearance:null,
   birthAttributes:Object.fromEntries(settings.attributes.base.map(b=>[b.id,b.birth])),growthGrades:sampleGrades(settings,seed,index),
   rarity,birthRarity:structuredClone(rarity),currentRarity:structuredClone(rarity),birthSkillSlots:profile.skillSlots,currentSkillSlots:profile.skillSlots,
   birthSkillBaseBudget:baseBudget,birthSkillBudget:available,skills:[],birthSkills:[],skillSlots:[],talents:[],
   skillBudget:{available,spent:0,remaining:available,usage:0},mutation:{triggered,multiplier,baseBudget,effectiveBudget:available,bonusBudget:available-baseBudget},
   catalogState:'blank',configurationState:'awaiting-species-and-skills'};
  return {ok:true,character,progression:allocate(character,settings.attributes),replay:{algorithm:ALGORITHM,seed,index,settingsFingerprint},warnings:[{code:'V6_EMPTY_CATALOG',message:'空白基礎版：種族、背包與技能待設定；不執行滿格技能驗證。'}],calculation:{skillBudget:character.skillBudget,backpack:null,total:null,attributeScore:{implemented:false},rarityRule:'出生技能容量；不使用總分判級',legacyAbilityScoringUsed:false}};
 }
 return {generateAt,next:()=>generateAt(cursor++)};
}
export function exportCharacter(result){return {format:'rpg-v6-export-v1',...structuredClone(result)};}
