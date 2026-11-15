import { cp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
export const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function buildWeb({output=join(projectRoot,'dist'),qa=false}={}){
  output=resolve(output);
  await mkdir(output,{recursive:true});
  // Only public application inputs are copied; no Excel, .git, evidence or Node tooling.
  for(const name of ['index.html','web','src','data','config'])await cp(join(projectRoot,name),join(output,name),{recursive:true});
  await writeFile(join(output,'.nojekyll'),'');
  const qaPath=resolve(output,'__qa');
  if(dirname(qaPath)!==output)throw new Error('Invalid QA directory');
  if(qa)await cp(join(projectRoot,'qa/browser'),qaPath,{recursive:true});
  else await rm(qaPath,{recursive:true,force:true});
  return output;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`Built ${await buildWeb()}`);
