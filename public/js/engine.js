import {distance,routeLength,positionAt,sampleRoute,remainingRoute,coord,bearing,clamp} from './geo.js';
import {conditionsAt,conditionsRisk,groundSpeed,zoneAt,random01} from './conditions.js';

export const SPECS={
 a320:{id:'a320',name:'A320neo',kind:'air',speed:830,burn:2400,tank:24000,capacity:186,reserve:.75,turn:1,lease:320000,size:2},
 b787:{id:'b787',name:'B787-9',kind:'air',speed:900,burn:5600,tank:101000,capacity:290,reserve:1,turn:1.5,lease:800000,size:3},
 a350:{id:'a350',name:'A350-900',kind:'air',speed:905,burn:6100,tank:110000,capacity:325,reserve:1,turn:1.7,lease:950000,size:3},
 helicopter:{id:'helicopter',name:'中型直升机',kind:'air',speed:240,burn:400,tank:2200,capacity:15,reserve:.5,turn:.4,lease:180000,size:1},
 amphibian:{id:'amphibian',name:'两栖水上飞机',kind:'air',speed:280,burn:280,tank:1700,capacity:19,reserve:.5,turn:.6,lease:160000,size:1},
 feeder:{id:'feeder',name:'支线集装箱船',kind:'sea',speed:31,burn:700,tank:380000,capacity:1800,reserve:12,turn:10,lease:500000,size:1},
 container:{id:'container',name:'远洋集装箱船',kind:'sea',speed:37,burn:1650,tank:1700000,capacity:12000,reserve:24,turn:18,lease:1600000,size:2},
 tanker:{id:'tanker',name:'远洋油轮',kind:'sea',speed:28,burn:1300,tank:1900000,capacity:9000,reserve:24,turn:22,lease:1800000,size:2}
};
export function supportsFacility(spec,facility){
 if(!spec||!facility||facility.closed||facility.type==='closed'||spec.kind!==facility.kind)return false;
 if(spec.kind==='sea')return true;
 if(facility.type==='heliport')return spec.id==='helicopter';
 if(facility.type==='seaplane_base')return spec.id==='amphibian';
 return true;
}
export const STATUS={scheduled:'待出发',active:'运输中',diverting:'前往备降 / 避险点',servicing:'加油与检修',completed:'已完成',cancelled:'已取消',stranded:'等待救援'};
export function levelOf(s){return s.completed>=15?4:s.completed>=8?3:s.completed>=3?2:1;}
export function logEvent(s,type,title,detail,job=null,root=null){
 const e={id:'E'+(++s.eventSeq),hour:s.hour,type,title,detail,jobId:job?.id||null,rootId:root||null};
 s.events.unshift(e);if(s.events.length>200)s.events.length=200;return e;
}
export function createState(facilities,seaRouter,environment,now=Date.now()){
 const s={version:1,id:'campaign-'+now,epoch:now,hour:0,speed:0,cash:8000000,reputation:92,completed:0,onTime:0,totalDelay:0,co2:0,revenue:0,costs:0,eventSeq:0,jobSeq:400,assetSeq:8,
  fleet:[],jobs:[],events:[],upgrades:{dispatch:0,maintenance:0,terminals:0},hubs:{},scenarioZones:[],seed:7026};
 const find=(code,kind='air')=>facilities.find(f=>f.code===code&&f.kind===kind);
 function asset(id,spec,code){const p=find(code,SPECS[spec].kind);if(p)s.fleet.push({id,spec,location:p.id,available:0,wear:0,fuel:0,job:null});}
 asset('B-OR01','a320','PVG');asset('B-OR02','b787','PVG');asset('B-OR03','a350','LHR');asset('B-OR04','b787','JFK');
 asset('MV-01','container','CNSHA');asset('MV-02','feeder','SGSIN');asset('MV-03','tanker','NLRTM');
 const ctx={facilities,byId:new Map(facilities.map(f=>[f.id,f])),environment,seaRouter};
 function add(id,origin,dest,assetId,scheduled=0,depends=null){
  const v=s.fleet.find(a=>a.id===assetId);if(!v)return;
  const kind=SPECS[v.spec].kind,a=find(origin,kind),b=find(dest,kind);if(!a||!b)return;
  let path=[coord(a),coord(b)];if(kind==='sea'){try{path=seaRouter(a,b);}catch{return;}}
  const job=makeJob(s,{origin:a.id,destination:b.id,assetId,path,charted:kind==='sea',scheduled,fuelPercent:100,depends},ctx);
  job.id=id;s.jobs.push(job);
 }
 add('OR101','PVG','SIN','B-OR01',0);
 add('OR102','SIN','PVG','B-OR01',6.2,'OR101');
 add('OR201','PVG','LAX','B-OR02',0);
 add('OR202','LAX','JFK','B-OR02',15,'OR201');
 add('OR301','LHR','JFK','B-OR03',0);
 add('OR401','JFK','LHR','B-OR04',1);
 add('OC901','CNSHA','SGSIN','MV-01',0);
 add('OC902','SGSIN','NLRTM','MV-02',12,'OR101');
 add('OC903','NLRTM','USNYC','MV-03',0);
 logEvent(s,'info','全球网络已就绪','从右侧规划新航线，或启动时间观察初始空海联运网络。所有班次均为游戏模拟。');
 return s;
}
function envFor(s,ctx){return{...ctx.environment,anchorTime:s.epoch,zones:[...(ctx.environment?.zones||[]),...s.scenarioZones]};}
export function assessRoute(path,spec,env,hour=0,fuelPercent=100,charted=false,isLand=null){
 const points=sampleRoute(path,100);let hours=0,maxRisk=0,unknown=0,land=0;const zones=new Map();
 for(let i=1;i<points.length;i++){
  const p=points[i],c=conditionsAt(env,p,hour+hours,spec.kind),risk=conditionsRisk(c,spec.kind);
  hours+=distance(points[i-1],p)/groundSpeed(spec,c,bearing(points[i-1],p));
  maxRisk=Math.max(maxRisk,risk);if(c.source!=='live')unknown++;
  for(const z of zoneAt(env,p,spec.kind,hour+hours))zones.set(z.id,z);
  if(spec.kind==='sea'&&!charted&&isLand&&distance(path[0],p)>70&&distance(path.at(-1),p)>70&&isLand(p))land++;
 }
 const fuel=hours*spec.burn*(1+(spec.kind==='sea'?.15:.06)*maxRisk),available=spec.tank*fuelPercent/100;
 const reserve=spec.burn*spec.reserve,deficit=Math.max(0,fuel+reserve-available);
 return{distance:routeLength(path),hours,fuel,reserve,available,deficit,maxRisk,zones:[...zones.values()],land,unknown:points.length>1?unknown/(points.length-1):1};
}
export function makeJob(s,input,ctx){
 const a=ctx.byId.get(input.origin),b=ctx.byId.get(input.destination),asset=s.fleet.find(v=>v.id===input.assetId);
 if(!a||!b||a.id===b.id)throw Error('请选择不同的真实出发地和目的地');
 if(!asset)throw Error('请选择可用载具');const spec=SPECS[asset.spec];
 if(a.kind!==spec.kind||b.kind!==spec.kind)throw Error('飞机需要机场，船舶需要港口');
 if(!supportsFacility(spec,a)||!supportsFacility(spec,b))throw Error('载具与设施不兼容：直升机坪需直升机，水上机场需两栖水上飞机，停用设施仅供查阅');
 if(!Array.isArray(input.path)||input.path.length<2||input.path.length>5000||input.path.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[1])>89.9||Math.abs(p[0])>180))throw Error('航线坐标无效');
 if(distance(input.path[0],a)>2||distance(input.path.at(-1),b)>2)throw Error('航线两端需要连接出发地与目的地');
 if(input.depends){const dep=s.jobs.find(j=>j.id===input.depends);if(!dep||distance(ctx.byId.get(dep.destination),a)>150)throw Error('前序班次的目的地必须在出发地 150 km 内，才可衔接货物');}
 const scheduled=Math.max(s.hour,Number(input.scheduled)||s.hour),fuelPercent=clamp(+input.fuelPercent||100,5,100);
 const est=assessRoute(input.path,spec,envFor(s,ctx),scheduled,fuelPercent,!!input.charted,ctx.isLand);
 return{id:spec.kind==='air'?'OR'+(++s.jobSeq):'OC'+(++s.jobSeq),origin:a.id,destination:b.id,assetId:asset.id,spec:spec.id,kind:spec.kind,
  path:input.path.map(p=>[...p]),originalPath:input.path.map(p=>[...p]),charted:!!input.charted,scheduled,notBefore:scheduled,plannedArrival:scheduled+est.hours,
  depends:input.depends||null,fuelPercent,status:'scheduled',progress:0,length:est.distance,position:coord(a),heading:0,fuel:0,delay:0,propagated:0,
  payload:Math.round(spec.capacity*.82),incidents:[],visitedZones:[],fuelUsed:0,originalDistance:est.distance,diversions:0,landingAt:null,handlingDone:false,unsafeLand:est.land>0};
}
export function dispatch(s,input,ctx){
 let rented=null;
 if(input.assetId?.startsWith('new:')){
  const spec=SPECS[input.assetId.slice(4)];if(!spec)throw Error('未知载具');
  if(s.cash<spec.lease)throw Error('运营资金不足，无法租入载具');
  rented={id:(spec.kind==='air'?'B-OR':'MV-')+(++s.assetSeq),spec:spec.id,location:input.origin,available:s.hour,wear:0,fuel:0,job:null};
  s.fleet.push(rented);input={...input,assetId:rented.id};
 }
 try{
  const asset=s.fleet.find(a=>a.id===input.assetId);
  const tail=s.jobs.filter(j=>j.assetId===input.assetId&&!['completed','cancelled'].includes(j.status)).at(-1);
  if(!tail&&asset?.location!==input.origin)throw Error('该载具位于其他枢纽，请先调机 / 调船，或在出发地租入新载具');
  if(tail&&tail.destination!==input.origin)throw Error('该载具前一班次的目的地与本次出发地不同');
  const job=makeJob(s,input,ctx);job.rotation=tail?.id||null;
  if(rented){s.cash-=SPECS[rented.spec].lease;s.costs+=SPECS[rented.spec].lease;}
  s.jobs.push(job);logEvent(s,'success',job.id+' 已加入调度',ctx.byId.get(job.origin).code+' → '+ctx.byId.get(job.destination).code+'；燃油 '+job.fuelPercent+'%。',job);
  return job;
 }catch(e){if(rented)s.fleet=s.fleet.filter(a=>a!==rented);throw e;}
}
export function cascade(s,job,hours,reason){
 if(hours<=0)return;
 job.delay+=hours;s.totalDelay+=hours;
 const root=logEvent(s,'warning',job.id+' · '+reason,'预计增加 '+hours.toFixed(1)+' 小时；正在检查后续班次与转运衔接。',job);
 const queue=[job.id],seen=new Set(queue);let impacted=0;
 while(queue.length){const id=queue.shift(),parent=s.jobs.find(j=>j.id===id);
  for(const child of s.jobs){if(child.status!=='scheduled'||seen.has(child.id))continue;
   if(child.depends===id||child.rotation===id||(child.assetId===parent.assetId&&child.scheduled>parent.scheduled)){
    seen.add(child.id);queue.push(child.id);child.notBefore+=hours;child.delay+=hours;child.cause=root.id;impacted++;
    logEvent(s,'cascade',child.id+' · 连锁延误','因 '+parent.id+' 延误，'+(child.assetId===parent.assetId?'载具周转':'货物衔接')+'推迟 '+hours.toFixed(1)+' 小时。',child,root.id);
   }
  }
 }
 root.impacted=impacted;s.reputation=clamp(s.reputation-Math.min(3,.4+hours*.12),0,100);
 return root;
}
function safeAlternate(s,j,ctx){
 const spec=SPECS[j.spec],env=envFor(s,ctx),range=j.fuel/spec.burn*spec.speed*.65;
 const candidates=ctx.facilities.filter(f=>supportsFacility(spec,f)&&f.size>=spec.size&&f.id!==j.landingAt)
  .map(f=>({f,d:distance(j.position,f)})).filter(x=>x.d<range&&x.d>4)
  .sort((a,b)=>a.d-b.d).slice(0,25);
 for(const {f}of candidates){
  if(zoneAt(env,coord(f),j.kind,s.hour).some(z=>z.type==='closure'||z.severity>.65))continue;
  if(conditionsRisk(conditionsAt(env,coord(f),s.hour,j.kind),j.kind)>.8)continue;
  let path=[j.position,coord(f)];try{if(j.kind==='sea')path=ctx.seaRouter(j.position,f);}catch{continue;}
  if(routeLength(path)<range)return{facility:f,path};
 }
 return null;
}
export function triggerDiversion(s,j,ctx,reason){
 if(j.status!=='active')return;
 j.incidents.push(reason);j.diversions++;j.holdUntil=null;j.handlingDone=false;
 j.terminalDiversion=/封锁|拦阻|陆地/.test(reason);
 const alt=safeAlternate(s,j,ctx);
 if(!alt){
  j.status='stranded';j.rescueAt=s.hour+(j.kind==='sea'?48:8);j.rescueFacility=j.origin;
  const reachable=ctx.facilities.filter(f=>supportsFacility(SPECS[j.spec],f)&&f.size>=SPECS[j.spec].size).sort((a,b)=>distance(a,j.position)-distance(b,j.position))[0];
  if(reachable)j.rescueFacility=reachable.id;
  cascade(s,j,j.kind==='sea'?72:18,reason+'，无可达避险点');s.cash-=j.kind==='sea'?450000:180000;
  s.costs+=j.kind==='sea'?450000:180000;s.reputation=clamp(s.reputation-10,0,100);
  logEvent(s,'danger',j.id+' · 进入应急处置',j.kind==='sea'?'船舶失去自主续航，等待救援拖带。':'无法抵达合适机场，航班中止并进入应急救援。载具将检修后再投入使用。',j);
  return;
 }
 j.status='diverting';j.resumePath=remainingRoute(j.path,j.progress);j.path=alt.path;j.progress=0;j.length=routeLength(alt.path);j.landingAt=alt.facility.id;
 cascade(s,j,j.length/(SPECS[j.spec].speed*.7)+(j.kind==='sea'?14:2.5),reason);
 logEvent(s,'danger',j.id+' · '+(j.kind==='air'?'执行备降':'驶向避险港'),(alt.facility.zh||alt.facility.name)+' · '+Math.round(j.length)+' km。'+(j.terminalDiversion?'抵达后中止原运输任务，载具检修后可重新调度。':'抵达后加油检修，再恢复原运输任务。'),j);
}
function charge(s,amount){s.cash-=amount;s.costs+=amount;}
function arrive(s,j,asset,ctx){
 const spec=SPECS[j.spec],target=j.status==='diverting'?j.landingAt:j.destination;
 const hub=s.hubs[target]||(s.hubs[target]={next:0,movements:0,upgrades:0});
 const service=spec.kind==='air'?.22:2;
 if(!j.handlingDone){
  j.handlingDone=true;const wait=Math.max(0,hub.next-s.hour);hub.next=Math.max(s.hour,hub.next)+service/(1+s.upgrades.terminals*.5);hub.movements++;
  if(wait>.05){j.holdUntil=s.hour+wait;cascade(s,j,wait,'枢纽容量占满，等待进场');return;}
 }
 if(j.holdUntil&&s.hour<j.holdUntil)return;
 if(j.status==='diverting'){
  if(j.terminalDiversion){j.status='cancelled';asset.location=target;asset.job=null;asset.available=s.hour+spec.turn*2;asset.fuel=j.fuel;charge(s,j.kind==='air'?15000:45000);logEvent(s,'warning',j.id+' · 备降 / 避港完成，原任务中止','通行受阻，载具已在 '+ctx.byId.get(target).code+' 安全退出该航段；关联班次将取消。',j);return;}
  j.status='servicing';j.serviceUntil=s.hour+(spec.kind==='air'?2.5:14)/(1+s.upgrades.maintenance*.2);asset.location=target;
  logEvent(s,'info',j.id+' · 已抵达避险点','载具正在加油与检修，预计 '+(j.serviceUntil-s.hour).toFixed(1)+' 小时后恢复。',j);
 }else{
  j.status='completed';j.arrived=s.hour;asset.location=j.destination;asset.job=null;asset.available=s.hour+spec.turn/(1+s.upgrades.dispatch*.2);
  asset.wear+=j.length/(spec.kind==='air'?50000:90000);asset.fuel=j.fuel;
  const delay=Math.max(0,s.hour-j.plannedArrival),compensation=Math.min(.8,delay/(j.kind==='air'?30:240));
  const income=j.payload*j.originalDistance*(j.kind==='air'?.13:.018)*(1-compensation);
  s.cash+=income;s.revenue+=income;s.completed++;if(delay<.5)s.onTime++;
  const prevLevel=levelOf({...s,completed:s.completed-1});
  s.reputation=clamp(s.reputation+(delay<.5?.5:-.2),0,100);
  logEvent(s,'success',j.id+' · 运输完成','实际延误 '+delay.toFixed(1)+' 小时，运费收入 $'+Math.round(income).toLocaleString()+'。载具进入周转。',j);
  if(levelOf(s)>prevLevel)logEvent(s,'success','网络成长 · 第 '+levelOf(s)+' 阶段','新的经营挑战与基础设施投资已开放。完成更多班次，提高系统韧性。');
 }
}
function startJob(s,j,a,ctx){
 const spec=SPECS[j.spec];j.status='active';j.departed=s.hour;a.job=j.id;a.location=null;
 const wanted=spec.tank*j.fuelPercent/100;j.fuel=wanted;charge(s,Math.max(0,wanted-(a.fuel||0))*(j.kind==='air'?.86:.55));
 a.fuel=0;j.position=coord(ctx.byId.get(j.origin));
 const late=Math.max(0,s.hour-j.scheduled);
 if(late>j.delay+.25)cascade(s,j,late-j.delay,'前序周转未完成');
 logEvent(s,'info',j.id+' · 已出发',ctx.byId.get(j.origin).code+' → '+ctx.byId.get(j.destination).code,j);
}
function step(s,dt,ctx){
 s.hour+=dt;const env=envFor(s,ctx);
 for(const j of s.jobs){
  if(['completed','cancelled'].includes(j.status))continue;
  const asset=s.fleet.find(a=>a.id===j.assetId),spec=SPECS[j.spec];if(!asset)continue;
  if(j.status==='scheduled'){
   if(s.hour<j.notBefore||asset.job||asset.available>s.hour)continue;
   const deps=[j.depends,j.rotation].filter(Boolean).map(id=>s.jobs.find(x=>x.id===id)).filter(Boolean);
   if(deps.some(dep=>dep.status==='cancelled')){
    j.status='cancelled';logEvent(s,'cascade',j.id+' · 前序中止，取消运输','衔接的载具或货物无法抵达。',j);continue;
   }
   if(deps.some(dep=>dep.status!=='completed'||s.hour<dep.arrived+(dep.kind!==j.kind?3:.25)))continue;
   if(asset.location!==j.origin)continue;
   if(asset.wear>.8){asset.available=s.hour+spec.turn*4;asset.wear=0;charge(s,spec.lease*.035);cascade(s,j,spec.turn*4,'载具需要定期维护');continue;}
   startJob(s,j,asset,ctx);continue;
  }
  if(j.status==='stranded'){
   if(s.hour>=j.rescueAt){j.status='cancelled';asset.job=null;asset.location=j.rescueFacility;asset.available=s.hour+24;asset.wear=.6;
    logEvent(s,'warning',j.id+' · 救援结束，运输中止','载具已转移至 '+(ctx.byId.get(asset.location)?.code||'应急基地')+'，检修 24 小时；后续衔接将取消。',j);}
   continue;
  }
  if(j.status==='servicing'){
   if(s.hour<j.serviceUntil)continue;
   charge(s,Math.max(0,spec.tank-j.fuel)*(j.kind==='air'?.98:.65)+5000);j.fuel=spec.tank;
   const dest=ctx.byId.get(j.destination);let path;
   if(j.kind==='sea'){try{path=ctx.seaRouter(j.position,dest,p=>zoneAt(env,p,'sea',s.hour).length>0);}catch{path=[j.position,coord(dest)];j.charted=false;}}
   else path=[j.position,...(j.resumePath||[]).slice(1)];if(!path||path.length<2)path=[j.position,coord(dest)];
   j.path=path;j.length=routeLength(path);j.progress=0;j.status='active';j.handlingDone=false;j.holdUntil=null;j.landingAt=null;j.lastDiversion=s.hour;
   logEvent(s,'info',j.id+' · 恢复运输','加油检修完成，继续前往原定目的地。',j);continue;
  }
  if(j.holdUntil){const holding=spec.burn*dt*(j.kind==='air'?.65:.12);j.fuel=Math.max(0,j.fuel-holding);j.fuelUsed+=holding;s.co2+=holding*3.16/1000;if(j.fuel<spec.burn*spec.reserve&&j.holdUntil>s.hour+.1&&j.status==='active'){triggerDiversion(s,j,ctx,'进场等待耗油导致备份燃油不足');continue;}arrive(s,j,asset,ctx);continue;}
  const c=conditionsAt(env,j.position,s.hour,j.kind),speed=groundSpeed(spec,c,j.heading);
  const move=Math.min(speed*dt,Math.max(0,j.length-j.progress)),duration=move/speed;
  const old=j.position,newPosition=positionAt(j.path,j.progress+move);
  const burn=spec.burn*duration*(1+conditionsRisk(c,j.kind)*.1+asset.wear*.04);
  j.fuel=Math.max(0,j.fuel-burn);j.fuelUsed+=burn;s.co2+=burn*3.16/1000;j.progress+=move;j.position=newPosition.point;j.heading=newPosition.heading;
  if(j.status==='active'&&s.hour-(j.lastDiversion??-100)>1){
   const remaining=j.length-j.progress,needed=remaining/speed*spec.burn+spec.burn*spec.reserve;
   if(j.fuel<needed&&j.fuel<(spec.kind==='air'?4:72)*spec.burn&&remaining>spec.speed*.15){
    triggerDiversion(s,j,ctx,'燃油低于续航及备份要求');continue;
   }
   let incident=false;
   for(const p of sampleRoute([old,j.position],25)){
    if(j.kind==='sea'&&!j.charted&&ctx.isLand?.(p)&&distance(p,ctx.byId.get(j.origin))>70&&distance(p,ctx.byId.get(j.destination))>70){
     triggerDiversion(s,j,ctx,'自定航线触及陆地，航道不可通行');incident=true;break;
    }
    for(const z of zoneAt(env,p,j.kind,s.hour)){
     if(j.visitedZones.includes(z.id))continue;j.visitedZones.push(z.id);
     if(z.type==='closure'||random01(s.seed+s.eventSeq+j.id.length+Math.floor(s.hour*10))<z.severity){
      triggerDiversion(s,j,ctx,z.type==='closure'?'临时封锁，运输被迫折返':'高风险区域拦阻，必须避让');incident=true;break;
     }
    }
    if(incident)break;
   }
   if(incident)continue;
   const risk=conditionsRisk(c,j.kind);
   if(risk>.5&&random01(s.seed+Math.round(s.hour*60)+j.id.charCodeAt(j.id.length-1)*31)<(1-Math.exp(-risk*.5*dt))){
    triggerDiversion(s,j,ctx,j.kind==='air'?'强对流 / 低能见度导致备降':'恶劣海况导致避风');continue;
   }
  }
  if(j.fuel<=0&&j.progress<j.length-.1){j.status='active';triggerDiversion(s,j,ctx,'燃油耗尽');continue;}
  if(j.progress>=j.length-.01)arrive(s,j,asset,ctx);
 }
 s.scenarioZones=s.scenarioZones.filter(z=>z.untilHour==null||z.untilHour>s.hour);
}
export function advance(s,hours,ctx){
 if(!Number.isFinite(hours)||hours<0||hours>168)throw Error('时间步长需在 0–168 小时内');
 while(hours>1e-8){const dt=Math.min(1/12,hours);step(s,dt,ctx);hours-=dt;}
 if(!Number.isFinite(s.cash))throw Error('运营资金出现无效值');
}
export function upgrade(s,type){
 const cost={dispatch:250000,maintenance:350000,terminals:500000}[type];
 if(!cost)throw Error('未知升级');if(s.upgrades[type]>=3)throw Error('已达到最高等级');
 if(levelOf(s)<2)throw Error('完成 3 个班次后开放基础设施投资');
 const price=cost*(s.upgrades[type]+1);if(s.cash<price)throw Error('资金不足');charge(s,price);s.upgrades[type]++;
 logEvent(s,'success','基础设施投资完成',{dispatch:'周转效率',maintenance:'维护效率',terminals:'机场与港口容量'}[type]+'提升至 '+s.upgrades[type]+' 级。');
}
export function injectScenario(s,type,ctx){
 const job=s.jobs.find(j=>j.status==='active'&&(type==='port'?j.kind==='sea':j.kind==='air'))||s.jobs.find(j=>j.status==='active');
 if(!job)throw Error('请先启动模拟，让至少一个班次出发');
 if(type==='fuel'){job.fuel=Math.min(job.fuel,SPECS[job.spec].burn*1.4);logEvent(s,'warning','演练 · 燃油系统故障',job.id+' 可用燃油下降，下一时间步将触发处置。',job);return;}
 const pos=positionAt(job.path,Math.min(job.length,job.progress+SPECS[job.spec].speed*.3)).point;
 s.scenarioZones.push({id:'scenario-'+(++s.eventSeq),name:'演练 · 临时通行限制',center:pos,radius:job.kind==='air'?400:160,severity:1,type:'closure',kind:job.kind,source:'scenario',untilHour:s.hour+24});
 logEvent(s,'warning','演练 · 临时封锁区域已生效','区域位于 '+job.id+' 前方，将持续 24 个游戏小时。',job);
}
export function validateSave(s){
 if(!s||s.version!==1||!Array.isArray(s.jobs)||!Array.isArray(s.fleet)||!Array.isArray(s.events)||s.jobs.length>2000||s.fleet.length>500)throw Error('不是受支持的 ORBIS 存档');
 for(const k of ['hour','cash','epoch','completed','reputation','eventSeq','jobSeq','assetSeq','seed'])if(!Number.isFinite(s[k]))throw Error('存档数值无效：'+k);
 if(s.hour<0||s.hour>1e7||!s.upgrades||!s.hubs||!Array.isArray(s.scenarioZones))throw Error('存档结构不完整');
 const assetIds=new Set(s.fleet.map(a=>a.id));if(assetIds.size!==s.fleet.length)throw Error('载具编号重复');
 for(const a of s.fleet)if(!SPECS[a.spec]||!Number.isFinite(a.available)||!Number.isFinite(a.wear))throw Error('载具数据无效');
 for(const j of s.jobs){
  if(!SPECS[j.spec]||!STATUS[j.status]||!assetIds.has(j.assetId)||!Array.isArray(j.path)||j.path.length<2||j.path.length>5000)throw Error('班次数据无效');
  for(const p of j.path)if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90)throw Error('航线坐标无效');
  for(const k of ['progress','length','fuel','scheduled','plannedArrival'])if(!Number.isFinite(j[k])||j[k]<0)throw Error('班次数值无效');
 }
 s.speed=0;return s;
}
