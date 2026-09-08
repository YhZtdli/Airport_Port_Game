import{validateSave}from'./engine.js';
const conflict=()=>Object.assign(Error('另一窗口更新了存档，请刷新以避免覆盖'),{status:409});
export async function openBrowserStore(namespace,{indexedDB=globalThis.indexedDB}={}){
 if(!indexedDB)throw Error('此浏览器未启用本地存档，请允许网站存储后重试');
 const db=await new Promise((resolve,reject)=>{
  const request=indexedDB.open('orbis:'+namespace,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('records'))request.result.createObjectStore('records');};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(Error('无法打开浏览器存档：'+request.error?.message));
  request.onblocked=()=>reject(Error('请关闭本游戏的其他旧窗口，再重新打开'));
 });
 db.onversionchange=()=>db.close();
 function run(mode,action){
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('records',mode),store=tx.objectStore('records');let output,problem;
   tx.oncomplete=()=>resolve(output);
   tx.onabort=()=>reject(problem||tx.error||Error('浏览器未能保存进度'));
   tx.onerror=()=>{problem??=tx.error;};
   const set=v=>{output=v;},fail=e=>{problem=e;tx.abort();};
   try{action(store,set,fail);}catch(e){fail(e);}
  });
 }
 return{
  persistent:true,
  get:key=>run('readonly',(store,set)=>{const req=store.get(key);req.onsuccess=()=>set(req.result);}),
  set:(key,value)=>run('readwrite',(store,set)=>{store.put(value,key);set(true);}),
  readSave:async()=>{const data=await run('readonly',(store,set)=>{const req=store.get('save');req.onsuccess=()=>set(req.result);});
   if(!data)return{revision:0,state:null};
   return{revision:data.revision,state:validateSave(data.state)};
  },
  save:({revision,state})=>{
   const snapshot=validateSave(structuredClone(state));
   if(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength>8e6)return Promise.reject(Error('存档超过 8 MB，请先导出备份并精简历史班次'));
   return run('readwrite',(store,set,fail)=>{
    const request=store.get('save');
    request.onsuccess=()=>{const old=request.result;if((old?.revision||0)!==revision){fail(conflict());return;}
     const next={revision:revision+1,state:snapshot};store.put(next,'save');set({revision:next.revision});};
   });
  },
  close:()=>db.close()
 };
}
export function memoryStore(){
 const data=new Map();
 return{persistent:false,get:async k=>structuredClone(data.get(k)),set:async(k,v)=>{data.set(k,structuredClone(v));},
  readSave:async()=>structuredClone(data.get('save')||{revision:0,state:null}),
  save:async({revision,state})=>{if((data.get('save')?.revision||0)!==revision)throw conflict();data.set('save',{revision:revision+1,state:validateSave(structuredClone(state))});return{revision:revision+1};},close(){}};
}
