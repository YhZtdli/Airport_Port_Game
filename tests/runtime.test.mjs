import test from'node:test';
import assert from'node:assert/strict';
import{createState}from'../public/js/engine.js';
import{createRuntime,ageEnvironment}from'../public/js/runtime.js';
import{memoryStore}from'../public/js/browser-store.js';
import{publicEnvironment}from'../scripts/refresh-world.mjs';
const state=()=>createState([],()=>[],{weather:[],marine:[],zones:[]},Date.UTC(2026,8,8));
test('static runtime never sends player saves or refresh requests to HTTP APIs',async()=>{
 const calls=[],storage=memoryStore(),now=Date.UTC(2026,8,8);
 const fetchImpl=async url=>{const u=String(url);calls.push(u);if(u.endsWith('runtime-config.json'))return Response.json({mode:'static'});
  if(u.endsWith('data/environment.json'))return Response.json({weather:[],marine:[],zones:[],sources:{weather:{status:'live',at:now}},nextUpdate:now+43200000});
  throw Error('Unexpected HTTP call '+u);};
 const r=await createRuntime({baseURL:'https://example.test/game/',fetchImpl,now:()=>now,storeFactory:async()=>storage});
 const saved=await r.request('/api/save');assert.equal(saved.state,null);
 await r.request('/api/save','PUT',{revision:0,state:state()});assert.equal((await r.request('/api/save')).revision,1);
 await r.request('/api/environment');await r.request('/api/environment');await r.request('/api/refresh','POST',{points:[[120,30]]});
 assert.equal(calls.length,3);assert.ok(calls.every(u=>u.startsWith('https://example.test/game/')&&!u.includes('/api/')));
});
test('static runtime reuses cached public data when a later snapshot request fails',async()=>{
 const storage=memoryStore(),at=Date.now();await storage.set('environment',{weather:[{point:[0,0]}],sources:{weather:{status:'live',at}},marine:[],zones:[]});
 const r=await createRuntime({baseURL:'https://example.test/orbis/',storeFactory:async()=>storage,fetchImpl:async url=>{
  if(String(url).endsWith('runtime-config.json'))return Response.json({mode:'static'});throw Error('Offline');
 }});
 const env=await r.request('/api/environment');assert.equal(env.weather.length,1);assert.ok(env.snapshotMessage.includes('缓存'));
});
test('expired source timestamps and expired advisories are not presented as current',()=>{
 const now=Date.now(),result=ageEnvironment({sources:{weather:{status:'live',at:now-43200001},marine:{status:'live',at:now-1000}},zones:[{id:'expired',expires:now-1},{id:'valid',expires:now+1000}]},now);
 assert.equal(result.sources.weather.status,'stale');assert.equal(result.sources.marine.status,'live');assert.deepEqual(result.zones.map(z=>z.id),['valid']);
});
test('public world export excludes campaign fields and scenario zones',()=>{
 const input={...state(),weather:[],marine:[],zones:[{id:'private',source:'scenario'},{id:'public',source:'EASA',kind:'air'}]};
 const result=publicEnvironment(input);assert.equal(result.jobs,undefined);assert.equal(result.fleet,undefined);assert.equal(result.cash,undefined);
 assert.deepEqual(result.zones.map(z=>z.id),['public']);
});
test('local mode keeps same-origin server saves and does not open browser storage',async()=>{
 let stored=false;const calls=[];const r=await createRuntime({baseURL:'http://localhost:8787/',storeFactory:async()=>{stored=true;},fetchImpl:async(url,options)=>{
  if(String(url).endsWith('runtime-config.json'))return Response.json({mode:'local'});calls.push([String(url),options]);return Response.json({revision:2});
 }});
 assert.equal((await r.request('/api/save','PUT',{revision:1,state:state()})).revision,2);assert.equal(stored,false);
 assert.equal(calls[0][1].headers['X-Orbis-Client'],'1');assert.equal(calls[0][0],'http://localhost:8787/api/save');
});
test('unavailable persistent storage is explicitly surfaced instead of claiming durable saves',async()=>{
 const r=await createRuntime({baseURL:'https://example.test/game/',storeFactory:async()=>{throw Error('Storage disabled');},fetchImpl:async()=>Response.json({mode:'static'})});
 assert.equal(r.persistent,false);assert.ok(r.storageWarning.includes('临时'));assert.ok(r.savedMessage.includes('当前页面'));
 await r.request('/api/save','PUT',{revision:0,state:state()});assert.equal((await r.request('/api/save')).revision,1);
});
