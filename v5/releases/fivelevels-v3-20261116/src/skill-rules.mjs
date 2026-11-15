import { assertValidData } from './validate.mjs';
import {reserveLevelOne} from './skill-reservation.mjs';

export const RARITY_ORDER=['RAR_C','RAR_R','RAR_E','RAR_L','RAR_M'];
export function validateSkillRules(data,rules){
  const errors=[],warnings=[];
  const error=(code,location,message)=>errors.push({code,location,message});
  const integer=(value,min=0)=>Number.isSafeInteger(value)&&value>=min;
  const weight=value=>Number.isFinite(value)&&value>=0;
  const positivePool=items=>Number.isFinite(items.reduce((n,x)=>n+x,0))&&items.reduce((n,x)=>n+x,0)>0;
  const unique=(items,key,location)=>{
    const ids=new Set();for(const item of items){if(!item||typeof item[key]!=='string'||!item[key]){error('MISSING_ID',location,key);continue;}if(ids.has(item[key]))error('DUPLICATE_ID',location,item[key]);ids.add(item[key]);}
  };
  if(!rules||![2,3].includes(rules.version)||typeof rules.status!=='string'||!rules.status.includes('暫定'))return {errors:[{code:'INVALID_RULE_VERSION',location:'rules',message:'Require version 2 or 3 filled-slot rules and tentative status'}],warnings};
  const known=['version','status','rarityProfiles','levelTables','skills','speciesBindings','mutation','policies'];
  for(const key of Object.keys(rules))if(!known.includes(key))error('UNKNOWN_RULE_FIELD','rules',key);
  for(const key of ['rarityProfiles','levelTables','skills','speciesBindings'])if(!Array.isArray(rules[key]))error('MISSING_RULE_TABLE',key,'Array required');
  if(errors.length)return {errors,warnings};
  unique(rules.rarityProfiles,'rarityId','rarityProfiles');unique(rules.levelTables,'id','levelTables');unique(rules.skills,'skillId','skills');unique(rules.speciesBindings,'bindingId','speciesBindings');
  if(errors.length)return {errors,warnings};
  if(rules.rarityProfiles.length!==5)error('RARITY_PROFILE_SET','rarityProfiles','Require five capacity profiles');
  for(const row of rules.rarityProfiles){
    if(!data.rarities.some(r=>r.id===row.rarityId&&r.enabled))error('MISSING_REFERENCE',row.rarityId,'V5 rarity');
    if(row.skillSlots!==RARITY_ORDER.indexOf(row.rarityId)+1)error('RARITY_CAPACITY_MISMATCH',row.rarityId,'Common through mythic require capacities 1 through 5');
    if(!weight(row.weight))error('INVALID_WEIGHT',row.rarityId,'rarity weight');
    if(!integer(row.budgetMin,1)||!integer(row.budgetMax,1)||row.budgetMin>row.budgetMax)error('INVALID_BUDGET_RANGE',row.rarityId,'Positive integer inclusive budget range');
  }
  if(!positivePool(rules.rarityProfiles.map(r=>r.weight)))error('EMPTY_RARITY_WEIGHT_POOL','rarityProfiles','Weight sum must be finite and positive');
  for(const table of rules.levelTables){
    if(!Array.isArray(table.levels)||!table.levels.length){error('EMPTY_LEVEL_TABLE',table.id,'No levels');continue;}
    const levels=new Set();
    for(const level of table.levels){
      if(!level||typeof level!=='object'){error('INVALID_LEVEL_ROW',table.id,'Level object required');continue;}
      if(!integer(level.level,1)||levels.has(level.level))error('INVALID_OR_DUPLICATE_LEVEL',table.id,String(level.level));levels.add(level.level);
      if(!integer(level.cost))error('INVALID_LEVEL_COST',table.id,'Cost must be a nonnegative integer');
      if(!weight(level.birthWeight))error('INVALID_WEIGHT',table.id,'level weight');
    }
    if(!positivePool(table.levels.map(l=>l?.birthWeight)))error('EMPTY_LEVEL_WEIGHT_POOL',table.id,'No positive-weight level');
  }
  for(const skill of rules.skills){
    const source=data.skills.find(s=>s.id===skill.skillId);
    if(rules.version===3){
      if(skill.registration!=='excel-experimental'||typeof skill.name!=='string'||!skill.name.trim()||typeof skill.status!=='string'||!skill.status.includes('暫定'))error('INVALID_EXPERIMENTAL_SKILL',skill.skillId,'Require explicit Excel registration, name and tentative status');
    }else if(!source)error('MISSING_REFERENCE',skill.skillId,'V5 skill');
    else if(!source.enabled||source.status!=='確定')error('SKILL_NOT_GENERATABLE',skill.skillId,'V5 disabled or unconfirmed skill');
    if(!['active','passive'].includes(skill.type))error('INVALID_SKILL_TYPE',skill.skillId,'active/passive');
    if(!weight(skill.weight))error('INVALID_WEIGHT',skill.skillId,'skill weight');
    if(typeof skill.allowDuplicates!=='boolean'||typeof skill.lockedOnBirth!=='boolean')error('INVALID_SKILL_FLAG',skill.skillId,'allowDuplicates/lockedOnBirth');
    if(!rules.levelTables.some(t=>t.id===skill.levelTableId))error('MISSING_REFERENCE',skill.skillId,'levelTableId');
    if(!Array.isArray(skill.allowedSpeciesIds))error('INVALID_SPECIES_RESTRICTION',skill.skillId,'Array required; empty means all');
    else{
      if(new Set(skill.allowedSpeciesIds).size!==skill.allowedSpeciesIds.length)error('DUPLICATE_SPECIES_RESTRICTION',skill.skillId,'Duplicate ID');
      for(const id of skill.allowedSpeciesIds)if(!data.species.some(s=>s.id===id))error('MISSING_REFERENCE',skill.skillId,'Species '+id);
    }
  }
  if(!positivePool(rules.skills.map(s=>s.weight)))error('EMPTY_SKILL_WEIGHT_POOL','skills','No positive-weight skill');
  const mutation=rules.mutation;
  if(!mutation||!weight(mutation.probability)||mutation.probability>1)error('INVALID_MUTATION_PROBABILITY','mutation','Require probability 0..1');
  if(!mutation||!Number.isFinite(mutation.skillBudgetMultiplier)||mutation.skillBudgetMultiplier<1||(mutation.probability>0&&mutation.skillBudgetMultiplier<=1))error('INVALID_MUTATION_MULTIPLIER','mutation','Positive mutation must increase the budget');
  if(mutation?.rounding!=='floor')error('UNSUPPORTED_MUTATION_ROUNDING','mutation','Only explicit floor is supported');
  if(mutation)for(const row of rules.rarityProfiles)if(!integer(Math.floor(row.budgetMax*mutation.skillBudgetMultiplier)))error('BUDGET_OVERFLOW',row.rarityId,'Unsafe mutated budget');
  const expectedPolicies={budgetSampling:'uniform-inclusive-integer',overBudget:'reserve-minimum-downgrade-no-retry',duplicate:'exclude-unless-allowed',bindingFailure:'reject-configuration',legacyTalents:'disabled',...(rules.version===3?{reservation:'eligible-distinct-level-one'}:{minimumSlotReserve:30})};
  if(!rules.policies||Object.keys(rules.policies).length!==Object.keys(expectedPolicies).length)error('INVALID_POLICIES','policies','Require all explicit policies');
  for(const [key,value]of Object.entries(expectedPolicies))if(rules.policies?.[key]!==value)error('UNSUPPORTED_POLICY',key,value);
  for(const profile of rules.rarityProfiles.filter(p=>p.weight>0))if(rules.version===2&&profile.budgetMin<profile.skillSlots*expectedPolicies.minimumSlotReserve)error('SKILL_MINIMUM_BUDGET_CONFLICT',profile.rarityId,'Minimum budget must fund every slot at Lv.1');
  for(const table of rules.levelTables){
    if(!Array.isArray(table.levels))continue;
    const levels=table.levels.filter(Boolean).slice().sort((a,b)=>a.level-b.level);
    if(rules.version===3){if(levels.length!==5)error('FIVE_LEVELS_REQUIRED',table.id,'Require exactly Lv.1 through Lv.5');if(!integer(levels[0]?.cost,1))error('INVALID_MINIMUM_LEVEL_COST',table.id,'Lv.1 must have a positive integer Excel cost');}
    else if(levels[0]?.level!==1||levels[0]?.cost!==expectedPolicies.minimumSlotReserve)error('INVALID_MINIMUM_LEVEL_COST',table.id,'Lv.1 must cost the reserved 30 points');
    for(let i=0;i<levels.length;i++)if(levels[i].level!==i+1||(i&&levels[i].cost<levels[i-1].cost))error('INVALID_DOWNGRADE_LADDER',table.id,'Levels must be contiguous from 1 with nondecreasing costs');
  }
  for(const binding of rules.speciesBindings){
    const species=data.species.find(s=>s.id===binding.speciesId),skill=rules.skills.find(s=>s.skillId===binding.skillId);
    if(!species||!species.enabled)error('MISSING_REFERENCE',binding.bindingId,'Enabled V5 species');
    if(!skill)error('MISSING_REFERENCE',binding.bindingId,'Skill definition');
    else{
      if(Array.isArray(skill.allowedSpeciesIds)&&skill.allowedSpeciesIds.length&&!skill.allowedSpeciesIds.includes(binding.speciesId))error('BOUND_SKILL_RESTRICTED',binding.bindingId,'Species restriction excludes binding');
      const levels=rules.levelTables.find(t=>t.id===skill.levelTableId)?.levels;
      if(!Array.isArray(levels)||!levels.some(l=>l?.level===binding.birthLevel))error('MISSING_REFERENCE',binding.bindingId,'Birth level');
    }
    if(typeof binding.locked!=='boolean')error('INVALID_BINDING_LOCK',binding.bindingId,'Boolean required');
  }
  if(errors.length)return {errors,warnings};
  for(const species of data.species.filter(s=>s.enabled)){
    const bound=rules.speciesBindings.filter(b=>b.speciesId===species.id),counts=new Map();let cost=0;
    for(const binding of bound){
      const skill=rules.skills.find(s=>s.skillId===binding.skillId),level=rules.levelTables.find(t=>t.id===skill.levelTableId).levels.find(l=>l.level===binding.birthLevel);
      cost+=level.cost;counts.set(skill.skillId,(counts.get(skill.skillId)||0)+1);
      if(counts.get(skill.skillId)>1&&!skill.allowDuplicates)error('DUPLICATE_BOUND_SKILL',species.id,skill.skillId);
    }
    for(const profile of rules.rarityProfiles.filter(p=>p.weight>0)){
      if(bound.length>profile.skillSlots)error('BOUND_SKILL_CAPACITY_CONFLICT',species.id,profile.rarityId);
      let minimum;
      try{minimum=cost+(rules.version===3?reserveLevelOne(rules,species.id,bound.map(b=>b.skillId),Math.max(0,profile.skillSlots-bound.length)):Math.max(0,profile.skillSlots-bound.length)*rules.policies.minimumSlotReserve);}catch(e){error(e.message,species.id,profile.rarityId+' cannot reserve all remaining slots');continue;}
      if(minimum>profile.budgetMin&&(bound.length||rules.version===3))error(bound.length?'BOUND_SKILL_BUDGET_CONFLICT':'SKILL_MINIMUM_BUDGET_CONFLICT',profile.rarityId,species.id+' budget cannot cover every eligible Lv.1 outcome');
    }
    const pool=rules.skills.filter(s=>s.weight>0&&(!s.allowedSpeciesIds.length||s.allowedSpeciesIds.includes(species.id)));
    const free=pool.filter(s=>s.allowDuplicates||!counts.has(s.skillId));
    for(const profile of rules.rarityProfiles.filter(p=>p.weight>0))if(!free.some(s=>s.allowDuplicates)&&free.length<profile.skillSlots-bound.length)error('SKILL_POOL_CANNOT_FILL',species.id,profile.rarityId+' lacks enough eligible nonduplicate skills');
  }
  if(!rules.speciesBindings.length)warnings.push({code:'NO_SPECIES_BINDINGS',message:'V5 has no confirmed species-bound skill table; no default binding invented.'});
  return {errors,warnings};
}
export function assertSkillRules(data,rules){
  assertValidData(data);
  const result=validateSkillRules(data,rules);
  if(result.errors.length)throw new Error('INVALID_SKILL_RULES: '+JSON.stringify(result.errors));
  return result;
}
