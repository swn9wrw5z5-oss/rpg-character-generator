import { readFile, readdir, lstat, mkdir, rm, copyFile } from 'node:fs/promises';
import { resolve, join, dirname, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { schemas } from '../v5/releases/fivelevels-v3-20261116/src/schema.mjs';
import { assertValidData } from '../v5/releases/fivelevels-v3-20261116/src/validate.mjs';
import { validateTestParameters } from '../v5/releases/fivelevels-v3-20261116/src/core.mjs';
import {assertSkillRules} from '../v5/releases/fivelevels-v3-20261116/src/skill-rules.mjs';
import {validateBundle as validateV6} from '../v6/src/core.mjs';

export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await readFile(join(root,'release/manifest.json'),'utf8'));
export const publicFiles=manifest.files.map(file=>file.path);
const unsafe=[
  /\b(?:github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b[A-Z]:[\\/]/i,
  /(?:file:\/\/|\/Users\/|\/home\/|\/workspace\/)/i,
];
function refuse(reason){throw new Error('RELEASE_REJECTED: '+reason);}
function sha(bytes){return createHash('sha256').update(bytes).digest('hex');}
function recordHash(bytes,record){return sha(record.lineEndings==='lf-normalized'?Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n')):bytes);}
function validManifest(){
  if(manifest.version!==2||manifest.attributesBase!=='attributes/'||manifest.v6Base!=='v6/'||new Set(publicFiles).size!==publicFiles.length||manifest.runtimeBase!=='v5/releases/fivelevels-v3-20261116/')refuse('invalid public manifest');
  for(const file of publicFiles)if(file.startsWith('/')||file.includes('\\')||file.split('/').includes('..'))refuse('unsafe manifest path');
}
export async function verifySite(directory,{exact=true}={}){
  validManifest();directory=resolve(directory);
  const dirs=new Set(['']);
  for(const path of publicFiles){let parent=posix.dirname(path);while(parent!=='.'){dirs.add(parent);parent=posix.dirname(parent);}}
  if(exact){
    const discovered=[];
    async function walk(path=''){
      const info=await lstat(join(directory,path));if(info.isSymbolicLink()||!info.isDirectory())refuse('directory link: '+path);
      for(const name of await readdir(join(directory,path))){
        const item=path?path+'/'+name:name,stat=await lstat(join(directory,item));
        if(stat.isSymbolicLink())refuse('symbolic link: '+item);
        if(stat.isDirectory()){if(!dirs.has(item))refuse('extra directory: '+item);await walk(item);}
        else if(stat.isFile()&&stat.nlink===1)discovered.push(item);
        else refuse('non-regular file or hard link: '+item);
      }
    }
    await walk();
    if(!isDeepStrictEqual(discovered.sort(),[...publicFiles].sort()))refuse('unexpected or missing public file');
  }
  const output=[];
  function resource(reference,file,markup=false){
    if(reference.startsWith('#'))return;
    if(!/^\.\.?\//.test(reference))refuse('non-relative resource: '+file);
    const prefix='/rpg-character-generator/';
    let context=markup?(file.startsWith('v5-legacy/')?'v5-legacy/index.html':manifest.runtimeBase+'index.html'):file;
    if(file==='v5/index.html'&&reference==='./releases/fivelevels-v3-20261116/')return;
    if(file==='v5/index.html')context=manifest.runtimeBase+'index.html';
    const url=new URL(reference,'https://release.test'+prefix+context);
    if(url.origin!=='https://release.test'||!url.pathname.startsWith(prefix)||!publicFiles.includes(decodeURIComponent(url.pathname.slice(prefix.length))))refuse('unapproved or missing resource: '+file);
  }
  for(const record of manifest.files){
    const path=join(directory,record.path),info=await lstat(path);
    if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)refuse('invalid file: '+record.path);
    const bytes=await readFile(path),text=bytes.toString('utf8');
    if(record.path.endsWith('.png')){if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')refuse('invalid PNG: '+record.path);}
    else if(unsafe.some(pattern=>pattern.test(text)))refuse('credential pattern or local path: '+record.path);
    if(recordHash(bytes,record)!==record.sha256)refuse('unreviewed content: '+record.path);
    if(record.path.endsWith('.html')||record.path.endsWith('/web/app.mjs'))for(const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g))resource(match[1],record.path,record.path.endsWith('.mjs'));
    if(!record.path.endsWith('.png')&&(record.path.startsWith(manifest.runtimeBase)||record.path.startsWith(manifest.attributesBase)||record.path.startsWith(manifest.v6Base))&&/localhost|127\.0\.0\.1|\/api\/|node:|require\(|\.xlsx/i.test(text))refuse('local/server dependency in public runtime: '+record.path);
    if(record.path.endsWith('.mjs')){
      for(const match of text.matchAll(/\bfrom\s*["']([^"']+)["']/g))resource(match[1],record.path);
      for(const match of text.matchAll(/new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g))resource(match[1],record.path);
    }
    if(record.path.endsWith('.css'))for(const match of text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g))resource(match[1],record.path);
    output.push({path:record.path,bytes:bytes.length,sha256:sha(bytes)});
  }
  const data=JSON.parse(await readFile(join(directory,manifest.runtimeBase+'data/fivelevels.json'),'utf8'));
  const top=['schemaVersion','formulaContract','source','validation',...Object.keys(schemas)].sort();
  if(!isDeepStrictEqual(Object.keys(data).sort(),top)||!isDeepStrictEqual(Object.keys(data.source),['sha256']))refuse('unexpected JSON metadata');
  for(const [table,[,mapping]] of Object.entries(schemas)){
    const keys=mapping.split(' ').map(item=>item.split('=')[0].split(':')[0]).sort();
    for(const row of data[table])if(!isDeepStrictEqual(Object.keys(row).sort(),keys))refuse('raw or unknown data field: '+table);
  }
  const validation=assertValidData(data);
  if(!isDeepStrictEqual(data.validation.warnings,validation.warnings))refuse('warnings do not match core validation');
  const parameters=JSON.parse(await readFile(join(directory,manifest.runtimeBase+'config/fivelevels-parameters.json'),'utf8'));
  validateTestParameters(data,parameters);
  const rules=JSON.parse(await readFile(join(directory,manifest.runtimeBase+'config/fivelevels-rules.json'),'utf8'));assertSkillRules(data,rules);
  if(rules.version!==3||rules.skills.length!==27||rules.levelTables.some(t=>t.levels.length!==5))refuse('not the reviewed five-level model');
  const v6=JSON.parse(await readFile(join(directory,manifest.v6Base+'config/bundle.json'),'utf8'));
  if(!isDeepStrictEqual(Object.keys(v6).sort(),['format','portraits','settings','tables']))refuse('unexpected V6 metadata');
  const v6Errors=validateV6(v6);if(v6Errors.length)refuse('invalid V6 settings: '+JSON.stringify(v6Errors));
  for(const portrait of [...Object.values(v6.portraits.species),...Object.keys(v6.portraits.mutationWeights)])if(!publicFiles.includes(manifest.v6Base+'assets/portraits/'+portrait+'.png'))refuse('missing V6 portrait');
  return {ok:true,files:output,warningCount:validation.warnings.length,sourceSha256:data.source.sha256};
}
export async function buildSite({output=join(root,'dist')}={}){
  output=resolve(output);
  if(output!==join(root,'dist')&&!output.startsWith(resolve(tmpdir())+sep))refuse('output must be generated dist or OS temporary test directory');
  try{if((await lstat(output)).isSymbolicLink())refuse('output is a link');}catch(error){if(error.code!=='ENOENT')throw error;}
  await verifySite(root,{exact:false});
  // Only this verified generated path can be recursively cleaned.
  await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
  for(const file of publicFiles){await mkdir(dirname(join(output,file)),{recursive:true});await copyFile(join(root,file),join(output,file));}
  await verifySite(output);
  return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv[2]==='build')console.log('Built '+await buildSite());
    else if(process.argv[2]==='verify')console.log(JSON.stringify(await verifySite(process.argv[3]||join(root,'dist')),null,2));
    else throw new Error('Usage: node tools/release.mjs build | verify [directory]');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
