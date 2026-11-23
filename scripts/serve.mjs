import http from 'node:http';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const review=process.argv.includes('--review');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),review?'../.review-dist':'../dist');
const types={'.html':'text/html; charset=utf-8','.json':'application/json','.mp4':'video/mp4','.png':'image/png','.ttf':'font/ttf','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p==='/islam'){res.writeHead(301,{Location:'/islam/'});res.end();return;}if(p.startsWith('/islam/'))p=p.slice(6);if(p.endsWith('/'))p+='index.html';
 const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep))throw Error('path');const info=await stat(file);if(!info.isFile())throw Error('file');
 let start=0,end=info.size-1,status=200;const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};
 if(req.headers.range){const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!m||!m[1]&&!m[2]){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}if(!m[1])start=Math.max(0,info.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;}
 headers['Content-Length']=end-start+1;res.writeHead(status,headers);if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
 }catch{res.writeHead(404);res.end('File not found');}});
server.listen(Number(process.env.PORT||(review?4174:4173)),review?'127.0.0.1':'0.0.0.0',()=>console.log('Development server ready'));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>process.exit(0)));
