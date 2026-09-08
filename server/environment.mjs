import{readFile,writeFile,rename,mkdir}from'node:fs/promises';
import{coord,distance,landIndex,sampleRoute}from'../public/js/geo.js';
import{normalizeAdvisories,TWELVE_HOURS}from'../public/js/conditions.js';
const root=new URL('../',import.meta.url);
export async function atomicJson(file,data){const url=new URL(file,root),tmp=new URL(file+'.tmp',root);await writeFile(tmp,JSON.stringify(data));await rename(tmp,url);}
const readJson=async file=>JSON.parse((await readFile(new URL(file,root),'utf8')).replace(/^\uFEFF/,''));
export async function createEnvironment(world,{read=readJson,write=atomicJson,fetchImpl=fetch,now=Date.now}={}){
 let cache;try{cache=await read('data/environment.json');}catch{cache={weather:[],marine:[],zones:[],sources:{},updatedAt:null,nextUpdate:0};}
 let inflight=null,lastAttempt=0;
 const isLand=landIndex(world);
 if(!cache.zones.length)try{cache.zones=normalizeAdvisories(await read('data/easa-raw.json'),world);cache.sources.conflict={status:'cache',at:(await (await import('node:fs/promises')).stat(new URL('data/easa-raw.json',root))).mtimeMs,message:'随项目保存的 EASA 公告快照'};}catch{}
 const grid=[];for(const lat of[-45,-15,15,45,65])for(const lon of[-160,-120,-80,-40,0,40,80,120,160])grid.push([lon,lat]);
 async function fetchJson(url){const r=await fetchImpl(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
 async function sample(kind,points){
  const weather={wind:'wind_speed_250hPa',windDir:'wind_direction_250hPa',gust:'wind_gusts_10m',cape:'cape',visibility:'visibility',code:'weather_code',precip:'precipitation'};
  const marine={wave:'wave_height',current:'ocean_current_velocity',currentDir:'ocean_current_direction'};
  const fields=kind==='weather'?weather:marine,result=[];
  for(let i=0;i<points.length;i+=20){
   const batch=points.slice(i,i+20),u=new URL(kind==='weather'?'https://api.open-meteo.com/v1/forecast':'https://marine-api.open-meteo.com/v1/marine');
   u.search=new URLSearchParams({latitude:batch.map(p=>p[1].toFixed(2)).join(','),longitude:batch.map(p=>p[0].toFixed(2)).join(','),hourly:Object.values(fields).join(','),forecast_hours:'72',timezone:'GMT',...(kind==='marine'?{cell_selection:'sea'}:{})});
   const raw=await fetchJson(u);const rows=Array.isArray(raw)?raw:[raw];
   if(rows.length!==batch.length)throw Error('采样点数量不匹配');
   rows.forEach((row,j)=>{
    if(!row.hourly?.time?.length)throw Error('缺少小时预报');
    const values={};for(const[k,v]of Object.entries(fields))values[k]=row.hourly[v]||[];
    if(!Object.values(values).some(a=>a.some(Number.isFinite)))return;
    result.push({point:batch[j],times:row.hourly.time.map(t=>Date.parse(t+'Z')),values});
   });
  }if(!result.length)throw Error('没有可用的预报样本');return result;
 }
 async function refresh(extra=[],force=false){
  if(inflight)return inflight;
  if(!force&&cache.nextUpdate>now())return cache;
  if(force&&now()-lastAttempt<60000)return cache;
  lastAttempt=now();
  inflight=(async()=>{
   const points=[...grid];for(const p of extra)if(points.length<100&&!points.some(q=>distance(p,q)<120))points.push(p);
   const marinePoints=points.filter(p=>Math.abs(p[1])<70&&!isLand(p));
   const tasks=[
    ['weather',()=>sample('weather',points)],
    ['marine',()=>sample('marine',marinePoints)],
    ['conflict',async()=>{const raw=await fetchJson('https://www.easa.europa.eu/en/domains/air-operations/czibs/export-json?_format=json&page=');const zones=normalizeAdvisories(raw,world);await write('data/easa-raw.json',raw);return zones;}]
   ];
   const results=await Promise.allSettled(tasks.map(async([key,fn])=>({key,data:await fn()})));
   results.forEach((r,i)=>{
    const key=tasks[i][0],at=now();
    if(r.status==='fulfilled'){cache[key==='conflict'?'zones':key]=r.value.data;cache.sources[key]={status:'live',at,count:r.value.data.length,message:'公开数据同步成功'};}
    else{cache.sources[key]={...(cache.sources[key]||{}),status:cache[key==='conflict'?'zones':key]?.length?'stale':'offline',lastAttempt:at,message:r.reason?.message||'连接失败'};}
   });
   cache.updatedAt=now();cache.nextUpdate=now()+TWELVE_HOURS;cache.cadenceHours=12;
   await write('data/environment.json',cache);return cache;
  })().finally(()=>{inflight=null;});
  return inflight;
 }
 return{get:()=>({...cache,refreshing:!!inflight}),refresh,isLand};
}
