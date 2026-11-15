import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGenerator } from '../src/core.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const allowed=new Set(['--seed','--species','--params','--data','--output','--index']);
const opts={};
try {
  for(let i=0;i<args.length;i+=2) {
    if(!allowed.has(args[i]) || args[i+1]===undefined || args[i+1].startsWith('--')) throw new Error(`Unknown or missing option: ${args[i]}`);
    opts[args[i]]=args[i+1];
  }
  if(!opts['--seed']) throw new Error('Usage: node tools/generate.mjs --seed demo [--species S003] [--params config/test-parameters.json] [--index 0] [--output outputs/demo.json]');
  const data=JSON.parse(await readFile(resolve(opts['--data'] || root+'/data/v5.json'),'utf8'));
  const p=JSON.parse(await readFile(resolve(opts['--params'] || root+'/config/test-parameters.json'),'utf8'));
  const generator=createGenerator(data,p,opts['--seed']);
  const result=generator.generateAt(Number(opts['--index'] || 0),{speciesId:opts['--species'] ?? null});
  const text=JSON.stringify(result,null,2)+'\n';
  if(opts['--output']) {
    const path=resolve(opts['--output']);
    if(extname(path).toLowerCase()!=='.json') throw new Error('Output must be .json; Excel and existing program files cannot be outputs');
    const inputs=[resolve(opts['--data'] || root+'/data/v5.json'),resolve(opts['--params'] || root+'/config/test-parameters.json')];
    if(inputs.some(input=>input.toLowerCase()===path.toLowerCase())) throw new Error('Output cannot overwrite input data or test parameters');
    await mkdir(dirname(path),{recursive:true});await writeFile(path,text,'utf8');console.log(`${result.ok ? 'Generated' : 'Generation failed'}: ${path}`);
  }
  else console.log(text);
  if(!result.ok) process.exitCode=2;
} catch(error) {console.error(error.message);process.exitCode=1;}
