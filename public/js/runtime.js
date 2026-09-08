import{openBrowserStore,memoryStore}from'./browser-store.js';
import{TWELVE_HOURS}from'./conditions.js';
const blankEnvironment=()=>({weather:[],marine:[],zones:[],sources:{},updatedAt:null,nextUpdate:0,cadenceHours:12});
export function ageEnvironment(snapshot,now=Date.now()){
 const result=structuredClone(snapshot||blankEnvironment());
 result.weather||=[];result.marine||=[];result.zones||=[];result.sources||={};
 for(const source of Object.values(result.sources))if(['live','cache'].includes(source.status)&&(!source.at||now-source.at>TWELVE_HOURS))source.status='stale';
 result.zones=result.zones.filter(z=>!z.expires||z.expires>now);
 return result;
}
export async function createRuntime({baseURL=new URL('.',document.baseURI).href,fetchImpl=fetch,now=Date.now,storeFactory=openBrowserStore}={}){
 const base=new URL(baseURL);
 async function json(file,options={}){
  const response=await fetchImpl(new URL(file.replace(/^\/+/,''),base),options);
  if(!response.ok){const error=Error('读取失败：'+file+'（HTTP '+response.status+'）');error.status=response.status;throw error;}
  return response.json();
 }
 const config=await json('runtime-config.json',{cache:'no-cache'});
 if(!['local','static'].includes(config.mode))throw Error('网站运行配置无效，请重新发布');
 const mode=config.mode;let store,storageWarning='';
 if(mode==='static'){
  try{store=await storeFactory(base.href);}catch(e){store=memoryStore();storageWarning=e.message+'。当前只能临时游玩，请导出进度。';}
 }
 let snapshot=null,lastCheck=0,inflight=null;
 async function getEnvironment(force=false){
  if(snapshot&&!force&&now()-lastCheck<300000)return ageEnvironment(snapshot,now());
  if(inflight)return inflight;
  inflight=(async()=>{
   lastCheck=now();
   try{
    snapshot=await json(config.environmentURL||'data/environment.json',{cache:'no-cache'});
    snapshot.snapshotMessage='公共世界数据快照；网站计划每 12 小时更新';
    try{await store.set('environment',snapshot);}catch{}
   }catch(e){
    snapshot=snapshot||await store.get('environment')||blankEnvironment();
    snapshot.snapshotMessage='暂时无法取得新版世界数据，使用已有缓存或演练环境';
   }
   return ageEnvironment(snapshot,now());
  })().finally(()=>{inflight=null;});
  return inflight;
 }
 async function request(url,method='GET',data){
  const file=url.replace(/^\/+/,''),path=file.split('?')[0];
  if(!path.startsWith('api/')){
   const compressed=config.compressed?.[path];
   if(compressed&&typeof DecompressionStream==='function'){
    const response=await fetchImpl(new URL(compressed,base));
    if(!response.ok)throw Error('设施目录下载失败：HTTP '+response.status);
    const stream=response.body.pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).json();
   }
   return json(file);
  }
  if(mode==='local'){
   const response=await fetchImpl(new URL(file,base),{method,headers:method==='GET'?{}:{'Content-Type':'application/json','X-Orbis-Client':'1'},body:data?JSON.stringify(data):undefined});
   const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error||'请求失败'),{status:response.status});return value;
  }
  if(path==='api/save'&&method==='GET')return store.readSave();
  if(path==='api/save'&&method==='PUT')return store.save(data);
  if(path==='api/environment'&&method==='GET')return getEnvironment();
  if(path==='api/refresh'&&method==='POST')return getEnvironment(true);
  if(path==='api/health')return{ok:true,name:'ORBIS',mode:'static'};
  throw Error('网页版不需要此服务器接口：'+path);
 }
 function flush(data){
  if(mode==='static')return store.save(data);
  return fetchImpl(new URL('api/save',base),{method:'PUT',headers:{'Content-Type':'application/json','X-Orbis-Client':'1'},body:JSON.stringify(data),keepalive:true});
 }
 return{mode,baseURL:base.href,config,request,flush,storageWarning,
  get persistent(){return mode==='local'||store.persistent;},
  get saveDescription(){return mode==='local'?'进度自动保存到项目 data/save.json。':store.persistent?'进度保存在此浏览器中，每位玩家各自独立。换设备请导出 / 导入；清除网站数据会移除存档。':'本浏览器暂不能持久保存，关闭网页会丢失本次进度，请导出存档。';},
  get savedMessage(){return mode==='local'?'进度已保存到项目 data/save.json':store.persistent?'进度已保存到当前浏览器':'进度仅保留在当前页面，请导出存档';},
  close(){store?.close();}
 };
}
