import{readFile,writeFile,mkdir,rename}from'node:fs/promises';
import{fileURLToPath}from'node:url';
import path from'node:path';
import{createEnvironment}from'../server/environment.mjs';
const root=path.dirname(fileURLToPath(new URL('../package.json',import.meta.url))),cache=path.join(root,'.cache','world');
const read=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
export function publicEnvironment(value={}){
 const sources={};for(const key of['weather','marine','conflict']){
  const s=value.sources?.[key]||{};sources[key]={status:s.status||'offline',at:s.at||null,count:s.count||0,message:s.message||'尚未取得公共数据',...(s.lastAttempt?{lastAttempt:s.lastAttempt}:{})};
 }
 const samples=(list,fields)=>(list||[]).filter(x=>Array.isArray(x.point)&&x.point.length===2).map(x=>({point:x.point,times:x.times||[],values:Object.fromEntries(fields.map(k=>[k,x.values?.[k]||[]]))}));
 return{version:1,weather:samples(value.weather,['wind','windDir','gust','cape','visibility','code','precip']),marine:samples(value.marine,['wave','current','currentDir']),
  zones:(value.zones||[]).filter(z=>z.source!=='scenario').map(z=>Object.fromEntries(['id','name','kind','type','severity','geometry','center','radius','source','sourceUrl','expires','approximate','detail','scopeNote'].filter(k=>z[k]!==undefined).map(k=>[k,z[k]]))),
  sources,updatedAt:value.updatedAt||null,nextUpdate:value.nextUpdate||0,cadenceHours:12,hosting:'static',snapshotMessage:'公共世界数据快照；网站计划每 12 小时更新'};
}
export async function readWorldSnapshot(){
 try{return publicEnvironment(await read(path.join(cache,'environment.json')));}
 catch{try{return publicEnvironment(await read(path.join(root,'public/data/environment.seed.json')));}catch{return publicEnvironment();}}
}
export async function refreshWorld(){
 await mkdir(cache,{recursive:true});
 const world=await read(path.join(root,'public/data/world.json'));
 const environment=await createEnvironment(world,{
  read:async file=>{
   if(file==='data/environment.json')return readWorldSnapshot();
   if(file==='data/easa-raw.json')return read(path.join(cache,'easa-raw.json'));
   throw Error('Unexpected public data file');
  },
  write:async(file,value)=>{
   if(!['data/environment.json','data/easa-raw.json'].includes(file))throw Error('Unexpected cache destination');
   const target=path.join(cache,path.basename(file));await writeFile(target+'.tmp',JSON.stringify(value));await rename(target+'.tmp',target);
  }
 });
 const snapshot=publicEnvironment(await environment.refresh([],true));
 await writeFile(path.join(cache,'environment.json'),JSON.stringify(snapshot));
 console.log(JSON.stringify({updatedAt:snapshot.updatedAt,sources:snapshot.sources},null,2));
 return snapshot;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await refreshWorld();
