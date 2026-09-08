import {distance,bearing,rad,clamp,inGeometry} from './geo.js';
export const TWELVE_HOURS=12*60*60*1000;
export function random01(seed){let x=(seed^0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x21f0aaad);x=Math.imul(x^(x>>>15),0x735a2d97);return((x^(x>>>15))>>>0)/4294967296;}
export function fallbackAt(point,hour=0){
 const [lon,lat]=point;
 // Explicitly synthetic, deterministic exercise weather. Never labelled live.
 const phase=rad(lon*2+hour*4),belt=Math.max(0,1-Math.abs(Math.abs(lat)-38)/32);
 return{wind:25+95*belt,windDir:lat>=0?270:90,gust:18+20*(Math.sin(phase)+1),cape:Math.max(0,900*Math.cos(rad(lat*2))*Math.sin(phase)),
 visibility:16000,wave:1.1+1.2*belt*(1+Math.sin(phase))/2,current:1.5*Math.cos(rad(lat)),currentDir:lat>=0?80:270,precip:0,code:2,source:'synthetic',distance:0};
}
function pick(samples,point,maxKm,hour){
 let nearest=null,dist=Infinity;
 for(const s of samples||[]){const d=distance(point,s.point);if(d<dist){dist=d;nearest=s;}}
 if(!nearest||dist>maxKm)return null;
 const i=nearest.times?.length?nearest.times.reduce((best,t,j)=>Math.abs(t-hour)<Math.abs(nearest.times[best]-hour)?j:best,0):0;
 const out={};for(const[k,v]of Object.entries(nearest.values||{}))out[k]=Array.isArray(v)?v[i]:v;
 // Forecast horizon is wall-clock based. Outside it, keep sample only as stale provenance.
 const delta=nearest.times?.length?Math.abs(nearest.times[i]-hour):Infinity;
 return{...out,source:delta<=3*3600000?'live':'stale',distance:dist,observedAt:nearest.times?.[i]};
}
export function conditionsAt(env,point,simHour=0,kind='air'){
 const realTime=(env?.anchorTime||Date.now())+simHour*3600000;
 const fallback=fallbackAt(point,simHour);
 const sample=pick(kind==='sea'?env?.marine:env?.weather,point,kind==='sea'?700:800,realTime);
 const result={...fallback,...sample};
 for(const key of Object.keys(fallback)){if(result[key]===null||result[key]===undefined)result[key]=fallback[key];}
 if(kind==='sea'&&sample&&!Number.isFinite(sample.current))result.currentSource='synthetic';
 return result;
}
export function zoneAt(env,point,kind,hour=0){
 return(env?.zones||[]).filter(z=>(!z.kind||z.kind===kind||z.kind==='both')&&(z.untilHour==null||z.untilHour>hour)&&
 (z.geometry?inGeometry(point,z.geometry):distance(point,z.center)<z.radius));
}
export function conditionsRisk(c,kind){
 return kind==='sea'?clamp((c.wave-3)/5,0,1):clamp(Math.max((c.gust-55)/70,(c.cape-1200)/3500,(4000-c.visibility)/4000,[95,96,99].includes(c.code)?.85:0),0,1);
}
export function groundSpeed(spec,c,heading){
 const assist=spec.kind==='air'?-c.wind*Math.cos(rad(c.windDir-heading)):c.current*Math.cos(rad(c.currentDir-heading));
 return clamp(spec.speed+assist,spec.speed*.4,spec.speed*1.35)*(spec.kind==='sea'?clamp(1-Math.max(0,c.wave-2)*.05,.45,1):1);
}
export function normalizeAdvisories(raw,world,now=Date.now()){
 const rows=Array.isArray(raw)?raw:raw?.conflict_zones;
 if(!Array.isArray(rows))throw Error('EASA 数据结构已改变');
 const zones=[];
 for(const row of rows){
  if(row.status!=='Active')continue;
  const parts=(row.valid_until_date||'').split('/');
  const expires=parts.length===3?Date.UTC(+parts[2],+parts[1]-1,+parts[0],23,59,59):null;
  if(expires&&expires<now)continue;
  const countries=(row.country||'').split(',').map(x=>x.trim());
  for(const country of countries){
   const feature=world.features.find(f=>f.properties.name===country||({'Russia':'Russian Federation'})[f.properties.name]===country);
   if(!feature)continue;
   zones.push({id:'easa-'+row.Nid+'-'+country,name:feature.properties.nameZh+' · 冲突风险公告',detail:row.name,kind:'air',type:'advisory',severity:.72,geometry:feature.geometry,
    source:'EASA',sourceUrl:'https://www.easa.europa.eu/en/node/'+row.Nid,expires,approximate:true,
    scopeNote:'按国家边界近似显示；公告可能仅涉及部分地区或高度，不代表整国关闭领空。'});
  }
 }
 return zones;
}
