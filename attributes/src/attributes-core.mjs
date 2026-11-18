import {createGenerator as createSkills} from './skill-core.mjs';
import {createRng,fingerprint} from './core.mjs';
import {assertSkillRules} from './skill-rules.mjs';
export const FORMAT='rpg-attributes-character-v1';
export const SETTINGS='rpg-attributes-settings-v1';
export const ALGORITHM='attributes-v1/independent-growth-fivelevel-skills';
export const IDS=['STR','VIT','INT','AGI'];
export const GRADES=['D','C','B','A','S'];
const fail=(path,message)=>{throw Object.assign(new Error(message),{path});};
export function validateSettings(data,s){
 const errors=[];const check=(path,message)=>errors.push({path,message});
 if(s?.format!==SETTINGS)return [{path:'format',message:'不相容的設定版本；舊檔請使用五級舊版'}];
 const a=s.attributes;
 if(!a||!Array.isArray(a.base)||!a.points||!Array.isArray(a.grades)||!Array.isArray(a.combat))return [{path:'attributes',message:'缺少素質、配點、評級或衍生能力表'}];
 if(a.base.length!==4||IDS.some(id=>a.base.filter(x=>x.id===id).length!==1))check('attributes.base','必須恰好包含 STR、VIT、INT、AGI');
 for(const [i,b]of a.base.entries())if(!Number.isSafeInteger(b.birth)||b.birth<0||b.birth>100000)check(`attributes.base.${i}.birth`,'出生素質須為0～100000整數');
 for(const key of ['starting','perLevel','levelCap'])if(!Number.isSafeInteger(a.points[key])||a.points[key]<(key==='levelCap'?1:0)||a.points[key]>100000)check('attributes.points.'+key,'點數與等級設定須為範圍內非負整數');
 if(a.grades.length!==20)check('attributes.grades','每項新素質須有五個獨立評級');
 for(const id of IDS){let last=-Infinity,sum=0;for(const grade of GRADES){const rows=a.grades.filter(x=>x.attribute===id&&x.grade===grade);if(rows.length!==1){check('attributes.grades',`${id}/${grade}缺少或重複`);continue;}const row=rows[0],i=a.grades.indexOf(row);if(!Number.isFinite(row.multiplier)||row.multiplier<=last||row.multiplier<=0||row.multiplier>100)check(`attributes.grades.${i}.multiplier`,'倍率須為正且 D<C<B<A<S');last=row.multiplier;if(!Number.isFinite(row.weight)||row.weight<0)check(`attributes.grades.${i}.weight`,'抽樣權重須為非負有限數');sum+=row.weight;}if(!(sum>0))check('attributes.grades',id+'的總權重必須大於0');}
 const expected={physicalAttack:'STR',maxHP:'VIT',hpRegen:'VIT',magicalAttack:'INT',attackSpeed:'AGI',dodge:'AGI',maxMP:'',mpRegen:'',critical:'',movementSpeed:''};
 if(a.combat.length!==Object.keys(expected).length)check('attributes.combat','衍生能力欄位不完整');
 for(const [id,attribute]of Object.entries(expected)){const rows=a.combat.filter(x=>x.id===id);if(rows.length!==1){check('attributes.combat',id+'缺少或重複');continue;}const r=rows[0],p='attributes.combat.'+a.combat.indexOf(r);if(r.attribute!==attribute)check(p+'.attribute','尚未定義的屬性關係不可套用');for(const k of ['base','coefficient','cap'])if(!Number.isFinite(r[k])||r[k]<0||r[k]>1e9)check(p+'.'+k,'須為有限非負數且不超過十億');if(attribute&&!(r.coefficient>0))check(p+'.coefficient','對應能力係數須大於0');if(!attribute&&r.coefficient!==0)check(p+'.coefficient','保留能力不得擅自連結素質');if(r.cap<r.base)check(p+'.cap','上限不可小於基準');if(!Number.isInteger(r.decimals)||r.decimals<0||r.decimals>6)check(p+'.decimals','小數位須為0～6');}
 try{assertSkillRules(data,s.skills);}catch(e){check('skills',e.message);}
 return errors;
}
export function assertSettings(data,s){const errors=validateSettings(data,s);if(errors.length)throw Object.assign(new Error(errors.map(e=>e.path+': '+e.message).join('\n')),{errors});}
export function pointsAtLevel(a,level){if(!Number.isInteger(level)||level<1||level>a.points.levelCap)fail('level','等級超出設定範圍');return a.points.starting+(level-1)*a.points.perLevel;}
export function allocate(character,a,{level=1,allocated=Object.fromEntries(IDS.map(id=>[id,0]))}={}){
 if(character?.format!==FORMAT)fail('format','舊版角色無法直接套用新素質，請使用舊版開啟');
 const earned=pointsAtLevel(a,level);if(Object.keys(allocated).length!==4||IDS.some(id=>!Object.hasOwn(allocated,id)))fail('allocated','配點須包含且僅包含四項新素質');
 let spent=0;const effective={},attributes={};for(const id of IDS){const n=allocated[id];if(!Number.isSafeInteger(n)||n<0)fail(id,'投入點數須為非負整數');spent+=n;const g=a.grades.find(g=>g.attribute===id&&g.grade===character.growthGrades[id]);if(!g)fail(id,'角色評級不存在');effective[id]=character.birthAttributes[id]+n*g.multiplier;attributes[id]={birth:character.birthAttributes[id],allocated:n,grade:g.grade,multiplier:g.multiplier,effective:effective[id]};}
 if(spent>earned)fail('allocated','配點超支');const combat={};for(const r of a.combat){const raw=r.base+(r.attribute?effective[r.attribute]*r.coefficient:0);combat[r.id]=Number(Math.min(raw,r.cap).toFixed(r.decimals));}
 return {level,earned,spent,remaining:earned-spent,allocated:structuredClone(allocated),attributes,combat,provisional:true};
}
export function createAttributeGenerator(data,parameters,settings,seed){
 assertSettings(data,settings);const s=structuredClone(settings),legacy=createSkills(data,parameters,s.skills,seed);let next=0;
 function generateAt(index,options={}){const original=legacy.generateAt(index,options);if(!original.ok)return original;const old=original.character;
 const growthGrades={};for(const id of IDS){const rows=s.attributes.grades.filter(g=>g.attribute===id),rng=createRng(JSON.stringify([seed,index,'attributes-grades-v1',id]));let roll=rng()*rows.reduce((n,g)=>n+g.weight,0);growthGrades[id]=rows.at(-1).grade;for(const g of rows){roll-=g.weight;if(roll<0){growthGrades[id]=g.grade;break;}}}
 const character=structuredClone(old);delete character.stats;delete character.growth;character.format=FORMAT;character.schemaVersion=4;character.id='ATTR_'+fingerprint([old.id,s.attributes])+'_'+String(index).padStart(6,'0');character.birthAttributes=Object.fromEntries(s.attributes.base.map(b=>[b.id,b.birth]));character.growthGrades=growthGrades;
 const replay={...original.replay,skillAlgorithm:original.replay.algorithm,algorithm:ALGORITHM,settingsFingerprint:fingerprint(s)};
 return {ok:true,character,progression:allocate(character,s.attributes),replay,warnings:original.warnings,errors:[],calculation:{backpack:structuredClone(original.calculation.backpack),attributeScore:{implemented:false,reason:"新版素質尚無已確認的計分公式"},skillBudget:original.calculation.skillBudget,skillAttempts:original.calculation.skillAttempts,rarityRule:'出生技能容量；不使用總分判級',legacyAbilityScoringUsed:false}};
 }
 return {generateAt,next:options=>generateAt(next++,options)};
}
export function exportCharacter(result,settings,progression=result.progression){return {format:FORMAT,algorithm:ALGORITHM,settingsFingerprint:fingerprint(settings),character:structuredClone(result.character),replay:structuredClone(result.replay),progression:structuredClone(progression)};}
export function loadCharacter(value,settings,context=null){if(value?.format!==FORMAT||value.character?.format!==FORMAT)fail('format','不支援舊版角色檔；請於五級舊版開啟');if(value.settingsFingerprint!==fingerprint(settings))fail('settingsFingerprint','設定版本不同，無法安全套用角色檔');
 for(const b of settings.attributes.base)if(value.character.birthAttributes?.[b.id]!==b.birth)fail('birthAttributes','出生素質與設定不符');
 if(context){const expected=createAttributeGenerator(context.data,context.parameters,settings,value.replay?.seed).generateAt(value.replay?.index,{speciesId:value.replay?.requestedSpeciesId});if(!expected.ok||fingerprint(expected.character)!==fingerprint(value.character))fail('character','角色出生資料與Seed重播不符，已拒絕套用');}
 const computed=allocate(value.character,settings.attributes,value.progression);return {...structuredClone(value),progression:computed};}
export function boardSize(data){return {width:Math.max(...data.species.map(s=>s.maxWidth)),height:Math.max(...data.species.map(s=>s.maxHeight))};}
