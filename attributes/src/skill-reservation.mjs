// Largest possible sum of Lv.1 costs over future legal draws, without RNG.
// This guarantees affordability even when different skills have different Lv.1 costs.
export function reserveLevelOne(rules,speciesId,ownedIds,count){
 const excluded=new Set(ownedIds);
 let pool=rules.skills.filter(s=>s.weight>0&&(!s.allowedSpeciesIds.length||s.allowedSpeciesIds.includes(speciesId))&&(s.allowDuplicates||!excluded.has(s.skillId))).map(s=>({...s,minimum:rules.levelTables.find(t=>t.id===s.levelTableId).levels.find(l=>l.level===1).cost}));
 let total=0;
 for(let i=0;i<count;i++){
  if(!pool.length)throw new Error('SKILL_POOL_CANNOT_FILL');
  pool.sort((a,b)=>b.minimum-a.minimum);const next=pool[0];total+=next.minimum;
  if(!Number.isSafeInteger(total))throw new Error('SKILL_RESERVE_OVERFLOW');
  if(!next.allowDuplicates)pool=pool.filter(s=>s.skillId!==next.skillId);
 }
 return total;
}
