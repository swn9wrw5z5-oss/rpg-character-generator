import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {buildSite,publicFiles} from './release.mjs';
const root=await buildSite(),prefix='/rpg-character-generator/',files=new Set(publicFiles),types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://preview');if(!url.pathname.startsWith(prefix)||req.method!=='GET')throw new Error();let path=decodeURIComponent(url.pathname.slice(prefix.length));if(!path)path='index.html';if(['v5/','v5-legacy/'].includes(path))path+='index.html';if(!files.has(path))throw new Error();res.writeHead(200,{'Content-Type':types[extname(path)]??'text/plain','Cache-Control':'no-store'});res.end(await readFile(join(root,path)));}catch{res.writeHead(404);res.end('Not found');}});
server.listen(4183,'127.0.0.1',()=>console.log('http://127.0.0.1:4183/rpg-character-generator/v5/?seed=batch-review'));
