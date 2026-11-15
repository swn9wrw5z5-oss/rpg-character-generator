import { readFile, readdir, lstat, mkdir, rm, copyFile } from 'node:fs/promises';
import { resolve, join, dirname, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { schemas } from '../v5/src/schema.mjs';
import { assertValidData } from '../v5/src/validate.mjs';
import { validateTestParameters } from '../v5/src/core.mjs';

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
  if(manifest.version!==1||publicFiles.length!==13||new Set(publicFiles).size!==13)refuse('invalid public manifest');
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
    const url=new URL(reference,'https://release.test'+prefix+(markup?'v5/index.html':file));
    if(url.origin!=='https://release.test'||!url.pathname.startsWith(prefix)||!publicFiles.includes(decodeURIComponent(url.pathname.slice(prefix.length))))refuse('unapproved or missing resource: '+file);
  }
  for(const record of manifest.files){
    const path=join(directory,record.path),info=await lstat(path);
    if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)refuse('invalid file: '+record.path);
    const bytes=await readFile(path),text=bytes.toString('utf8');
    if(unsafe.some(pattern=>pattern.test(text)))refuse('credential pattern or local path: '+record.path);
    if(recordHash(bytes,record)!==record.sha256)refuse('unreviewed content: '+record.path);
    if(record.path.endsWith('.html')||record.path==='v5/web/app.mjs')for(const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g))resource(match[1],record.path,record.path.endsWith('.mjs'));
    if(record.path.endsWith('.mjs')){
      for(const match of text.matchAll(/\bfrom\s*["']([^"']+)["']/g))resource(match[1],record.path);
      for(const match of text.matchAll(/new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g))resource(match[1],record.path);
    }
    if(record.path.endsWith('.css'))for(const match of text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g))resource(match[1],record.path);
    output.push({path:record.path,bytes:bytes.length,sha256:sha(bytes)});
  }
  const data=JSON.parse(await readFile(join(directory,'v5/data/v5.json'),'utf8'));
  const top=['schemaVersion','formulaContract','source','validation',...Object.keys(schemas)].sort();
  if(!isDeepStrictEqual(Object.keys(data).sort(),top)||!isDeepStrictEqual(Object.keys(data.source),['sha256']))refuse('unexpected JSON metadata');
  for(const [table,[,mapping]] of Object.entries(schemas)){
    const keys=mapping.split(' ').map(item=>item.split('=')[0].split(':')[0]).sort();
    for(const row of data[table])if(!isDeepStrictEqual(Object.keys(row).sort(),keys))refuse('raw or unknown data field: '+table);
  }
  const validation=assertValidData(data);
  if(!isDeepStrictEqual(data.validation,validation))refuse('warnings do not match core validation');
  const parameters=JSON.parse(await readFile(join(directory,'v5/config/test-parameters.json'),'utf8'));
  validateTestParameters(data,parameters);
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
