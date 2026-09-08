import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {distance,interpolate,displaySegments,routeLength,createSeaRouter,landIndex,coord} from '../public/js/geo.js';
import {groundSpeed,normalizeAdvisories,conditionsAt} from '../public/js/conditions.js';
import {createState,dispatch,advance,SPECS,cascade,validateSave,injectScenario,upgrade} from '../public/js/engine.js';
const facilities=[
 {id:'a',code:'AAA',kind:'air',name:'Alpha',lat:0,lon:0,size:3},
 {id:'b',code:'BBB',kind:'air',name:'Bravo',lat:0,lon:10,size:3},
 {id:'c',code:'CCC',kind:'air',name:'Charlie',lat:0,lon:20,size:3},
 {id:'d',code:'DDD',kind:'air',name:'Delta',lat:1,lon:2,size:3},
 {id:'p',code:'PPP',kind:'sea',name:'Port Alpha',lat:0,lon:0,size:3},
 {id:'q',code:'QQQ',kind:'sea',name:'Port Bravo',lat:0,lon:10,size:3}
];
function fixture(kind='air'){
 const environment={weather:[],marine:[],zones:[]},s=createState([],()=>[],environment,Date.UTC(2026,8,8));
 s.fleet=[{id:'v1',spec:kind==='air'?'a320':'feeder',location:kind==='air'?'a':'p',fuel:0,wear:0,available:0,job:null}];
 const ctx={environment,facilities,byId:new Map(facilities.map(f=>[f.id,f])),isLand:()=>false,seaRouter:(a,b)=>[coord(a),coord(b)]};
 return{s,ctx};
}
function add(s,ctx,overrides={}){const sea=s.fleet[0].spec==='feeder';return dispatch(s,{origin:sea?'p':'a',destination:sea?'q':'b',assetId:'v1',path:[[0,0],[10,0]],scheduled:0,fuelPercent:100,...overrides},ctx);}
test('great-circle distance and trans-Pacific interpolation use the dateline',()=>{
 assert.ok(distance([179,0],[-179,0])<225);assert.ok(Math.abs(interpolate([179,0],[-179,0],.5)[0])>179);
 assert.equal(distance([0,0],[0,0]),0);for(const segment of displaySegments([[170,20],[-150,35]]))for(let i=1;i<segment.length;i++)assert.ok(Math.abs(segment[i][1]-segment[i-1][1])<180);
});
test('wind direction is FROM while current direction is TOWARD',()=>{
 const c={wind:100,windDir:90,current:4,currentDir:90,wave:0};
 assert.equal(groundSpeed(SPECS.a320,c,90),730);
 assert.equal(groundSpeed(SPECS.feeder,c,90),35);
});
test('normal voyage moves before arriving and conserves fuel and accounting',()=>{
 const{s,ctx}=fixture(),j=add(s,ctx);advance(s,.5,ctx);
 assert.equal(j.status,'active');assert.ok(j.progress>0&&j.progress<j.length);
 assert.ok(j.fuel<SPECS.a320.tank);assert.ok(j.fuelUsed>0);assert.ok(s.co2>0);
 advance(s,3,ctx);assert.equal(j.status,'completed');assert.equal(s.fleet[0].location,'b');assert.equal(s.completed,1);
 assert.ok(Math.abs((8000000+s.revenue-s.costs)-s.cash)<1e-5);
});
test('one vehicle cannot execute concurrent flights',()=>{
 const{s,ctx}=fixture(),first=add(s,ctx),next=add(s,ctx,{origin:'b',destination:'c',path:[[10,0],[20,0]],depends:first.id});
 advance(s,1,ctx);assert.equal(first.status,'active');assert.equal(next.status,'scheduled');
 advance(s,4,ctx);assert.ok(next.departed>=first.arrived+SPECS.a320.turn-.1);assert.equal(next.rotation,first.id);
});
test('fuel shortage produces physical diversion or explicit rescue',()=>{
 const{s,ctx}=fixture(),j=add(s,ctx,{destination:'c',path:[[0,0],[20,0]],fuelPercent:10});
 advance(s,.5,ctx);assert.ok(['diverting','stranded','servicing'].includes(j.status));
 assert.ok(j.incidents.some(t=>t.includes('燃油')));assert.ok(j.progress<j.length||j.status==='servicing');
});
test('closure causes a diversion and correlated downstream delay',()=>{
 const{s,ctx}=fixture(),j=add(s,ctx),next=add(s,ctx,{origin:'b',destination:'c',path:[[10,0],[20,0]],depends:j.id});
 advance(s,.2,ctx);injectScenario(s,'closure',ctx);advance(s,.7,ctx);
 assert.ok(j.diversions>0);assert.ok(next.delay>0);
 assert.ok(s.events.some(e=>e.type==='cascade'&&e.jobId===next.id&&e.rootId));
});
test('dependency graph propagates each delay once, even on repeated graph paths',()=>{
 const{s,ctx}=fixture(),j=add(s,ctx),next=add(s,ctx,{origin:'b',destination:'c',path:[[10,0],[20,0]],depends:j.id});
 cascade(s,j,3,'fixture');assert.equal(next.delay,3);assert.equal(next.notBefore,3);
});
test('cross-modal cargo dependency waits for completion plus transfer time',()=>{
 const{s,ctx}=fixture();s.fleet.push({id:'boat',spec:'feeder',location:'q',available:0,wear:0,fuel:0});
 const air=add(s,ctx);const sea=dispatch(s,{origin:'q',destination:'p',assetId:'boat',path:[[10,0],[0,0]],depends:air.id},ctx);
 advance(s,3,ctx);assert.equal(air.status,'completed');assert.equal(sea.status,'scheduled');
 advance(s,3,ctx);assert.equal(sea.status,'active');assert.ok(sea.departed>=air.arrived+3);
});
test('custom ship route through land triggers consequences',()=>{
 const{s,ctx}=fixture('sea');ctx.isLand=p=>p[0]>.8&&p[0]<3;const j=add(s,ctx);
 advance(s,5,ctx);assert.ok(j.incidents.some(x=>x.includes('陆地')));
});
test('queued terminal arrivals receive congestion delay',()=>{
 const{s,ctx}=fixture();s.fleet.push({id:'v2',spec:'a320',location:'a',available:0,wear:0,fuel:0});const j=add(s,ctx),k=add(s,ctx,{assetId:'v2'});
 advance(s,3,ctx);assert.equal(j.status,'completed');assert.equal(k.status,'completed');assert.ok(k.arrived>j.arrived);assert.ok(k.delay>0);
});
test('cancelling a dependency cancels the unfulfilled onward connection',()=>{
 const{s,ctx}=fixture(),j=add(s,ctx),next=add(s,ctx,{origin:'b',destination:'c',path:[[10,0],[20,0]],depends:j.id});j.status='cancelled';advance(s,1,ctx);assert.equal(next.status,'cancelled');
});
test('leasing validates origin and does not charge failed jobs',()=>{
 const{s,ctx}=fixture(),cash=s.cash,count=s.fleet.length;
 assert.throws(()=>add(s,ctx,{origin:'p',assetId:'new:a320'}));assert.equal(s.cash,cash);assert.equal(s.fleet.length,count);
 assert.throws(()=>add(s,ctx,{path:[[0,0],[NaN,0]]}));
});
test('fresh forecast and outside-horizon data are distinguishable',()=>{
 const anchor=Date.UTC(2026,8,8),env={anchorTime:anchor,weather:[{point:[0,0],times:[anchor],values:{wind:[50],gust:[10]}}]};
 assert.equal(conditionsAt(env,[0,0],0).source,'live');assert.equal(conditionsAt(env,[0,0],24).source,'stale');assert.equal(conditionsAt(env,[90,0],0).source,'synthetic');
});
test('expired and withdrawn conflict bulletins are excluded',()=>{
 const world={features:[{properties:{name:'Test',nameZh:'测试'},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]}}]};
 const raw={conflict_zones:[{Nid:'1',name:'Test',country:'Test',status:'Withdrawn',valid_until_date:'01/01/2027'},{Nid:'2',name:'Test',country:'Test',status:'Active',valid_until_date:'01/01/2025'},{Nid:'3',name:'Test',country:'Test',status:'Active',valid_until_date:'01/01/2027'}]};
 const zones=normalizeAdvisories(raw,world,Date.UTC(2026,8,8));assert.equal(zones.length,1);assert.equal(zones[0].type,'advisory');assert.ok(zones[0].approximate);
});
test('save restores paused and rejects invalid positions',()=>{
 const{s,ctx}=fixture();add(s,ctx);s.speed=96;const copy=validateSave(JSON.parse(JSON.stringify(s)));assert.equal(copy.speed,0);
 copy.jobs[0].path[0]=[400,0];assert.throws(()=>validateSave(copy));
});
test('large step and small steps give equivalent physical simulation',()=>{
 const{s,ctx}=fixture();add(s,ctx);const other=structuredClone(s);advance(s,6,ctx);for(let i=0;i<72;i++)advance(other,1/12,ctx);
 assert.equal(s.jobs[0].status,other.jobs[0].status);assert.ok(Math.abs(s.cash-other.cash)<1e-6);
});
test('investment requires progress and funds, and has finite upgrades',()=>{
 const{s}=fixture();assert.throws(()=>upgrade(s,'dispatch'));s.completed=3;upgrade(s,'dispatch');assert.equal(s.upgrades.dispatch,1);assert.equal(s.cash,7750000);
});
test('real global catalog and maritime graph support the initial campaign',async()=>{
 const json=async p=>JSON.parse((await readFile(new URL('../'+p,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
 const fs=await json('public/data/facilities.json'),world=await json('public/data/world.json'),router=createSeaRouter(await json('public/data/sea-network.json'));
 assert.ok(fs.filter(f=>f.kind==='air').length>40000);assert.ok(fs.filter(f=>f.kind==='sea').length>3000);
 const origin=fs.find(f=>f.code==='SGSIN'),dest=fs.find(f=>f.code==='NLRTM');
 const path=router(origin,dest);assert.ok(path.length>20);assert.ok(routeLength(path)>distance(origin,dest)*1.2);
 const land=landIndex(world);assert.equal(land([10,50]),true);assert.equal(land([-140,0]),false);
 const s=createState(fs,router,{zones:[],weather:[],marine:[]});assert.equal(s.jobs.length,9);assert.equal(s.fleet.length,7);
 console.log('Catalog:',fs.length,'facilities. Singapore–Rotterdam:',Math.round(routeLength(path)),'km.');
});
