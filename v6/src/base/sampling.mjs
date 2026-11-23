import {createRng} from './random.mjs';
import {IDS} from './attributes.mjs';
function pick(pool,weight,rng){
  const positive=pool.filter(item=>weight(item)>0),sum=positive.reduce((n,item)=>n+weight(item),0);
  if(!positive.length||!Number.isFinite(sum)||sum<=0)throw new Error('EMPTY_WEIGHT_POOL');
  let point=rng()*sum;for(const item of positive){point-=weight(item);if(point<0)return item;}return positive.at(-1);
}

export function sampleBirth(rules,seed,index){
      const rng=createRng(JSON.stringify([seed,index,'birth-capacity-budget-v1']));
      const profile=pick(rules.rarityProfiles,r=>r.weight,rng);
      const baseBudget=profile.budgetMin+Math.floor(rng()*(profile.budgetMax-profile.budgetMin+1));
      const mutationRoll=createRng(JSON.stringify([seed,index,'positive-skill-budget-mutation-v1']))();
      const triggered=mutationRoll<rules.mutation.probability,multiplier=triggered?rules.mutation.skillBudgetMultiplier:1;
      const available=Math.floor(baseBudget*multiplier);
return {profile,baseBudget,triggered,multiplier,available};}
export function sampleGrades(s,seed,index){
 const growthGrades={};for(const id of IDS){const rows=s.attributes.grades.filter(g=>g.attribute===id),rng=createRng(JSON.stringify([seed,index,'attributes-grades-v1',id]));let roll=rng()*rows.reduce((n,g)=>n+g.weight,0);growthGrades[id]=rows.at(-1).grade;for(const g of rows){roll-=g.weight;if(roll<0){growthGrades[id]=g.grade;break;}}}
return growthGrades;}
