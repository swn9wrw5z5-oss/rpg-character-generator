import { ABILITIES, GRADES, parameter } from './schema.mjs';
import { assertValidData, optionPool } from './validate.mjs';

export const ALGORITHM = 'v5-core-1/fnv1a-utf16-mulberry32';
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => JSON.stringify(k)+':'+stableStringify(value[k])).join(',')}}`;
  return JSON.stringify(value);
}
export function fingerprint(value) {
  const text = typeof value === 'string' ? value : stableStringify(value);
  let h = 2166136261;
  for (let i=0; i<text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8,'0');
}
export function createRng(seed) {
  let state = parseInt(fingerprint(seed),16);
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function fail(code, detail) { throw new Error(`${code}: ${detail}`); }
function integer(n, name, min=0) { if (!Number.isSafeInteger(n) || n<min) fail('INVALID_INPUT',name); }
function finite(n, name, min=0) { if (!Number.isFinite(n) || n<min) fail('INVALID_INPUT',name); }
function lookup(data, table, id) {
  const r = data[table].find(r => r.id === id);
  if (!r) fail('MISSING_REFERENCE', `${table}.${id}`);
  return r;
}
function unique(ids, name) {
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) fail('DUPLICATE_OR_INVALID_SELECTION',name);
}
function weighted(pool, weight, rng) {
  const total = pool.reduce((n,r) => n+weight(r),0);
  if (!pool.length || !Number.isFinite(total) || total<=0) fail('EMPTY_WEIGHT_POOL','No eligible positive-weight candidates');
  let cursor = rng()*total;
  const positive = pool.filter(r => weight(r)>0);
  for (const r of positive) { cursor-=weight(r); if(cursor<0) return r; }
  return positive.at(-1); // Floating-point end boundary; never returns a zero-weight entry.
}
function randint(min,max,rng) { return min+Math.floor(rng()*(max-min+1)); }
function draw(pool,count,weight,rng) {
  const remaining = pool.filter(r=>weight(r)>0), result=[];
  if (count>remaining.length) fail('INSUFFICIENT_POOL',`Requested ${count}, eligible ${remaining.length}`);
  while(result.length<count) { const r=weighted(remaining,weight,rng); result.push(r); remaining.splice(remaining.indexOf(r),1); }
  return result;
}

export function rarityForScore(data, score) {
  finite(score,'score');
  const integerScore=Math.floor(score);
  const hits=data.rarities.filter(r=>r.enabled && integerScore>=r.min && integerScore<=r.max);
  if(hits.length!==1) fail('RARITY_NOT_UNIQUE',`score=${score}, matches=${hits.length}`);
  return {id:hits[0].id,name:hits[0].name,status:hits[0].status,integerScore};
}

function calculate(data, input) {
  if (!input || typeof input !== 'object') fail('INVALID_INPUT','character');
  const species=lookup(data,'species',input.speciesId);
  if(!species.enabled) fail('DISABLED_SPECIES',species.id);
  integer(input.width,'width',1); integer(input.height,'height',1); finite(input.budget,'budget');
  if(input.width<species.minWidth || input.width>species.maxWidth || input.height<species.minHeight || input.height>species.maxHeight || input.width>parameter(data,'頁面最大寬') || input.height>parameter(data,'頁面最大高')) fail('INVALID_SIZE',species.id);
  unique(input.skills,'skills'); unique(input.talents,'talents');
  if (!input.stats || Object.keys(input.stats).length!==4 || !input.growth || Object.keys(input.growth).length!==4) fail('INVALID_ABILITY_SET','Require exactly four stats and growth grades');
  const abilityLines=ABILITIES.map(id=>{
    const a=lookup(data,'abilities',id), value=input.stats[id];
    finite(value,id);
    if(value<a.min || value>a.max) fail('ABILITY_OUT_OF_RANGE',id);
    return {id,value,zero:a.zero,perPoint:a.perPoint,points:(value-a.zero)/a.perPoint,source:a.source};
  });
  const growthLines=ABILITIES.map(id=>{
    const g=lookup(data,'growth',input.growth[id]);
    return {abilityId:id,grade:g.id,points:g.cost,perLevel:g[id],status:g.status,source:g.source};
  });
  const normal=input.skills.map(id=>{
    const s=lookup(data,'skills',id);
    if(!s.enabled || s.status!=='確定') fail('SKILL_NOT_ELIGIBLE',id);
    return {id:s.id,skillId:s.id,kind:'skill',points:s.cost,source:s.source,status:s.costStatus};
  });
  const talents=input.talents.map(id=>{
    const t=lookup(data,'talents',id), s=lookup(data,'skills',t.skillId);
    if(!t.enabled || !s.enabled || s.status!=='確定' || !['草案','確定'].includes(t.status)) fail('TALENT_NOT_ELIGIBLE',id);
    // A caller must explicitly acknowledge draft talent estimates, including unresolved bindings.
    if(t.status==='草案' && input.allowDraftTalents!==true) fail('DRAFT_TALENT_DISABLED',id);
    return {id:t.id,skillId:t.skillId,kind:'talent',points:t.cost,source:t.source,status:t.status};
  });
  unique([...normal,...talents].map(s=>s.skillId),'exclusive skill/talent acquisition');
  const cells=input.width*input.height;
  const freeCells=parameter(data,'免費背包格數'), perCell=parameter(data,'每格背包成本'), multiplier=parameter(data,'背包計分倍率');
  const backpack=Math.max(0,cells-freeCells)*perCell*multiplier;
  const base=abilityLines.reduce((n,r)=>n+r.points,0), affixes=[...normal,...talents].reduce((n,r)=>n+r.points,0), hidden=growthLines.reduce((n,r)=>n+r.points,0);
  const total=backpack+base+affixes+hidden;
  finite(total,'total');
  const level=input.level ?? parameter(data,'培養目標等級'); integer(level,'level',1);
  const growthMultiplier=1+hidden*parameter(data,'隱藏每分成長增幅');
  const cultivated=Object.fromEntries(growthLines.map(g=>[g.abilityId,{
    initial:input.stats[g.abilityId],level,perLevel:g.perLevel,multiplier:growthMultiplier,
    value:input.stats[g.abilityId]+(level-1)*g.perLevel*growthMultiplier,
  }]));
  for (const [id,result] of Object.entries(cultivated)) finite(result.value,`cultivated.${id}`);
  const ledger=[{kind:'backpack',id:'backpack',points:backpack},...abilityLines.map(r=>({kind:'ability',id:r.id,points:r.points})),...normal,...talents,...growthLines.map(r=>({kind:'potential',id:r.abilityId,points:r.points}))];
  return {
    formulaContract:data.formulaContract,
    backpack:{width:input.width,height:input.height,cells,freeCells,perCell,multiplier,points:backpack},
    abilities:abilityLines,acquisitions:[...normal,...talents],potential:growthLines,
    subtotals:{backpack,base,affixes,hidden},total,budget:input.budget,remainingBudget:input.budget-total,
    affordable:input.budget>=total,rarity:rarityForScore(data,total),ledger,cultivated,
    formulas:{total:'backpack + base + affixes + hidden',budget:'budget - total (acquisition costs counted once)',rarity:'unique enabled closed interval containing floor(total)',cultivation:'initial + (level - 1) * gradeGrowth * (1 + totalHiddenCost * growthBoost)'},
  };
}
export function scoreCharacter(data,input) { assertValidData(data); return calculate(data,input); }

export function validateTestParameters(data,p) {
  if(!p || p.version!==1 || typeof p.status!=='string' || !p.status.includes('暫定')) fail('INVALID_TEST_PARAMETERS','Missing tentative status/version');
  const known=new Set(['status','version','budget','sizeDistribution','abilityDistribution','abilitySteps','growthWeights','personalityCount','skillCount','skillSelection','talentChance','talentCount','allowDraftTalents','talentSkillPolicy','failurePolicy','reservePolicy','appearancePolicy']);
  for (const key of Object.keys(p)) if(!known.has(key)) fail('UNKNOWN_TEST_PARAMETER',key);
  finite(p.budget,'budget');
  for(const [key,expected] of Object.entries({sizeDistribution:'independent-uniform-integers',abilityDistribution:'independent-uniform-grid',skillSelection:'uniform-without-replacement',talentSkillPolicy:'exclusive-acquisition',failurePolicy:'return-failure-no-retry',appearancePolicy:'text-only-safe-options'})) if(p[key]!==expected) fail('UNSUPPORTED_TEST_POLICY',key);
  if(!['total-budget-only','backpack-reserves'].includes(p.reservePolicy)) fail('UNSUPPORTED_TEST_POLICY','reservePolicy');
  if(![0,1].includes(p.personalityCount)) fail('INVALID_TEST_PARAMETERS','personalityCount must be 0 or 1');
  for(const field of ['skillCount','talentCount']) {
    if(!p[field]) fail('INVALID_TEST_PARAMETERS',field);
    integer(p[field].min,field+'.min'); integer(p[field].max,field+'.max');
    if(p[field].min>p[field].max) fail('INVALID_TEST_PARAMETERS',field+' min > max');
  }
  if(p.skillCount.min<1) fail('ZERO_SKILLS_UNCONFIRMED','V5 B18 requires a first skill; zero-skill policy is not enabled');
  if(typeof p.allowDraftTalents!=='boolean') fail('INVALID_TEST_PARAMETERS','allowDraftTalents');
  finite(p.talentChance,'talentChance'); if(p.talentChance>1) fail('INVALID_TEST_PARAMETERS','talentChance');
  if(p.talentChance>0 && !p.allowDraftTalents) fail('DRAFT_TALENT_DISABLED','Set allowDraftTalents=true to test draft talents');
  if(!p.abilitySteps || Object.keys(p.abilitySteps).length!==4 || !p.growthWeights || Object.keys(p.growthWeights).length!==4) fail('INVALID_TEST_PARAMETERS','Require four ability steps/weight maps');
  for(const id of ABILITIES) {
    const a=lookup(data,'abilities',id),step=p.abilitySteps[id];
    finite(step,`abilitySteps.${id}`); if(step<=0) fail('INVALID_TEST_PARAMETERS',`abilitySteps.${id}`);
    const intervals=(a.max-a.min)/step;
    if(!Number.isFinite(intervals) || Math.abs(intervals-Math.round(intervals))>1e-8 || intervals>1e9) fail('INVALID_TEST_PARAMETERS',`${id}: step must divide min/max span (<=1e9 intervals)`);
    const weights=p.growthWeights[id];
    if(!weights || Object.keys(weights).length!==5 || GRADES.some(g=>!Number.isFinite(weights[g]) || weights[g]<0) || !Number.isFinite(Object.values(weights).reduce((a,b)=>a+b,0)) || Object.values(weights).reduce((a,b)=>a+b,0)<=0) fail('INVALID_TEST_PARAMETERS',`growthWeights.${id}`);
  }
  return p;
}

function appearance(data,species) {
  const rules=data.visuals.filter(v=>v.enabled && v.speciesId===species.id && v.familyId===species.familyId && v.skeletonId===species.skeletonId);
  return {rules,base:{bodyId:species.bodyId,skeletonId:species.skeletonId,rendering:'text-placeholder',imagePath:null}};
}
export function createGenerator(sourceData,testParameters,seed) {
  if(!((typeof seed==='string' && seed.length>0) || (typeof seed==='number' && Number.isFinite(seed)))) fail('INVALID_SEED','Supply nonempty string or finite number');
  // Capture an immutable-by-ownership snapshot: later caller edits cannot change a running sequence.
  const data=structuredClone(sourceData), p=structuredClone(testParameters);
  const validation=assertValidData(data); validateTestParameters(data,p);
  const dataFingerprint=fingerprint(data), configFingerprint=fingerprint(p);
  let sequence=0;
  function generateAt(index,{speciesId=null}={}) {
    integer(index,'index');
    const rng=createRng(JSON.stringify([seed,index]));
    const replay={algorithm:ALGORITHM,seed,index,requestedSpeciesId:speciesId,sourceSha256:data.source.sha256,dataFingerprint,configFingerprint,testParameters:structuredClone(p)};
    const warnings=[{code:'TENTATIVE_SIMULATION',message:p.status},...structuredClone(validation.warnings)];
    let species;
    try {
      species=speciesId===null ? weighted(data.species.filter(s=>s.enabled),s=>s.weight,rng) : lookup(data,'species',speciesId);
      if(!species.enabled) fail('DISABLED_SPECIES',species.id);
      const width=randint(species.minWidth,species.maxWidth,rng),height=randint(species.minHeight,species.maxHeight,rng);
      const stats={},growth={};
      for(const id of ABILITIES) {
        const a=lookup(data,'abilities',id),step=p.abilitySteps[id];
        stats[id]=Number((a.min+randint(0,Math.round((a.max-a.min)/step),rng)*step).toPrecision(15));
        growth[id]=weighted(data.growth,g=>p.growthWeights[id][g.id],rng).id;
      }
      const personality=p.personalityCount ? weighted(data.personalities,r=>r.weight,rng) : null;
      const talentPool=data.talents.filter(t=>t.enabled && (t.status==='確定' || (p.allowDraftTalents && t.status==='草案')) && data.skills.some(s=>s.id===t.skillId && s.enabled && s.status==='確定'));
      const chosenTalents=rng()<p.talentChance ? draw(talentPool,randint(p.talentCount.min,p.talentCount.max,rng),t=>t.weight,rng) : [];
      const skillPool=data.skills.filter(s=>s.enabled && s.status==='確定' && !chosenTalents.some(t=>t.skillId===s.id));
      const chosenSkills=draw(skillPool,randint(p.skillCount.min,p.skillCount.max,rng),()=>1,rng);
      const input={speciesId:species.id,width,height,budget:p.budget,stats,growth,skills:chosenSkills.map(s=>s.id),talents:chosenTalents.map(t=>t.id),allowDraftTalents:p.allowDraftTalents};
      const calculation=calculate(data,input);
      const errors=[];
      if(!calculation.affordable) errors.push({code:'BUDGET_EXCEEDED',message:`Required ${calculation.total}, budget ${p.budget}`});
      if(p.reservePolicy==='backpack-reserves' && p.budget-calculation.subtotals.backpack-parameter(data,'天賦預留分') < parameter(data,'最低保留能力分')+parameter(data,'最低保留成長分')) errors.push({code:'BACKPACK_RESERVES_NOT_MET',message:'Backpack trial reserve check failed'});
      if(errors.length) return {ok:false,replay,selectedSpeciesId:species.id,attempts:1,errors,warnings,candidate:input,calculation,character:null};
      const visual=appearance(data,species);
      const appearanceResult={...visual.base,ruleId:null,hairColorId:null,skinColorId:null,eyesId:null};
      const body=lookup(data,'assets',species.bodyId);
      if(visual.rules.length===1 && body.familyId===species.familyId && body.skeletonId===species.skeletonId && body.speciesId===species.id) {
        const rule=visual.rules[0]; appearanceResult.ruleId=rule.id;
        for(const [field,out,category] of [['hairColor','hairColorId','髮色'],['skinColor','skinColorId','膚色'],['eyes','eyesId','眼睛']]) {
          const pool=optionPool(data,rule[field],category,species.familyId);
          if(pool.some(o=>o.weight>0)) appearanceResult[out]=weighted(pool,o=>o.weight,rng).id;
          else warnings.push({code:'APPEARANCE_OPTION_SKIPPED',message:`${rule.id}.${field}: no valid weighted pool`});
        }
      } else warnings.push({code:'APPEARANCE_PLACEHOLDER',message:`${species.id}: incompatible, missing, or ambiguous art mapping; no fallback invented`});
      const character={
        id:`CHAR_${fingerprint(JSON.stringify([seed,dataFingerprint,configFingerprint,speciesId]))}_${index.toString().padStart(6,'0')}`,
        speciesId:species.id,speciesName:species.name,speciesStatus:species.status,familyId:species.familyId,
        rarity:calculation.rarity,stats,growth,backpack:{width,height,cells:width*height},
        personality:personality ? {id:personality.id,name:personality.name,visible:personality.visible,effectImplemented:false} : null,
        skills:chosenSkills.map(s=>({id:s.id,name:s.name,status:s.status,effectImplemented:false,castCostStatus:s.costStatus})),
        talents:chosenTalents.map(t=>({id:t.id,name:t.name,skillId:t.skillId,status:t.status,binding:{ownerCharacterId:null,targetType:t.targetType,targetId:null,status:'未定；無有效目標資料，範例ID不作正式綁定'},effectImplemented:false})),
        appearance:appearanceResult,
      };
      for(const t of character.talents) t.binding.ownerCharacterId=character.id;
      return {ok:true,replay,selectedSpeciesId:species.id,attempts:1,errors:[],warnings,character,calculation};
    } catch(error) {
      return {ok:false,replay,selectedSpeciesId:species?.id ?? null,attempts:1,errors:[{code:error.message.split(':')[0],message:error.message}],warnings,character:null,calculation:null};
    }
  }
  return {next:(options)=>generateAt(sequence++,options),generateAt};
}

export function playerView(result) {
  if(!result?.ok) return null;
  const c=result.character;
  return structuredClone({id:c.id,speciesId:c.speciesId,speciesName:c.speciesName,speciesStatus:c.speciesStatus,familyId:c.familyId,rarity:{id:c.rarity.id,name:c.rarity.name,status:c.rarity.status},stats:c.stats,growth:c.growth,backpack:c.backpack,personality:c.personality?.visible ? c.personality : null,skills:c.skills,talents:c.talents,appearance:c.appearance});
}
