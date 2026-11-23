import {createGenerator as createBase,validateBundle as validateBase,TABLES,allocate,exportCharacter,FORMAT} from './base/core.mjs';
import {createRng,fingerprint} from './base/random.mjs';
export {allocate,exportCharacter,FORMAT};
export const ALGORITHM='v6-pools-four-stages-v3/optional-count-first-acquired-free';
export function blankFoundation(bundle){return {format:bundle.format,settings:bundle.settings,tables:Object.fromEntries(TABLES.map(n=>[n,{format:`rpg-v6-${n}-v1`,rows:[]}]))};}
const EXPECTED={RAR_C:1,RAR_R:2,RAR_E:3,RAR_L:4,RAR_M:5};
const SPECIES=['SPEC_HUMAN','SPEC_ORC','SPEC_ELF','SPEC_DWARF','SPEC_VAMPIRE','SPEC_DRAGON','SPEC_UNDEAD'];
const POOLS=['shared','racial-normal','racial-rare'];
function weighted(rows,weight,rng){const positive=rows.filter(r=>weight(r)>0),sum=positive.reduce((s,r)=>s+weight(r),0);if(!(sum>0)||!Number.isFinite(sum))throw new Error('EMPTY_WEIGHT_POOL');let x=rng()*sum;for(const r of positive){x-=weight(r);if(x<0)return r;}return positive.at(-1);}
export function validateBundle(b){
 const errors=validateBase(blankFoundation(b)),add=(path,message)=>errors.push({path,message});
 const rows=n=>b.tables?.[n]?.rows;
 for(const n of TABLES)if(!Array.isArray(rows(n))||b.tables[n].format!==`rpg-v6-${n}-v1`)add('tables.'+n,'缺少合法版本或資料陣列');
 if(errors.length)return errors;
 const species=rows('species'),skills=rows('skills'),levels=rows('skill-levels'),bindings=rows('species-bindings');
 const finite=(v,min=0)=>typeof v==='number'&&Number.isFinite(v)&&v>=min;
 const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
 for(const [name,list]of [['species',species],['skills',skills],['species-bindings',bindings]]){const ids=new Set();for(const [i,r]of list.entries()){if(!r.id||ids.has(r.id))add(`tables.${name}.rows.${i}.id`,'缺少或重複 ID');ids.add(r.id);}}
 if(species.length!==7||SPECIES.some(id=>!species.some(r=>r.id===id)))add('tables.species','必須包含已確認的七族 ID');
 for(const [i,r]of species.entries()){
  if(typeof r.name!=='string'||!r.name.trim()||!finite(r.weight)||typeof r.enabled!=='boolean')add(`tables.species.rows.${i}`,'種族名稱、權重或啟用格式不合法');
  const ds=['minWidth','maxWidth','minHeight','maxHeight'].map(k=>r[k]);
  if(!ds.every(v=>v===null)&&(!ds.every(v=>integer(v,1)&&v<=100)||r.minWidth>r.maxWidth||r.minHeight>r.maxHeight))add(`tables.species.rows.${i}`,'背包須全部待設定，或四項皆為合法範圍');
  if(!b.portraits?.species?.[r.id]||!['human','orc','elf','dwarf','vampire','dragon','undead'].includes(b.portraits.species[r.id]))add(`portraits.species.${r.id}`,'缺少合法頭像對應');
 }
 if(!species.some(r=>r.enabled&&r.weight>0))add('tables.species','沒有可抽種族');
 for(const [i,p]of b.settings.skills.rarityProfiles.entries())if(EXPECTED[p.rarityId]!==p.skillSlots)add(`settings.skills.rarityProfiles.${i}.skillSlots`,'品質容量須依序為1、2、3、4、5；只有神話5格');
 const pools=b.settings.skills.poolWeights;
 if(!Array.isArray(pools)||pools.length!==3||POOLS.some(id=>pools.filter(p=>p.id===id).length!==1)||pools.some(p=>!finite(p.weight))||!pools.some(p=>p.weight>0))add('settings.skills.poolWeights','須有三個獨立且合法的技能池權重');
 if(b.settings.skills.emptyPoolPolicy!=='exclude-empty-pools-before-draw')add('settings.skills.emptyPoolPolicy','抽取必須只使用有效技能候選，不得產生空技能候選');
 const levelKeys=new Set();
 for(const [i,l]of levels.entries()){const key=l.id+':'+l.level;if(levelKeys.has(key))add(`tables.skill-levels.rows.${i}`,'等級表階段重複');levelKeys.add(key);if(!skills.some(s=>s.id===l.skillId&&s.levelTableId===l.id)||!integer(l.level,1)||l.level>4||!integer(l.cost)||!finite(l.birthWeight))add(`tables.skill-levels.rows.${i}`,'技能引用、I～IV 階、成本或出生階段權重無效');}
 for(const [i,s]of skills.entries()){
  const path=`tables.skills.rows.${i}`,ls=levels.filter(l=>l.skillId===s.id&&l.id===s.levelTableId).sort((a,b)=>a.level-b.level);
  if(!['racial','exploration','special','common'].includes(s.type)||!finite(s.weight)||typeof s.name!=='string'||s.enabled!==Boolean(s.name.trim())||typeof s.allowDuplicates!=='boolean'||typeof s.lockedOnBirth!=='boolean'||!Array.isArray(s.allowedSpeciesIds)||s.allowedSpeciesIds.some(id=>!species.some(r=>r.id===id)))add(path,'技能欄位不合法，未命名技能必須停用');
  if(ls.length!==4||[1,2,3,4].some(n=>ls.filter(l=>l.level===n).length!==1)||ls.some((l,j)=>j&&l.cost<ls[j-1].cost)||!(ls.reduce((n,l)=>n+l.birthWeight,0)>0))add(path+'.levelTableId','每項技能須有完整四階、非遞減成本及正總出生權重');
  if(s.type==='racial'&&bindings.filter(r=>r.skillId===s.id).length!==1)add(path,'種族技能必須有唯一資格對應');
 }
 for(const [i,r]of bindings.entries()){const s=skills.find(s=>s.id===r.skillId);if(!s||s.type!=='racial'||!species.some(s=>s.id===r.speciesId)||!s.allowedSpeciesIds.includes(r.speciesId)||!['racial-normal','racial-rare'].includes(r.poolId)||typeof r.eligibleWhenMutated!=='boolean'||r.mode!=='eligibility')add(`tables.species-bindings.rows.${i}`,'種族技能資格引用無效；不能視為必定取得');}
 if(rows('skill-links').length)add('tables.skill-links','尚未實作連動規則，不接受非空連動資料');
 const portrait=b.portraits?.mutationWeights;
 if(!portrait||Object.keys(portrait).length!==2||!finite(portrait['mutation-a'],Number.MIN_VALUE)||!finite(portrait['mutation-b'],Number.MIN_VALUE))add('portraits.mutationWeights','異變 A/B 權重無效');
 const distribution=b.settings.skills.birthCountDistribution,path='settings.skills.birthCountDistribution';
 if(distribution?.format!=='v6-birth-attempt-distribution-v1'||!Array.isArray(distribution.profiles)||distribution.profiles.length!==5)add(path,'缺少有版本標記的五種品質出生嘗試數量分布');
 else for(const [id,capacity]of Object.entries(EXPECTED)){
  const matches=distribution.profiles.filter(p=>p.rarityId===id),entries=matches[0]?.counts;
  if(matches.length!==1||!Array.isArray(entries)||entries.length!==capacity+1){add(path,id+' 須明列0～容量的各次數權重');continue;}
  if(entries.some(r=>!integer(r.attempts)||r.attempts>capacity||!finite(r.weight))||new Set(entries.map(r=>r.attempts)).size!==entries.length||!entries.some(r=>r.weight>0)||!Number.isFinite(entries.reduce((n,r)=>n+r.weight,0)))add(path,id+' 出生嘗試次數、權重或總權重無效');
 }
 if(b.settings.skills.policies?.overBudget!=='reject-attempt-no-retry-no-downgrade'||b.settings.skills.policies?.reservation!=='none')add('settings.skills.policies','不得使用舊版保留預算、降階或強制滿格規則');
 if(b.settings.skills.policies?.firstAcquiredSkillCost!=='free')add('settings.skills.policies.firstAcquiredSkillCost','第一個實際取得的出生技能必須免費');
 return errors;
}
function eligibleSkills(b,speciesId,mutated){
 return b.tables.skills.rows.filter(s=>s.enabled&&s.weight>0&&(s.type!=='racial'||b.tables['species-bindings'].rows.some(r=>r.skillId===s.id&&(r.speciesId===speciesId||mutated&&r.eligibleWhenMutated)))&&b.settings.skills.poolWeights.some(p=>p.weight>0&&p.id===(s.type==='racial'?b.tables['species-bindings'].rows.find(r=>r.skillId===s.id).poolId:'shared')));
}
export function generateSkills(b,{speciesId,mutated,capacity,attemptCount,budget,seed,index}){
 if(!Number.isSafeInteger(attemptCount)||attemptCount<0||attemptCount>capacity)throw new Error('INVALID_BIRTH_ATTEMPT_COUNT');
 const eligible=eligibleSkills(b,speciesId,mutated),owned=[],trace=[];let remaining=budget;
 const levels=s=>b.tables['skill-levels'].rows.filter(l=>l.skillId===s.id&&l.id===s.levelTableId).sort((a,b)=>a.level-b.level);
 const poolId=s=>s.type==='racial'?b.tables['species-bindings'].rows.find(r=>r.skillId===s.id).poolId:'shared';
 for(let slot=1;slot<=attemptCount;slot++){
  const rng=createRng(JSON.stringify([seed,index,'v6-pool-skill-stage-v1',slot]));
  const candidates=eligible.filter(s=>s.allowDuplicates||!owned.some(o=>o.skillId===s.id));
  const pools=b.settings.skills.poolWeights.filter(p=>p.weight>0&&candidates.some(s=>poolId(s)===p.id));
  if(!pools.length){trace.push({slot,accepted:false,reason:'no-eligible-candidates',cost:0});continue;}
  const pool=weighted(pools,p=>p.weight,rng),skill=weighted(candidates.filter(s=>poolId(s)===pool.id),s=>s.weight,rng),ls=levels(skill),original=weighted(ls,l=>l.birthWeight,rng);
  const free=owned.length===0,paidCost=free?0:original.cost;
  const attempt={slot,poolId:pool.id,availablePools:pools.map(p=>p.id),skillId:skill.id,originalLevel:original.level,drawnLevel:original.level,drawnCost:original.cost,freeOnBirth:free,remainingBefore:remaining,downgraded:false};
  if(paidCost>remaining){trace.push({...attempt,finalLevel:null,accepted:false,reason:'insufficient-budget',cost:0});continue;}
  const final=original;
  const binding=b.tables['species-bindings'].rows.find(r=>r.skillId===skill.id);
  owned.push({...structuredClone(skill),skillId:skill.id,instanceId:`BIRTH_${slot}`,birthLevel:final.level,currentLevel:final.level,stageCost:final.cost,birthCost:paidCost,birthBudgetCost:paidCost,freeOnBirth:free,description:final.description,source:'birth',effectImplemented:false,poolId:pool.id,originSpeciesId:binding?.speciesId??null});
  trace.push({...attempt,finalLevel:final.level,accepted:true,reason:free?'first-acquired-free':'accepted',cost:paidCost});remaining-=paidCost;
 }
 return {skills:owned,trace,budget:{available:budget,spent:budget-remaining,remaining,usage:budget?(budget-remaining)/budget:0}};
}
export function createGenerator(input,seed){
 const b=structuredClone(input),errors=validateBundle(b);if(errors.length)throw Object.assign(new Error(errors.map(e=>e.path+': '+e.message).join('\n')),{errors});
 const base=createBase(blankFoundation(b),seed),settingsFingerprint=fingerprint({settings:b.settings,tables:b.tables,portraits:b.portraits});let cursor=0;
 function generateAt(index,{speciesId=null}={}){
  const result=base.generateAt(index),c=result.character;
  const srng=createRng(JSON.stringify([seed,index,'v6-species-v1'])),pool=b.tables.species.rows.filter(s=>s.enabled&&s.weight>0);
  const species=speciesId?pool.find(s=>s.id===speciesId):weighted(pool,s=>s.weight,srng);if(!species)throw new Error('UNKNOWN_OR_DISABLED_SPECIES');
  c.speciesId=species.id;c.speciesName=species.name;c.familyId=species.familyId;
  const brng=createRng(JSON.stringify([seed,index,'v6-backpack-v1']));
  if(species.minWidth!==null){const width=species.minWidth+Math.floor(brng()*(species.maxWidth-species.minWidth+1)),height=species.minHeight+Math.floor(brng()*(species.maxHeight-species.minHeight+1));c.backpack={width,height,cells:width*height};}
  const countProfile=b.settings.skills.birthCountDistribution.profiles.find(p=>p.rarityId===c.birthRarity.id);
  const attemptCount=weighted(countProfile.counts,r=>r.weight,createRng(JSON.stringify([seed,index,'v6-birth-attempt-count-v1']))).attempts;
  const birth=generateSkills(b,{speciesId:species.id,mutated:c.mutation.triggered,capacity:c.birthSkillSlots,attemptCount,budget:c.birthSkillBudget,seed,index});
  c.skills=birth.skills;c.birthSkills=structuredClone(c.skills);c.birthSkillAttemptCount=attemptCount;c.birthSkillCount=c.skills.length;c.currentSkillCount=c.skills.length;
  c.skillSlots=Array.from({length:c.birthSkillSlots},(_,i)=>{const record=c.skills.find(s=>s.instanceId===`BIRTH_${i+1}`),attempt=birth.trace.find(t=>t.slot===i+1);return {slot:i+1,skillInstanceId:record?.instanceId??null,emptyReason:record?null:attempt?.reason??'not-attempted'};});c.skillBudget=birth.budget;c.catalogState='excel-v6-four-stages';c.configurationState=c.backpack?'ready':'backpack-pending';
  const portraitId=c.mutation.triggered?weighted(Object.entries(b.portraits.mutationWeights),r=>r[1],createRng(JSON.stringify([seed,index,'v6-mutation-portrait-v1'])))[0]:b.portraits.species[species.id];c.portrait={id:portraitId,path:`./assets/portraits/${portraitId}.png`};
  c.id=`V6TEST_${fingerprint([seed,index,species.id,settingsFingerprint])}`;result.replay={...result.replay,algorithm:ALGORITHM,settingsFingerprint,requestedSpeciesId:speciesId};
  result.warnings=c.backpack?[]:[{code:'BACKPACK_PENDING',message:'Excel 未填背包範圍；等待確認，不補造尺寸。'}];result.calculation.skillBudget=birth.budget;result.calculation.skillAttempts=birth.trace;
  assertCharacter(c);return result;
 }
 return {generateAt,next:options=>generateAt(cursor++,options)};
}
export function assertCharacter(c){
 if(c.skills.length>c.birthSkillSlots||c.skillSlots.length!==c.birthSkillSlots||c.birthSkillCount!==c.skills.length||c.currentSkillCount!==c.skills.length||!Number.isSafeInteger(c.birthSkillAttemptCount)||c.birthSkillAttemptCount<0||c.birthSkillAttemptCount>c.birthSkillSlots)throw new Error('SKILL_CAPACITY_INVARIANT');
 const occupied=c.skillSlots.filter(s=>s.skillInstanceId!==null);if(occupied.length!==c.skills.length||c.skills.some(s=>occupied.filter(slot=>slot.skillInstanceId===s.instanceId).length!==1))throw new Error('SKILL_SLOT_REFERENCE_INVARIANT');
 if(c.skills.reduce((n,s)=>n+s.birthCost,0)!==c.skillBudget.spent||c.skillBudget.spent>c.birthSkillBudget||c.skillBudget.remaining!==c.birthSkillBudget-c.skillBudget.spent)throw new Error('BUDGET_INVARIANT');
 if(c.skills.some((s,i)=>s.freeOnBirth!==(i===0)||s.birthCost!==(i===0?0:s.stageCost)||s.birthBudgetCost!==s.birthCost))throw new Error('FIRST_SKILL_FREE_INVARIANT');
 const ids=new Set();for(const s of c.skills){if(ids.has(s.id)&&!s.allowDuplicates)throw new Error('DUPLICATE_SKILL');ids.add(s.id);if(!c.mutation.triggered&&s.originSpeciesId&&s.originSpeciesId!==c.speciesId)throw new Error('FOREIGN_RACIAL_SKILL');}
}
