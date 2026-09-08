import{normalizeText,facilityName}from'./geography.js';
const fields=['continent','country','region','city'];
const tables={continent:'continents',country:'countries',region:'regions',city:'cities'};
const keyFor=(f,field)=>field==='city'?f.cityKey:f[field];
export const fixedWingTypes=new Set(['large_airport','medium_airport','small_airport']);
export function createFacilityIndex(facilities,directory){
 const nodes={},exactCodes=new Map();
 for(const field of fields){
  nodes[field]=new Map(Object.values(directory[tables[field]]||{}).map(value=>{
   const aliases=[...new Set([value.id,value.name,value.english,...(value.aliases||[])].filter(Boolean).map(normalizeText))];
   return[value.id,{...value,field,aliases,text:aliases.join('|')}];
  }));
 }
 const records=facilities.slice().sort((a,b)=>Number(a.closed)-Number(b.closed)||Number(b.scheduled)-Number(a.scheduled)||b.size-a.size||Number(!!b.zh)-Number(!!a.zh)||a.code.localeCompare(b.code)).map(f=>{
  const codes=[...new Set([f.code,...(f.codes||[])].map(normalizeText))];
  const r={f,codes,text:[facilityName(f),f.name,f.city,f.keywords,...codes].map(normalizeText).join('|')};
  for(const code of codes){if(!exactCodes.has(code))exactCodes.set(code,[]);exactCodes.get(code).push(r);}
  return r;
 });
 const matchesScope=(f,scope)=>fields.every(field=>!scope[field]||keyFor(f,field)===scope[field]);
 function scopeFor(field,id){
  const node=nodes[field].get(id);if(!node)return{};
  if(field==='continent')return{continent:id};
  const country=field==='country'?id:node.country;
  const result={continent:directory.countries[country]?.continent,country};
  if(field==='region'||field==='city')result.region=field==='region'?id:node.region;
  if(field==='city')result.city=id;
  return result;
 }
 function accepts(f,kind,type,includeClosed){
  if(f.kind!==kind||f.closed&&!includeClosed)return false;
  if(kind==='sea'||type==='all')return true;
  if(f.closed)return includeClosed;
  return type==='fixed'?fixedWingTypes.has(f.type):f.type===type;
 }
 let lastKey,lastResult;
 function search({query='',kind='air',scope={},type='all',includeClosed=false,groupBy,offset=0,limit=20,groupOffset=0,groupLimit=12}={}){
  const q=normalizeText(query),cacheKey=JSON.stringify([q,kind,scope,type,includeClosed,groupBy]);
  if(lastKey!==cacheKey){
   let effective={...scope},autoScope=false;
   const exact=(exactCodes.get(q)||[]).filter(r=>accepts(r.f,kind,type,includeClosed)&&matchesScope(r.f,scope));
   if(q&&!exact.length){
    for(const field of ['country','region','city','continent']){
     let hits=[...nodes[field].values()].filter(n=>n.aliases.includes(q)&&matchesScope({...scopeFor(field,n.id),cityKey:field==='city'?n.id:undefined},{...scope,region:field==='country'?undefined:scope.region,city:undefined}));
     if(hits.length>1)hits=hits.filter(n=>records.some(r=>accepts(r.f,kind,type,includeClosed)&&matchesScope(r.f,scopeFor(field,n.id))));
     if(hits.length===1&&records.some(r=>accepts(r.f,kind,type,includeClosed)&&matchesScope(r.f,scopeFor(field,hits[0].id)))){
      effective=scopeFor(field,hits[0].id);autoScope=true;break;
     }
    }
   }
   const geoMatches={};
   if(q&&!autoScope)for(const field of fields)geoMatches[field]=new Set([...nodes[field].values()].filter(n=>n.text.includes(q)).map(n=>n.id));
   let found=records.filter(r=>accepts(r.f,kind,type,includeClosed)&&matchesScope(r.f,effective)&&
    (!q||autoScope||r.text.includes(q)||fields.some(field=>geoMatches[field].has(keyFor(r.f,field)))));
   if(q&&!autoScope)found.sort((a,b)=>Number(b.codes.includes(q))-Number(a.codes.includes(q)));
   let groupField=effective.city?null:effective.region?'city':effective.country?(groupBy==='city'?'city':'region'):effective.continent?'country':'continent';
   // Partial place-name searches expose place choices directly, instead of hiding them below continents.
   if(q&&!autoScope&&!exact.length&&!Object.keys(scope).length){
    groupField=geoMatches.country.size?'country':geoMatches.region.size?'region':geoMatches.city.size?'city':groupField;
   }
   if(exact.length)groupField=null;
   const grouped=new Map();
   if(groupField)for(const {f}of found){
    const id=keyFor(f,groupField),node=nodes[groupField].get(id);if(!node)continue;
    if(!grouped.has(id))grouped.set(id,{id,field:groupField,name:node.name,english:node.english,country:node.country,region:node.region,count:0,scope:scopeFor(groupField,id)});
    grouped.get(id).count++;
   }
   const groups=[...grouped.values()].sort((a,b)=>Number(['CN-HK','CN-MO','CN-TW'].includes(b.id))-Number(['CN-HK','CN-MO','CN-TW'].includes(a.id))||b.count-a.count||a.name.localeCompare(b.name,'zh-CN'));
   lastKey=cacheKey;lastResult={scope:effective,autoScope,groupField,groups,found:found.map(r=>r.f),exact:!!exact.length};
  }
  const r=lastResult;
  return{scope:r.scope,autoScope:r.autoScope,groupField:r.groupField,exact:r.exact,
   groups:r.groups.slice(groupOffset,groupOffset+groupLimit),totalGroups:r.groups.length,
   facilities:r.found.slice(offset,offset+limit),totalFacilities:r.found.length};
 }
 function breadcrumbs(scope){
  return[{name:'全球',scope:{}},...fields.filter(field=>scope[field]).map(field=>({name:nodes[field].get(scope[field])?.name||scope[field],scope:scopeFor(field,scope[field])}))];
 }
 return{search,scopeFor,breadcrumbs,directory};
}
