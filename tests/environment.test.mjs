import test from'node:test';
import assert from'node:assert/strict';
import{createEnvironment}from'../server/environment.mjs';
import{TWELVE_HOURS}from'../public/js/conditions.js';
const world={features:[]};
function harness(){
 let time=Date.UTC(2026,8,8),calls=0,failWeather=false;
 const files=new Map();
 const fetchImpl=async url=>{
  calls++;const u=new URL(url);
  if(u.hostname.includes('easa'))return{ok:true,json:async()=>({conflict_zones:[]})};
  if(failWeather&&u.hostname==='api.open-meteo.com')throw Error('fixture network outage');
  const count=u.searchParams.get('latitude').split(',').length,keys=u.searchParams.get('hourly').split(',');
  return{ok:true,json:async()=>Array.from({length:count},()=>({hourly:{time:['2026-09-08T00:00','2026-09-08T01:00'],...Object.fromEntries(keys.map(k=>[k,[1,2]]))}}))};
 };
 return{options:{read:async key=>{if(!files.has(key))throw Error('not found');return structuredClone(files.get(key));},write:async(key,data)=>files.set(key,structuredClone(data)),fetchImpl,now:()=>time},
  files,get calls(){return calls;},set time(t){time=t;},get time(){return time;},set failWeather(v){failWeather=v;}};
}
test('provider refresh uses a 12h wall-clock cache and not game time',async()=>{
 const h=harness(),env=await createEnvironment(world,h.options);await env.refresh([[121,31]]);
 assert.equal(env.get().sources.weather.status,'live');assert.equal(env.get().cadenceHours,12);
 const first=h.calls;h.time+=TWELVE_HOURS-1;await env.refresh();assert.equal(h.calls,first);
 h.time+=2;await env.refresh();assert.ok(h.calls>first);assert.ok(h.files.has('data/environment.json'));
});
test('one failing provider retains its last good data and timestamp',async()=>{
 const h=harness(),env=await createEnvironment(world,h.options);await env.refresh();const before=structuredClone(env.get());
 h.failWeather=true;h.time+=TWELVE_HOURS+1;await env.refresh();
 assert.equal(env.get().sources.weather.status,'stale');assert.equal(env.get().sources.weather.at,before.sources.weather.at);
 assert.deepEqual(env.get().weather,before.weather);assert.equal(env.get().sources.marine.status,'live');
});
test('concurrent refresh requests are coalesced and manual refresh is throttled',async()=>{
 const h=harness(),env=await createEnvironment(world,h.options);
 await Promise.all([env.refresh(),env.refresh(),env.refresh()]);
 assert.equal(h.calls,7);const count=h.calls;await env.refresh([],true);assert.equal(h.calls,count);
 h.time+=60001;await env.refresh([],true);assert.ok(h.calls>count);
});
test('cold offline startup exposes missing data honestly',async()=>{
 const h=harness();h.options.fetchImpl=async()=>{throw Error('offline');};
 const env=await createEnvironment(world,h.options);await env.refresh();
 assert.equal(env.get().weather.length,0);assert.equal(env.get().sources.weather.status,'offline');assert.equal(env.get().sources.marine.status,'offline');
});
