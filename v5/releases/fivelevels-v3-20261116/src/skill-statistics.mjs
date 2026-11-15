import { createGenerator } from './skill-core.mjs';
export function simulateCharacters(data,parameters,rules,{seed,count=100,speciesId=null,startIndex=0}={}){
  if(!Number.isSafeInteger(count)||count<1||count>100000||!Number.isSafeInteger(startIndex)||startIndex<0)throw new Error('INVALID_SIMULATION_RANGE');
  const generator=createGenerator(data,parameters,rules,seed);
  const rarityCounts=Object.fromEntries(rules.rarityProfiles.map(p=>[p.rarityId,0])),skillCounts=Object.fromEntries(Array.from({length:6},(_,n)=>[n,0])),levelCounts={},mutationCounts={triggered:0,normal:0},errors={};
  let succeeded=0,spent=0,available=0,totalSkillInstances=0,usageSum=0,bonus=0;
  const perMutation={triggered:{characters:0,spent:0,available:0},normal:{characters:0,spent:0,available:0}};
  for(let n=0;n<count;n++){
    const result=generator.generateAt(startIndex+n,{speciesId});
    if(!result.ok){for(const error of result.errors)errors[error.code]=(errors[error.code]||0)+1;continue;}
    const c=result.character;succeeded++;rarityCounts[c.birthRarity.id]++;skillCounts[c.skills.length]++;
    for(const skill of c.skills){levelCounts[skill.birthLevel]=(levelCounts[skill.birthLevel]||0)+1;totalSkillInstances++;}
    spent+=c.skillBudget.spent;available+=c.birthSkillBudget;usageSum+=c.skillBudget.usage;bonus+=c.mutation.bonusBudget;
    const key=c.mutation.triggered?'triggered':'normal';mutationCounts[key]++;perMutation[key].characters++;perMutation[key].spent+=c.skillBudget.spent;perMutation[key].available+=c.birthSkillBudget;
  }
  const proportions=(counts,denominator)=>Object.fromEntries(Object.entries(counts).map(([key,value])=>[key,{count:value,ratio:denominator?value/denominator:0}]));
  return {algorithm:'skill-statistics-v1',seed,count,startIndex,speciesId,succeeded,failed:count-succeeded,errors,
    birthRarities:proportions(rarityCounts,succeeded),acquiredSkillCounts:proportions(skillCounts,succeeded),birthSkillLevels:proportions(levelCounts,totalSkillInstances),skillInstanceCount:totalSkillInstances,meanSkills:succeeded?totalSkillInstances/succeeded:0,
    skillBudget:{spent,available,weightedUsage:available?spent/available:0,meanCharacterUsage:succeeded?usageSum/succeeded:0},
    mutation:{...proportions(mutationCounts,succeeded),totalBonusBudget:bonus,groups:perMutation},
    denominatorNotes:{rarity:'successful characters',skillCount:'successful characters',skillLevel:'acquired skill instances',mutation:'successful characters',weightedUsage:'total spent / total available'},
  };
}
