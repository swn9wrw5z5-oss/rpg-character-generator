import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGenerator, scoreCharacter, rarityForScore, playerView, createRng, validateTestParameters } from '../src/core.mjs';
import { validateData } from '../src/validate.mjs';
import { importWorkbook } from '../tools/import-workbook.mjs';

const data=JSON.parse(await readFile(new URL('../data/v5.json',import.meta.url),'utf8'));
const config=JSON.parse(await readFile(new URL('../config/test-parameters.json',import.meta.url),'utf8'));
const fixture=JSON.parse((await readFile(new URL('../evidence/workbook-inspection.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const clone=structuredClone;
const sample=()=>({speciesId:'S003',width:10,height:8,budget:400,stats:{HP:100,MP:30,HP_REGEN:0.5,MP_REGEN:0.2},growth:{HP:'S',MP:'S',HP_REGEN:'C',MP_REGEN:'C'},skills:['K001','K002','K003','K004','K005'],talents:[]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const cell=(raw,sheet,ref)=>raw.sheets.find(s=>s.name===sheet).rows.flatMap(r=>r.cells).find(c=>c.cell===ref);

test('V5 reference character: four subtotals, total, budget, cultivation, rarity',()=>{
  const c=scoreCharacter(data,sample());
  assert.deepEqual(c.subtotals,{backpack:100,base:31.25,affixes:150,hidden:50});
  assert.equal(c.total,331.25); assert.equal(c.remainingBudget,68.75); assert.equal(c.rarity.id,'RAR_L');
  assert.equal(c.cultivated.HP.value,167.5); assert.equal(c.cultivated.MP.value,63.75);
  near(c.cultivated.HP_REGEN.value,1.85); near(c.cultivated.MP_REGEN.value,0.74);
  near(c.ledger.reduce((sum,l)=>sum+l.points,0),c.total);
});
test('skill costs reduce remaining budget once and remain in total value',()=>{
  const a=sample(),b=sample();b.skills.pop();
  const x=scoreCharacter(data,a),y=scoreCharacter(data,b);
  assert.equal(x.total-y.total,30);assert.equal(y.remainingBudget-x.remainingBudget,30);
});
test('free backpack cells are floored at zero and no operating-area score exists',()=>{
  const s=sample();s.speciesId='S001';s.width=6;s.height=5;
  const c=scoreCharacter(data,s);assert.equal(c.subtotals.backpack,0);assert.ok(!('operatingArea' in c));
});
test('growth independent of initial stats, coupled cultivation multiplier follows V5',()=>{
  const a=sample(),b=sample(); b.stats.HP=5;
  assert.deepEqual(scoreCharacter(data,a).potential,scoreCharacter(data,b).potential);
  b.growth.MP='D';const c=scoreCharacter(data,b);assert.equal(c.subtotals.hidden,30);assert.equal(c.cultivated.HP.multiplier,1.3);
});
test('level one does not grow values',()=>{const s=sample();s.level=1;assert.equal(scoreCharacter(data,s).cultivated.HP.value,100);});
for(const [score,id] of [[0,'RAR_C'],[119,'RAR_C'],[119.999,'RAR_C'],[120,'RAR_R'],[199.999,'RAR_R'],[200,'RAR_E'],[299.999,'RAR_E'],[300,'RAR_L'],[399.999,'RAR_L'],[400,'RAR_M'],[999999,'RAR_M']]) test(`rarity floor boundary ${score}`,()=>assert.equal(rarityForScore(data,score).id,id));
for(const score of [-0.1,1e6,NaN,Infinity]) test(`reject invalid/uncovered rarity score ${score}`,()=>assert.throws(()=>rarityForScore(data,score)));
test('rarity duplicate matches fail rather than selecting first interval',()=>{const d=clone(data);d.rarities[1].min=100;assert.throws(()=>rarityForScore(d,110),/RARITY_NOT_UNIQUE/);});

test('real V5 keeps known 4 talent and 6 visual issues without rewriting',()=>{
  const v=validateData(data);assert.deepEqual(v.errors,[]);
  assert.equal(v.warnings.filter(w=>w.code==='MISSING_TALENT_SKILL').length,4);
  assert.equal(v.warnings.filter(w=>['VISUAL_MISMATCH','MISSING_VISUAL_RULE','BODY_MAPPING_REVIEW'].includes(w.code)).length,6);
  assert.equal(v.warnings.length,14);
  assert.equal(data.talents.find(t=>t.id==='TAL_TOUGH').skillId,'SKILL_TOUGH');
});
const invalids=[
  ['duplicate primary key',d=>d.species.push(clone(d.species[0])),'DUPLICATE_ID'],
  ['missing primary key',d=>d.skills[0].id=null,'MISSING_ID'],
  ['negative weight',d=>d.species[0].weight=-1,'INVALID_WEIGHT'],
  ['NaN weight',d=>d.species[0].weight=NaN,'INVALID_WEIGHT'],
  ['infinite weight',d=>d.personalities[0].weight=Infinity,'INVALID_WEIGHT'],
  ['zero active pool',d=>d.species.forEach(s=>s.weight=0),'EMPTY_WEIGHT_POOL'],
  ['disabled species pool',d=>d.species.forEach(s=>s.enabled=false),'EMPTY_WEIGHT_POOL'],
  ['fractional size',d=>d.species[0].minWidth=1.5,'INVALID_SIZE'],
  ['reversed size',d=>d.species[0].minWidth=11,'INVALID_SIZE'],
  ['global size limit',d=>d.species[0].maxHeight=9,'INVALID_SIZE'],
  ['missing family',d=>d.species[0].familyId='MISSING','MISSING_REFERENCE'],
  ['missing skeleton',d=>d.species[0].skeletonId='MISSING','MISSING_REFERENCE'],
  ['missing body',d=>d.species[0].bodyId='MISSING','MISSING_REFERENCE'],
  ['missing parameter',d=>d.parameters.shift(),'INVALID_PARAMETER'],
  ['zero per point',d=>d.abilities[0].perPoint=0,'INVALID_ABILITY_RANGE'],
  ['negative cost',d=>d.skills[0].cost=-30,'INVALID_COST'],
  ['overlapping rarity',d=>d.rarities[1].min=119,'RARITY_OVERLAP'],
  ['rarity gap',d=>d.rarities[1].min=121,'RARITY_GAP'],
  ['rarity starts above zero',d=>d.rarities[0].min=1,'RARITY_GAP'],
  ['fractional rarity',d=>d.rarities[0].max=119.5,'INVALID_RARITY_RANGE'],
  ['extra ability',d=>d.abilities.push({...clone(d.abilities[0]),id:'ATK'}),'ABILITY_SET'],
  ['bad schema',d=>d.schemaVersion=99,'UNSUPPORTED_SCHEMA'],
  ['missing provenance',d=>delete d.source,'INVALID_PROVENANCE'],
];
for(const [name,mutate,code] of invalids) test(`data validation rejects ${name}`,()=>{
  const d=clone(data); mutate(d);assert.ok(validateData(d).errors.some(e=>e.code===code));assert.throws(()=>createGenerator(d,config,'seed'),/INVALID_DATA/);
});
for(const [name,mutate] of [
  ['out of range HP',s=>s.stats.HP=101],['extra ATK',s=>s.stats.ATK=10],['bad grade',s=>s.growth.HP='X'],
  ['fractional size',s=>s.width=7.5],['invalid species',s=>s.speciesId='INVALID'],['disabled skill',s=>s.skills=['K010']],
  ['duplicate skill',s=>s.skills=['K001','K001']],['undefined talent',s=>{s.talents=['TAL_TOUGH'];s.allowDraftTalents=true;}],
  ['draft unacknowledged',s=>{s.skills=['K002'];s.talents=['TAL_TRANSFORM'];}],['skill talent double billing',s=>{s.talents=['TAL_TRANSFORM'];s.allowDraftTalents=true;}],
]) test(`scoring rejects ${name}`,()=>{const s=sample();mutate(s);assert.throws(()=>scoreCharacter(data,s));});
test('talent-only acquisition valued once, uses talent cost, never counts twice',()=>{
  const s=sample();s.skills=['K002'];s.talents=['TAL_TRANSFORM'];s.allowDraftTalents=true;
  const c=scoreCharacter(data,s);assert.equal(c.subtotals.affixes,60);assert.equal(c.acquisitions.length,2);
});

test('same seed/config/data and mixed requests reproduce entire sequence',()=>{
  const a=createGenerator(data,config,'重現測試'),b=createGenerator(data,config,'重現測試');
  for(let i=0;i<30;i++) {const opts=i%2 ? {speciesId:'S003'} : {};assert.deepEqual(a.next(opts),b.next(opts));}
});
test('direct indexed replay does not depend on earlier species requests',()=>{
  const a=createGenerator(data,config,'indexed'); a.next({speciesId:'S006'});a.next();
  const result=a.next({speciesId:'S003'});
  assert.deepEqual(result,createGenerator(data,config,'indexed').generateAt(2,{speciesId:'S003'}));
});
test('different seeds change generated candidates',()=>assert.notDeepEqual(createGenerator(data,config,'one').next().character,createGenerator(data,config,'two').next().character));
test('different species requests at same seed and index have distinct IDs',()=>{
  const g=createGenerator(data,config,'identity');assert.notEqual(g.generateAt(0,{speciesId:'S001'}).character.id,g.generateAt(0,{speciesId:'S003'}).character.id);
});
test('specified species never changes, including zero random weight',()=>{
  const d=clone(data);d.species.find(s=>s.id==='S003').weight=0;
  const g=createGenerator(d,config,'specified');for(let i=0;i<20;i++) assert.equal(g.next({speciesId:'S003'}).selectedSpeciesId,'S003');
});
test('weighted species selects only positive-weight enabled entries',()=>{
  const d=clone(data);d.species.forEach(s=>s.weight=s.id==='S001'?1:0);
  const g=createGenerator(d,config,'weights');for(let i=0;i<30;i++) assert.equal(g.next().selectedSpeciesId,'S001');
});
test('independent growth weights can force four different grades',()=>{
  const p=clone(config);for(const [id,grade] of Object.entries({HP:'S',MP:'A',HP_REGEN:'B',MP_REGEN:'D'})) for(const g of Object.keys(p.growthWeights[id])) p.growthWeights[id][g]=g===grade?1:0;
  assert.deepEqual(createGenerator(data,p,'grades').next().character.growth,{HP:'S',MP:'A',HP_REGEN:'B',MP_REGEN:'D'});
});
test('draft talent generation excludes unresolved skill references and never binds example targets',()=>{
  const p=clone(config);p.allowDraftTalents=true;p.talentChance=1;p.talentCount={min:2,max:2};p.skillCount={min:1,max:1};
  const g=createGenerator(data,p,'talents');
  for(let i=0;i<20;i++) {
    const r=g.next();assert.equal(r.ok,true);
    assert.deepEqual(r.character.talents.map(t=>t.id).sort(),['TAL_CONTRACT','TAL_TRANSFORM']);
    for(const t of r.character.talents) {assert.equal(t.binding.targetId,null);assert.equal(t.binding.ownerCharacterId,r.character.id);assert.equal(t.effectImplemented,false);assert.ok(!r.character.skills.some(s=>s.id===t.skillId));}
    assert.equal(r.calculation.subtotals.affixes,90);
  }
});
test('zero budget returns failure, one attempt, candidate and complete accounting without reroll',()=>{
  const p=clone(config);p.budget=0;const r=createGenerator(data,p,'budget').next({speciesId:'S003'});
  assert.equal(r.ok,false);assert.equal(r.attempts,1);assert.equal(r.selectedSpeciesId,'S003');assert.equal(r.character,null);assert.equal(r.errors[0].code,'BUDGET_EXCEEDED');assert.ok(r.calculation.total>0);assert.ok(r.candidate);
});
test('exhausted skill pool fails explicitly instead of reducing requested count',()=>{
  const p=clone(config);p.skillCount={min:100,max:100};const r=createGenerator(data,p,'pool').next();assert.equal(r.ok,false);assert.equal(r.errors[0].code,'INSUFFICIENT_POOL');
});
test('invalid requested species returns explicit generation error',()=>assert.equal(createGenerator(data,config,'bad').next({speciesId:'UNKNOWN'}).errors[0].code,'MISSING_REFERENCE'));
test('known art conflicts yield text placeholders without invented alternatives',()=>{
  for(const id of ['S006','S014','S015']) {const r=createGenerator(data,config,'visual').next({speciesId:id});assert.equal(r.ok,true);assert.equal(r.character.appearance.ruleId,null);assert.equal(r.character.appearance.imagePath,null);assert.ok(r.warnings.some(w=>w.code==='APPEARANCE_PLACEHOLDER'));}
});
test('valid art rule selects enabled category and family options while leaving images absent',()=>{
  const r=createGenerator(data,config,'visual').next({speciesId:'S003'});assert.equal(r.character.appearance.ruleId,'VIS_003');assert.ok(data.options.some(o=>o.id===r.character.appearance.hairColorId && o.category==='髮色'));assert.equal(r.character.appearance.imagePath,null);
});
test('player projection retains grades and strips hidden totals, costs, seed and integer score',()=>{
  const view=playerView(createGenerator(data,config,'player').next());const text=JSON.stringify(view);
  for(const key of ['total','hidden','budget','integerScore','points','potential','replay','testParameters']) assert.ok(!text.includes(`"${key}"`));
  assert.ok(view.growth.HP);assert.equal(playerView({ok:false}),null);
});
test('generator owns snapshot; input/output mutations do not affect subsequent replay',()=>{
  const d=clone(data),p=clone(config),g=createGenerator(d,p,'snapshot'),expected=g.generateAt(3);
  d.species[0].minWidth=999;p.budget=0;const r=g.next();r.replay.testParameters.budget=0;
  r.warnings[1].message='mutated';
  assert.deepEqual(g.generateAt(3),expected);
});
test('old rarity weights do not change sampling or total',()=>{
  const d=clone(data);for(const r of d.rarities) r.raw['舊抽取權重（停用）'].value='999999';
  const a=createGenerator(data,config,'old').next(),b=createGenerator(d,config,'old').next();assert.deepEqual(a.calculation,b.calculation);assert.deepEqual(a.character.stats,b.character.stats);
});
for(const [name,mutate] of [
  ['zero step',p=>p.abilitySteps.HP=0],['unaligned step',p=>p.abilitySteps.HP=7],['zero growth pool',p=>{for(const k of Object.keys(p.growthWeights.HP))p.growthWeights.HP[k]=0;}],
  ['negative growth weight',p=>p.growthWeights.HP.S=-1],['zero skill unconfirmed',p=>p.skillCount.min=0],['negative budget',p=>p.budget=-1],['invalid chance',p=>p.talentChance=2],
  ['draft not acknowledged',p=>p.talentChance=1],['unsupported retry',p=>p.failurePolicy='retry-until-success'],
  ['unknown override',p=>p.attack=100],
]) test(`test policy rejects ${name}`,()=>{const p=clone(config);mutate(p);assert.throws(()=>validateTestParameters(data,p));});
test('seed required and PRNG always yields [0,1)',()=>{
  assert.throws(()=>createGenerator(data,config,''));const a=createRng('test'),b=createRng('test');for(let i=0;i<1000;i++){const x=a();assert.equal(x,b());assert.ok(x>=0&&x<1);}
});

test('import preserves original IDs and notes, omits V4 archive from active config',()=>{
  const d=importWorkbook(clone(fixture));assert.equal(d.species.length,15);assert.equal(d.abilities.length,4);assert.equal(d.skills.length,36);assert.equal(d.talents[2].skillId,'SKILL_TOUGH');assert.ok(!d.referenceSheets.some(s=>s.name==='V4原值與註解'));assert.equal(d.species[0].source.row,2);
});
test('import recomputes formula cost from referenced Excel parameter, ignores stale cache',()=>{
  const raw=clone(fixture);cell(raw,'計分參數','B11').value='47';cell(raw,'技能效果索引','L2').value='-999';
  const d=importWorkbook(raw);assert.equal(d.skills[0].cost,47);assert.equal(d.talents[0].cost,47);
});
test('import handles new ID rows instead of relying on old range endpoint',()=>{
  const raw=clone(fixture),s=raw.sheets.find(s=>s.name==='種族設定'),row=clone(s.rows.at(-1));row.row=17;
  for(const c of row.cells)c.cell=c.cell.replace(/\d+$/,'17');row.cells.find(c=>c.cell==='A17').value='S016';s.rows.push(row);
  assert.equal(importWorkbook(raw).species.at(-1).id,'S016');
});
for(const [name,mutate,pattern] of [
  ['missing table',r=>r.sheets=r.sheets.filter(s=>s.name!=='成長潛力'),/MISSING_SHEET/],
  ['missing column',r=>cell(r,'種族設定','K1').value='RENAMED',/MISSING_COLUMN/],
  ['unsupported active formula',r=>{cell(r,'技能效果索引','L2').formula='SUM(A1:A2)';},/UNSUPPORTED_FORMULA/],
  ['changed scoring contract',r=>{cell(r,'角色計算','B15').formula='SUM(B7,B12:B14)-30';},/FORMULA_CONTRACT_CHANGED/],
  ['invalid numeric input',r=>{cell(r,'種族設定','K2').type='inlineStr';cell(r,'種族設定','K2').value='ten';},/INVALID_NUMBER/],
  ['invalid enable flag',r=>cell(r,'種族設定','L2').value='2',/INVALID_FLAG/],
  ['Excel source error',r=>{cell(r,'種族設定','K2').type='e';cell(r,'種族設定','K2').value='#VALUE!';},/EXCEL_ERROR/],
  ['formula cycle',r=>{cell(r,'計分參數','B11').formula='計分參數!$B$11';cell(r,'計分參數','B11').formulaXml='<f/>';},/FORMULA_CYCLE/],
]) test(`import rejects ${name}`,()=>{const r=clone(fixture);mutate(r);assert.throws(()=>importWorkbook(r),pattern);});

test('all species and 150 deterministic trials respect boundaries and accounting',()=>{
  const g=createGenerator(data,config,'invariants');
  for(let i=0;i<150;i++) {
    const s=data.species[i%data.species.length],r=g.next({speciesId:s.id});assert.equal(r.ok,true);
    const c=r.character;assert.ok(c.backpack.width>=s.minWidth&&c.backpack.width<=s.maxWidth);assert.ok(c.backpack.height>=s.minHeight&&c.backpack.height<=s.maxHeight);
    for(const a of data.abilities) {assert.ok(c.stats[a.id]>=a.min&&c.stats[a.id]<=a.max);assert.ok(data.growth.some(g=>g.id===c.growth[a.id]));}
    assert.equal(new Set(c.skills.map(s=>s.id)).size,c.skills.length);assert.equal(r.calculation.rarity.id,rarityForScore(data,r.calculation.total).id);
    near(r.calculation.ledger.reduce((n,l)=>n+l.points,0),r.calculation.total);near(r.calculation.remainingBudget+r.calculation.total,config.budget);
    assert.equal(c.talents.length,0);assert.ok(c.skills.every(s=>s.effectImplemented===false));
  }
});
