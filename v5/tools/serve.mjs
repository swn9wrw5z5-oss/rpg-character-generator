import http from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWeb, projectRoot } from './build-web.mjs';
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
export function startServer({root,port=4173,host='127.0.0.1',qa=false,reportPath=join(projectRoot,'outputs/browser-tests.json')}={}){
  root=resolve(root);
  const server=http.createServer(async(req,res)=>{
    try{
      const path=decodeURIComponent(new URL(req.url,'http://local').pathname);
      if(qa && req.method==='POST' && path==='/__qa/report'){
        let body='';for await(const chunk of req){body+=chunk;if(body.length>200000)throw new Error('Report too large');}
        const report=JSON.parse(body);await mkdir(resolve(reportPath,'..'),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');res.writeHead(200,{'Content-Type':'application/json'});res.end('{"saved":true}');return;
      }
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      const publicRoots=['web','src','data','config'];
      const relative=path.replace(/^\//,'');
      if(path.includes('\\') || path.includes('\0') || (!['','index.html'].includes(relative) && !publicRoots.some(p=>relative.startsWith(p+'/')) && !(qa&&relative.startsWith('__qa/')))) {res.writeHead(404);res.end('Not found');return;}
      const file=resolve(root,relative || 'index.html');
      if(!file.startsWith(root+sep)){res.writeHead(404);res.end('Not found');return;}
      if(!(await stat(file)).isFile())throw new Error('Not found');
      res.writeHead(200,{'Content-Type':types[extname(file)] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:await readFile(file));
    }catch{res.writeHead(404);res.end('Not found');}
  });
  return new Promise((resolvePromise,reject)=>{server.once('error',reject);server.listen(port,host,()=>resolvePromise(server));});
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);let host='127.0.0.1',port=4173,qa=false;
    for(let i=0;i<args.length;i++){
      if(args[i]==='--host'){host=args[++i];if(!['127.0.0.1','0.0.0.0'].includes(host))throw new Error('Host must be 127.0.0.1 or 0.0.0.0');}
      else if(args[i]==='--port'){port=Number(args[++i]);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port');}
      else if(args[i]==='--qa')qa=true;
      else throw new Error('Unknown option: '+args[i]);
    }
    const root=await buildWeb({qa});await startServer({root,port,host,qa});
    console.log(`Local: http://127.0.0.1:${port}/\n${qa?'Browser QA: http://127.0.0.1:'+port+'/__qa/runner.html\n':''}Press Ctrl+C to stop.`);
  }catch(error){console.error(error.message);process.exitCode=1;}
}
