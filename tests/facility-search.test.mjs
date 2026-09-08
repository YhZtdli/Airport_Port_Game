import test from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{createFacilityIndex}from'../public/js/facility-search.js';
import{facilityName,facilityLocation,normalizeMapGeography}from'../public/js/geography.js';
import{createState,dispatch,SPECS,supportsFacility,validateSave}from'../public/js/engine.js';
import{coord}from'../public/js/geo.js';
const read=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
const [facilities,directory,catalog,world]=await Promise.all(['../public/data/facilities.json','../public/data/directory.json','../public/data/catalog.json','../public/data/world.json'].map(read));
const index=createFacilityIndex(facilities,directory),byId=new Map(facilities.map(f=>[f.id,f]));
test('expanded catalog distinguishes land airports, heliports, seaplanes and closed records',()=>{
 assert.ok(catalog.landAirports>=48000);assert.ok(catalog.airportTypes.heliport>23000);assert.ok(catalog.airportTypes.seaplane_base>1200);
 assert.equal(catalog.airports,catalog.landAirports+catalog.airportTypes.heliport+catalog.airportTypes.seaplane_base);
 assert.equal(index.search({limit:1}).totalFacilities,catalog.airports);
 assert.equal(index.search({type:'fixed'}).totalFacilities,catalog.landAirports);
 assert.equal(index.search({includeClosed:true}).totalFacilities,catalog.airportRecords);
});
test('Chinese country query opens geographic children and city browsing retains country scope',()=>{
 const r=index.search({query:'丹麦'});assert.equal(r.scope.country,'DK');assert.ok(r.groups.length>=5);assert.ok(r.facilities.every(f=>f.country==='DK'));
 const city=index.search({scope:r.scope,groupBy:'city',groupLimit:1000}).groups.find(g=>g.name==='哥本哈根');assert.ok(city);
 const airports=index.search({scope:city.scope,limit:100});assert.ok(airports.facilities.some(f=>f.code==='CPH'));
 assert.ok(index.breadcrumbs(city.scope).some(b=>b.name==='丹麦'));
 assert.equal(index.search({query:'丹麥'}).totalFacilities,r.totalFacilities);
});
test('Beijing Chinese city and province search finds PEK and PKX with source codes',()=>{
 for(const query of ['北京','北京市','Beijing']){
  const r=index.search({query,limit:100});assert.ok(r.facilities.some(f=>f.code==='PEK'));assert.ok(r.facilities.some(f=>f.code==='PKX'));
  assert.ok(r.facilities.every(f=>f.country==='CN'));
 }
 for(const code of ['PEK','ZBAA','PKX','ZBAD','CPH','EKCH','HKG','VHHH','TPE','RCTP']){
  const r=index.search({query:code});assert.ok(r.facilities[0].codes.includes(code),code);
 }
});
test('country and city queries support aliases and partial geographic names',()=>{
 assert.equal(index.search({query:'United Kingdom'}).scope.country,'GB');
 const city=index.search({query:'København',limit:100});assert.ok(city.facilities.some(f=>f.code==='CPH'));
 const partial=index.search({query:'哥本',limit:100});assert.ok(partial.groups.some(g=>g.name==='哥本哈根'));
});
test('country results paginate beyond the former 18-item limit without missing facilities',()=>{
 const first=index.search({query:'美国',limit:20}),second=index.search({query:'美国',offset:20,limit:20});
 assert.equal(first.facilities.length,20);assert.equal(second.facilities.length,20);
 assert.equal(new Set([...first.facilities,...second.facilities].map(f=>f.id)).size,40);
 const all=index.search({query:'美国',limit:100000});
 assert.equal(all.facilities.length,first.totalFacilities);
 assert.equal(all.facilities.length,facilities.filter(f=>f.kind==='air'&&!f.closed&&f.country==='US').length);
 const groups=index.search({query:'美国',groupLimit:10000});assert.equal(groups.groups.length,groups.totalGroups);
});
test('Taiwan, Hong Kong and Macao are Chinese subdivisions consistently across aviation, ports and map',()=>{
 const children=index.search({query:'中国',groupLimit:1000}).groups.map(g=>g.name);
 for(const [source,query,label]of [['TW','台湾','中国台湾省'],['HK','香港','中国香港'],['MO','澳门','中国澳门']]){
  assert.equal(directory.countries[source],undefined);assert.ok(children.includes(label));
  const r=index.search({query,limit:1000});assert.equal(r.scope.country,'CN');assert.equal(r.scope.region,'CN-'+source);
  assert.ok(r.facilities.length);
  for(const f of facilities.filter(f=>f.sourceCountry===source)){
   assert.equal(f.country,'CN');assert.equal(f.region,'CN-'+source);assert.ok(facilityName(f).includes(label));assert.ok(facilityLocation(f,directory).includes(label));
  }
 }
 const hongKongPort=index.search({query:'香港',kind:'sea',limit:1000});assert.ok(hongKongPort.facilities.some(f=>f.code==='CNHKG'));
 const t=world.features.find(f=>f.properties.iso==='TWN');assert.equal(t.properties.country,'CN');assert.equal(t.properties.nameZh,'中国台湾省');
 assert.equal(JSON.stringify(normalizeMapGeography(structuredClone(world))),JSON.stringify(world));
});
test('added facility types are usable only with compatible aircraft; closed sites cannot dispatch',()=>{
 const heli=facilities.find(f=>f.type==='heliport'&&!f.closed),water=facilities.find(f=>f.type==='seaplane_base'&&!f.closed),land=facilities.find(f=>f.type==='large_airport'),closed=facilities.find(f=>f.closed);
 assert.equal(supportsFacility(SPECS.a320,heli),false);assert.equal(supportsFacility(SPECS.a320,water),false);
 assert.equal(supportsFacility(SPECS.helicopter,heli),true);assert.equal(supportsFacility(SPECS.amphibian,water),true);
 const environment={zones:[],weather:[],marine:[]},ctx={facilities,byId,environment,isLand:()=>false,seaRouter:(a,b)=>[coord(a),coord(b)]};
 const s=createState([],()=>[],environment),cash=s.cash;
 for(const origin of[heli,water,closed])assert.throws(()=>dispatch(s,{assetId:'new:a320',origin:origin.id,destination:land.id,path:[coord(origin),coord(land)],fuelPercent:100},ctx),/不兼容/);
 assert.equal(s.cash,cash);assert.equal(s.fleet.length,0);
 for(const [spec,origin]of [['helicopter',heli],['amphibian',water]]){
  const j=dispatch(s,{assetId:'new:'+spec,origin:origin.id,destination:land.id,path:[coord(origin),coord(land)],fuelPercent:100},ctx);
  assert.equal(j.spec,spec);assert.equal(j.origin,origin.id);
 }
 assert.ok(validateSave(s));
});
test('existing saved campaign endpoints and alternate facilities still resolve',async t=>{
 let saved;try{saved=await read('../data/save.json');}catch(e){if(e.code==='ENOENT'){t.skip('No private local campaign in this checkout');return;}throw e;}assert.ok(validateSave(saved.state));
 for(const job of saved.state.jobs)for(const id of[job.origin,job.destination,job.landingAt,job.rescueFacility].filter(Boolean))assert.ok(byId.has(id),id);
 for(const asset of saved.state.fleet)if(asset.location)assert.ok(byId.has(asset.location),asset.location);
});
