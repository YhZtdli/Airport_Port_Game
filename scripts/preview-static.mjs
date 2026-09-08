import http from'node:http';
import{readFile,stat}from'node:fs/promises';
import path from'node:path';
import{fileURLToPath}from'node:url';
const directory=fileURLToPath(new URL('../dist/',import.meta.url));
const port=Number(process.env.PORT||8790),prefix='/orbis/';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.gz':'application/gzip','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end('Static files only');}
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.writeHead(302,{Location:prefix});return res.end();}
  if(!url.pathname.startsWith(prefix)){res.writeHead(404);return res.end('Not found');}
  const relative=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html',target=path.resolve(directory,relative);
  if(!target.startsWith(path.resolve(directory)+path.sep)){res.writeHead(403);return res.end();}
  if(!(await stat(target)).isFile()){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache','X-Orbis-Preview':'static-only','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?undefined:await readFile(target));
 }catch(e){res.writeHead(e.code==='ENOENT'?404:400);res.end(e.message);}
});
server.listen(port,'127.0.0.1',()=>console.log('Static-only preview: http://127.0.0.1:'+port+prefix));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
process.on('SIGINT',()=>server.close());
