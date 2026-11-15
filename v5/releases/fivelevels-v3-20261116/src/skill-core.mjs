import { createRng, fingerprint, createFoundationGenerator } from './core.mjs';
import { assertSkillRules } from './skill-rules.mjs';
import { schemas } from './schema.mjs';
import {reserveLevelOne} from './skill-reservation.mjs';

export const ALGORITHM='skill-birth-v2/reserve-minimum-downgrade';
export const FIVE_LEVEL_ALGORITHM='skill-birth-v3/excel-five-levels-reserve';
function generationRules(rules){
  const copy=structuredClone(rules);
  // Artwork metadata must not change replay IDs or generation rules.
  for(const skill of copy.skills)delete skill.icon;
  return copy;
}
function gameplayFingerprint(data){
  const tables=Object.fromEntries(Object.entries(schemas).map(([table,[,fields]])=>{
    const keys=fields.split(' ').map(f=>f.split('=')[0].split(':')[0]);
    return [table,data[table].map(row=>Object.fromEntries(keys.map(key=>[key,row[key]])))];
  }));
  return fingerprint({schemaVersion:data.schemaVersion,formulaContract:data.formulaContract,sourceSha256:data.source.sha256,...tables});
}
function pick(pool,weight,rng){
  const positive=pool.filter(item=>weight(item)>0),sum=positive.reduce((n,item)=>n+weight(item),0);
  if(!positive.length||!Number.isFinite(sum)||sum<=0)throw new Error('EMPTY_WEIGHT_POOL');
  let point=rng()*sum;for(const item of positive){point-=weight(item);if(point<0)return item;}return positive.at(-1);
}
function skillRecord(data,rules,definition,level,slot,binding=null){
  const source=definition.registration==='excel-experimental'?{id:definition.skillId,name:definition.name}:data.skills.find(s=>s.id===definition.skillId);
  return {instanceId:`BIRTH_SKILL_${slot}`,id:source.id,skillId:source.id,name:source.name,icon:typeof definition.icon==='string'?definition.icon:`./assets/skills/${source.id}.svg`,type:definition.type,birthLevel:level.level,currentLevel:level.level,birthCost:level.cost,
    levelCosts:rules.levelTables.find(t=>t.id===definition.levelTableId).levels.map(l=>({level:l.level,cost:l.cost})),
    weight:definition.weight,allowedSpeciesIds:[...definition.allowedSpeciesIds],allowDuplicates:definition.allowDuplicates,
    locked:binding?binding.locked:definition.lockedOnBirth,canUpgrade:true,source:'birth',acquisition:binding?'species-bound':'random-birth',bindingId:binding?.bindingId??null,boundSpeciesId:binding?.speciesId??null,
    effectImplemented:false,status:rules.status};
}
export function generateBirthSkills(data,rules,{speciesId,capacity,budget,seed,index}){
  const owned=[],slots=[],bindings=rules.speciesBindings.filter(b=>b.speciesId===speciesId);
  let remaining=budget;
  function accept(definition,level,slot,binding=null,trace={}){
    const record=skillRecord(data,rules,definition,level,slot,binding);owned.push(record);remaining-=level.cost;
    slots.push({slot,skillInstanceId:record.instanceId,attempt:{skillId:record.skillId,birthLevel:level.level,originalLevel:level.level,finalLevel:level.level,downgraded:false,downgradeReason:null,cost:level.cost,accepted:true,reason:binding?'species-bound':'accepted',...trace}});
  }
  for(const binding of bindings){
    const definition=rules.skills.find(s=>s.skillId===binding.skillId),level=rules.levelTables.find(t=>t.id===definition.levelTableId).levels.find(l=>l.level===binding.birthLevel);
    const slot=owned.length+1;
    const reservedForBindings=bindings.slice(slot).reduce((sum,b)=>{const d=rules.skills.find(s=>s.skillId===b.skillId);return sum+rules.levelTables.find(t=>t.id===d.levelTableId).levels.find(l=>l.level===b.birthLevel).cost;},0);
    const reservedForRemaining=rules.version===3?reserveLevelOne(rules,speciesId,bindings.map(b=>b.skillId),capacity-bindings.length):(capacity-bindings.length)*rules.policies.minimumSlotReserve;
    if(slot>capacity||level.cost+reservedForBindings+reservedForRemaining>remaining)throw new Error('BOUND_SKILL_INVARIANT_FAILED');
    accept(definition,level,slot,binding,{originalCost:level.cost,remainingBefore:remaining,reservedForBindings,reservedForRemaining,availableForSlot:remaining-reservedForBindings-reservedForRemaining});
  }
  for(let slot=bindings.length+1;slot<=capacity;slot++){
    const rng=createRng(JSON.stringify([seed,index,'birth-skill-slot-v1',slot]));
    const pool=rules.skills.filter(s=>s.weight>0&&(!s.allowedSpeciesIds.length||s.allowedSpeciesIds.includes(speciesId))&&(s.allowDuplicates||!owned.some(o=>o.skillId===s.skillId)));
    if(!pool.length)throw new Error(`SKILL_POOL_CANNOT_FILL: species=${speciesId}, slot=${slot}`);
    const definition=pick(pool,s=>s.weight,rng),table=rules.levelTables.find(t=>t.id===definition.levelTableId),original=pick(table.levels,l=>l.birthWeight,rng);
    const reservedForRemaining=rules.version===3?reserveLevelOne(rules,speciesId,[...owned.map(s=>s.skillId),definition.skillId],capacity-slot):(capacity-slot)*rules.policies.minimumSlotReserve,availableForSlot=remaining-reservedForRemaining;
    let level=original;
    while(level.cost>availableForSlot&&level.level>1)level=table.levels.find(l=>l.level===level.level-1);
    if(!level||level.cost>availableForSlot)throw new Error(`SKILL_BUDGET_CANNOT_FILL: species=${speciesId}, slot=${slot}`);
    accept(definition,level,slot,null,{originalLevel:original.level,finalLevel:level.level,originalCost:original.cost,remainingBefore:remaining,reservedForRemaining,availableForSlot,downgraded:level.level!==original.level,downgradeReason:level.level!==original.level?'exceeds-slot-allocation-after-reserve':null});
  }
  return {skills:owned,slots,budget:{available:budget,spent:budget-remaining,remaining,usage:budget?((budget-remaining)/budget):0}};
}
export function assertBirthInvariants(character,rules){
  const skills=character.skills,budget=character.birthSkillBudget;
  if(skills.length!==character.birthSkillSlots||character.skillSlots.length!==character.birthSkillSlots||character.skillSlots.some(s=>!s.skillInstanceId))throw new Error('SKILL_CAPACITY_NOT_FILLED');
  const spent=skills.reduce((n,s)=>n+s.birthCost,0);
  if(spent>budget||spent!==character.skillBudget.spent||budget-spent!==character.skillBudget.remaining)throw new Error('SKILL_BUDGET_INVARIANT_FAILED');
  const counts=new Map();for(const s of skills){counts.set(s.skillId,(counts.get(s.skillId)||0)+1);if(counts.get(s.skillId)>1&&!s.allowDuplicates)throw new Error('DUPLICATE_SKILL');}
  for(const binding of rules.speciesBindings.filter(b=>b.speciesId===character.speciesId))if(!skills.some(s=>s.bindingId===binding.bindingId&&s.birthLevel===binding.birthLevel))throw new Error('BOUND_SKILL_MISSING');
  if(character.birthRarity.id!==rules.rarityProfiles.find(p=>p.skillSlots===character.birthSkillSlots)?.rarityId)throw new Error('BIRTH_RARITY_CAPACITY_MISMATCH');
}
export function createGenerator(sourceData,parameters,sourceRules,seed){
  const data=structuredClone(sourceData),p=structuredClone(parameters),rules=structuredClone(sourceRules),validation=assertSkillRules(data,rules);
  if(p.talentChance!==0)throw new Error('UNSUPPORTED_LEGACY_TALENTS: new skill test requires legacy talentChance=0');
  const foundation=createFoundationGenerator(data,p,seed),ruleFingerprint=fingerprint(generationRules(rules)),dataFingerprint=gameplayFingerprint(data),parameterFingerprint=fingerprint(p);
  let nextIndex=0;
  function generateAt(index,{speciesId=null}={}){
    if(!Number.isSafeInteger(index)||index<0)throw new Error('INVALID_INDEX');
    const replay={algorithm:rules.version===3?FIVE_LEVEL_ALGORITHM:ALGORITHM,seed,index,requestedSpeciesId:speciesId,sourceSha256:data.source.sha256,dataFingerprint,ruleFingerprint,parameterFingerprint};
    try{
      // Capacity/budget are rolled first. Foundation and mutation use independent streams.
      const rng=createRng(JSON.stringify([seed,index,'birth-capacity-budget-v1']));
      const profile=pick(rules.rarityProfiles,r=>r.weight,rng);
      const baseBudget=profile.budgetMin+Math.floor(rng()*(profile.budgetMax-profile.budgetMin+1));
      const mutationRoll=createRng(JSON.stringify([seed,index,'positive-skill-budget-mutation-v1']))();
      const triggered=mutationRoll<rules.mutation.probability,multiplier=triggered?rules.mutation.skillBudgetMultiplier:1;
      const available=Math.floor(baseBudget*multiplier);
      const base=foundation.generateAt(index,{speciesId});
      const birth=generateBirthSkills(data,rules,{speciesId:base.species.id,capacity:profile.skillSlots,budget:available,seed,index});
      const sourceRarity=data.rarities.find(r=>r.id===profile.rarityId);
      const rarity={id:sourceRarity.id,name:sourceRarity.name,status:rules.status,source:'birth-skill-capacity'};
      const character={
        schemaVersion:2,id:`SKILLTEST_${fingerprint(JSON.stringify([seed,dataFingerprint,ruleFingerprint,parameterFingerprint,speciesId]))}_${index.toString().padStart(6,'0')}`,
        speciesId:base.species.id,speciesName:base.species.name,speciesStatus:base.species.status,familyId:base.species.familyId,
        stats:base.stats,growth:base.growth,backpack:{width:base.width,height:base.height,cells:base.width*base.height},appearance:base.appearance,
        personality:base.personality?{id:base.personality.id,name:base.personality.name,visible:base.personality.visible,effectImplemented:false}:null,
        rarity:structuredClone(rarity),birthRarity:structuredClone(rarity),currentRarity:structuredClone(rarity),birthSkillSlots:profile.skillSlots,currentSkillSlots:profile.skillSlots,
        birthSkillBaseBudget:baseBudget,birthSkillBudget:available,birthSkills:structuredClone(birth.skills),skills:birth.skills,skillSlots:birth.slots,skillBudget:birth.budget,
        mutation:{triggered,kind:'positive-skill-budget',probability:rules.mutation.probability,multiplier,baseBudget,effectiveBudget:available,bonusBudget:available-baseBudget,otherEffectsImplemented:false},
        talents:[],breakthrough:{stage:0,materialsSpent:[],materialId:null,regrantsBirthBudget:false,implemented:false},
      };
      assertBirthInvariants(character,rules);
      const affixes=birth.budget.spent;
      const calculation={...base.calculation,subtotals:{...base.calculation.subtotals,affixes},total:base.calculation.subtotals.backpack+base.calculation.subtotals.base+affixes+base.calculation.subtotals.hidden,
        rarity,rarityRule:'出生稀有度只由抽中的技能容量決定；總價值不參與判級',skillBudget:{base:baseBudget,...birth.budget},skillAttempts:birth.slots,
        ledger:[...base.calculation.ledger,...birth.skills.map(s=>({kind:'skill',id:s.skillId,points:s.birthCost,birthLevel:s.birthLevel}))]};
      return {ok:true,replay,selectedSpeciesId:base.species.id,character,calculation,errors:[],warnings:[{code:'TENTATIVE_SKILL_RULES',message:rules.status},...base.warnings,...structuredClone(validation.warnings)]};
    }catch(error){return {ok:false,replay,selectedSpeciesId:speciesId,character:null,calculation:null,errors:[{code:error.message.split(':')[0],message:error.message}],warnings:structuredClone(validation.warnings)};}
  }
  return {next:options=>generateAt(nextIndex++,options),generateAt};
}
export function playerView(result){
  if(!result?.ok)return null;const c=result.character;
  return structuredClone({id:c.id,speciesId:c.speciesId,speciesName:c.speciesName,speciesStatus:c.speciesStatus,familyId:c.familyId,rarity:c.currentRarity,birthRarity:c.birthRarity,currentRarity:c.currentRarity,stats:c.stats,growth:c.growth,backpack:c.backpack,appearance:c.appearance,personality:c.personality?.visible?c.personality:null,
    skills:c.skills.map(s=>({id:s.skillId,skillId:s.skillId,instanceId:s.instanceId,name:s.name,icon:s.icon,type:s.type,birthLevel:s.birthLevel,currentLevel:s.currentLevel,locked:s.locked,canUpgrade:s.canUpgrade,source:s.source,effectImplemented:false})),talents:[],mutated:c.mutation.triggered});
}
