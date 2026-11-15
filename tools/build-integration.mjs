import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWeb } from '../v5/tools/build-web.mjs';

export const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function buildIntegration({output=join(repositoryRoot,'dist')}={}){
  output=resolve(output);
  if(output===repositoryRoot || output===join(repositoryRoot,'v5'))throw new Error('Build output cannot overwrite source directories');
  await mkdir(output,{recursive:true});
  // Preserve the old homepage byte-for-byte. V5 uses its own complete public bundle.
  await copyFile(join(repositoryRoot,'index.html'),join(output,'index.html'));
  await buildWeb({output:join(output,'v5'),qa:false});
  await writeFile(join(output,'.nojekyll'),'');
  return output;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`Built legacy / and V5 /v5/: ${await buildIntegration()}`);
