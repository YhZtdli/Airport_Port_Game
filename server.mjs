import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEnvironment,atomicJson} from './server/environment.mjs';
import {createSeaRouter,sampleRoute} from './public/js/geo.js';
import {validateSave,createState} from './public/js/engine.js';
const ephemeral=process.argv.includes('--ephemeral');
const root=path.dirname(fileURLToPath(import.meta.url)),publicRoot=path.join(root,'public');
const readJson=async file=>JSON.parse((await readFile(path.join(root,file),'utf8')).replace(/^\uFEFF/,''));
const world=await readJson('public/data/world.json'),sea=await readJson('public/data/sea-network.json');
const env=await createEnvironment(world),seaRoute=createSeaRouter(sea);
let saved=null,revision=0,points=[];
try{if(ephemeral)throw Error('ephemeral');const data=await readJson('data/save.json');saved=validateSave(data.state);revision=data.revision||0;}catch{}
const seed=saved||createState(await readJson('public/data/facilities.json'),seaRoute,env.get());
if(seed)points=seed.jobs.filter(j=>!['completed','cancelled'].includes(j.status)).flatMap(j=>sampleRoute(j.path,650)).slice(0,80);
const port=Number(process.env.PORT||8787),host=process.env.HOST||'127.0.0.1';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon'};
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>8*1024*1024)throw Error('请求超过 8 MB');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
function validPoints(p,max=150){return Array.isArray(p)&&p.length<=max&&p.every(x=>Array.isArray(x)&&x.length===2&&x.every(Number.isFinite)&&Math.abs(x[0])<=180&&Math.abs(x[1])<=90);}
let saveQueue=Promise.resolve();
const server=http.createServer(async(req,res)=>{
 try{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  const u=new URL(req.url,'http://'+req.headers.host);
  if(!['GET','HEAD'].includes(req.method)){
   const origin=req.headers.origin;
   if(origin&&origin!==('http://'+req.headers.host))return send(res,403,{error:'不接受跨站写入'});
   if(req.headers['x-orbis-client']!=='1')return send(res,403,{error:'缺少本机游戏客户端标识'});
  }
  if(u.pathname==='/api/health')return send(res,200,{ok:true,name:'ORBIS',version:'0.1.0',ephemeral});
  if(u.pathname==='/api/environment'&&req.method==='GET')return send(res,200,env.get());
  if(u.pathname==='/api/refresh'&&req.method==='POST'){
   const b=await body(req);if(b.points&&!validPoints(b.points))return send(res,400,{error:'采样坐标无效'});
   if(b.points)points=b.points;await env.refresh(points,true);return send(res,200,env.get());
  }
  if(u.pathname==='/api/sea-route'&&req.method==='POST'){
   const b=await body(req);if(!validPoints([b.origin,b.destination],2))return send(res,400,{error:'坐标无效'});
   return send(res,200,{path:seaRoute(b.origin,b.destination)});
  }
  if(u.pathname==='/api/save'&&req.method==='GET')return send(res,200,{revision,state:saved});
  if(u.pathname==='/api/save'&&req.method==='PUT'){
   const b=await body(req);validateSave(structuredClone(b.state));
   const work=saveQueue.then(async()=>{
    if(b.revision!==revision)return send(res,409,{error:'另一窗口更新了存档，请刷新以避免覆盖',revision});
    if(!ephemeral)await atomicJson('data/save.json',{revision:revision+1,state:b.state});saved=b.state;revision++;
    points=saved.jobs.filter(j=>!['completed','cancelled'].includes(j.status)).flatMap(j=>sampleRoute(j.path,700)).slice(0,100);
    send(res,200,{revision});
   });saveQueue=work.catch(()=>{});await work;return;
  }
  if(u.pathname.startsWith('/api/'))return send(res,404,{error:'接口不存在'});
  if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'方法不支持'});
  const relative=decodeURIComponent(u.pathname)==='/'?'index.html':decodeURIComponent(u.pathname).replace(/^\/+/,'');
  const file=path.resolve(publicRoot,relative);
  if(!file.startsWith(publicRoot+path.sep)||relative.includes('\0'))return send(res,403,{error:'不允许的文件路径'});
  const info=await stat(file);if(!info.isFile())return send(res,404,{error:'文件不存在'});
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':relative.startsWith('data/')?'public, max-age=600':'no-cache'});
  if(req.method==='HEAD')return res.end();res.end(await readFile(file));
 }catch(e){if(!res.headersSent)send(res,e.code==='ENOENT'?404:400,{error:e.message});else res.end();}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'端口 '+port+' 已被使用。已有 ORBIS 服务可直接打开，或设置 PORT 更换端口。':e);process.exitCode=1;});
server.listen(port,host,()=>{
 console.log('ORBIS | 全球运输模拟');console.log('Open http://'+host+':'+port);console.log('Project: '+root);console.log('Press Ctrl+C to stop.');
 if(!process.argv.includes('--offline'))env.refresh(points).catch(e=>console.error('Data refresh:',e.message));
});
const timer=setInterval(()=>{if(!process.argv.includes('--offline'))env.refresh(points).catch(e=>console.error('Data refresh:',e.message));},60000);timer.unref();
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
