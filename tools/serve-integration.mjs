import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIntegration } from './build-integration.mjs';

const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
export async function startIntegrationServer({root,host='127.0.0.1',port=4175,prefix='/'}={}){
  root=resolve(root);
  if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(prefix))throw new Error('Prefix must be a slash-delimited repository path');
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://local');
      const path=decodeURIComponent(url.pathname);
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      if(!path.startsWith(prefix)){res.writeHead(404);res.end('Not found');return;}
      let relative=path.slice(prefix.length);
      if(relative==='v5'){res.writeHead(308,{Location:prefix+'v5/'+url.search});res.end();return;}
      if(relative==='')relative='index.html';
      if(relative==='v5/')relative='v5/index.html';
      const allowed=relative==='index.html'||relative==='v5/index.html'||['web','src','data','config'].some(name=>relative.startsWith('v5/'+name+'/'));
      if(!allowed || relative.includes('\\') || relative.includes('\0')){res.writeHead(404);res.end('Not found');return;}
      const file=resolve(root,relative);
      if(!file.startsWith(root+sep) || !(await stat(file)).isFile()){res.writeHead(404);res.end('Not found');return;}
      const bytes=await readFile(file);
      res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:bytes);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  return new Promise((resolvePromise,reject)=>{server.once('error',reject);server.listen(port,host,()=>resolvePromise(server));});
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);let prefix='/',port=4175;
    for(let i=0;i<args.length;i++){
      if(args[i]==='--prefix')prefix=args[++i];
      else if(args[i]==='--port')port=Number(args[++i]);
      else throw new Error('Unknown option: '+args[i]);
    }
    if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port');
    const root=await buildIntegration();await startIntegrationServer({root,prefix,port});
    console.log(`Legacy: http://127.0.0.1:${port}${prefix}\nV5: http://127.0.0.1:${port}${prefix}v5/\nCtrl+C to stop.`);
  }catch(error){console.error(error.message);process.exitCode=1;}
}
