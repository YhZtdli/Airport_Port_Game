import{createWorldMap}from'./map.js';
import{icon,esc,fillIcons}from'./icons.js';
import{coord,distance,routeLength,createSeaRouter,landIndex,sampleRoute,clamp}from'./geo.js';
import{SPECS,STATUS,createState,advance,assessRoute,dispatch,levelOf,injectScenario,upgrade,validateSave,logEvent,cascade,supportsFacility}from'./engine.js';
import{facilityName,regionalText}from'./geography.js';
import{createFacilityIndex}from'./facility-search.js';
import{bindFacilityPicker}from'./facility-picker.js';
import{createRuntime}from'./runtime.js';
const pickers={};
let runtime,mutation=0;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const money=n=>'$'+(Math.abs(n)>=1e6?(n/1e6).toFixed(2)+'M':Math.round(n).toLocaleString());
const hours=n=>n>=48?(n/24).toFixed(1)+' 天':n.toFixed(1)+' h';
const date=n=>new Date(n).toISOString().slice(0,16).replace('T','  ');
const label=f=>facilityName(f)+' · '+f.code;
let state,ctx,mapView,catalog,environment,revision=0,filter='all',lastSpeed=96,toastTimer,saveBusy=false,saveConflict=false,dirty=false,lastOverlay=0;
let plan={kind:'air',origin:null,destination:null,waypoints:[],path:null,charted:false,drawing:false,editing:null};
const terminalStatuses=new Set(['completed','cancelled']);
async function api(url,method='GET',data){return runtime.request(url,method,data);}
function toast(message,error=false){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').className='toast'+(error?' error':'');toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),4500);}
function changed(){dirty=true;mutation++;render();}
function envNow(){return{...environment,anchorTime:state.epoch,zones:[...(environment.zones||[]),...state.scenarioZones]};}
function draftPath(){
 const a=ctx.byId.get(plan.origin),b=ctx.byId.get(plan.destination);if(!a||!b)return[];
 const edit=state.jobs.find(j=>j.id===plan.editing);const origin=edit?.status==='active'?edit.position:coord(a);
 return plan.charted&&plan.path?plan.path:[origin,...plan.waypoints,coord(b)];
}
function selectedSpec(){const id=$('#asset-select').value;return id.startsWith('new:')?SPECS[id.slice(4)]:SPECS[state.fleet.find(a=>a.id===id)?.spec]||SPECS[plan.kind==='air'?'a320':'feeder'];}
function renderAssets(){
 const select=$('#asset-select'),old=select.value;
 select.innerHTML=Object.values(SPECS).filter(s=>s.kind===plan.kind).map(s=>'<option value="new:'+s.id+'">租入 '+esc(s.name)+' · '+money(s.lease)+'</option>').join('');
 for(const a of state.fleet.filter(a=>SPECS[a.spec].kind===plan.kind)){
  const tail=state.jobs.filter(j=>j.assetId===a.id&&!terminalStatuses.has(j.status)).at(-1);
  const location=ctx.byId.get(tail?.destination||a.location);
  const option=document.createElement('option');option.value=a.id;option.textContent=a.id+' / '+SPECS[a.spec].name+' · '+(location?.code||'运输中')+(tail?' 后续可用':'');select.append(option);
 }
 if([...select.options].some(o=>o.value===old))select.value=old;
 if(plan.editing){const j=state.jobs.find(j=>j.id===plan.editing);if(j)select.value=j.assetId;}
 select.disabled=!!plan.editing;
 const deps=$('#dependency-select'),oldDep=deps.value;
 deps.innerHTML='<option value="">独立出发</option>'+state.jobs.filter(j=>plan.origin&&j.status!=='cancelled'&&distance(ctx.byId.get(j.destination),ctx.byId.get(plan.origin))<150).map(j=>'<option value="'+esc(j.id)+'">'+esc(j.id)+' → '+esc(ctx.byId.get(j.destination).code)+'</option>').join('');
 deps.value=oldDep;
}
function syncFields(){
 for(const key of['origin','destination'])$('#'+key+'-input').value=ctx.byId.get(plan[key])?label(ctx.byId.get(plan[key])):'';
 const edit=state.jobs.find(j=>j.id===plan.editing);
 $('#origin-input').disabled=!!edit;$('#fuel-slider').disabled=edit?.status==='active';
 $('#dispatch-button').innerHTML=icon('plus')+(edit?'确认修改航线':'加入调度网络')+'<span>↗</span>';
 renderAssets();renderPlan();
}
function resetDraft(){plan.waypoints=[];plan.path=null;plan.charted=false;}
function chooseFacility(key,f){
 if(f.closed)return toast('该设施已停用，仅供查阅',true);
 if(plan.editing&&key==='origin')return;
 Object.values(pickers).forEach(p=>p.reset());
 if(f.kind!==plan.kind){plan.kind=f.kind;plan.origin=null;plan.destination=null;plan.editing=null;resetDraft();$$('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===f.kind));}
 plan[key]=f.id;resetDraft();$('#'+key+'-results').classList.add('hidden');syncFields();
 if(!plan.editing&&!supportsFacility(selectedSpec(),f)){
  const suitable=Object.values(SPECS).find(s=>s.kind===plan.kind&&[plan.origin,plan.destination].filter(Boolean).every(id=>supportsFacility(s,ctx.byId.get(id))));
  if(suitable){$('#asset-select').value='new:'+suitable.id;renderPlan();toast('已匹配 '+suitable.name+'，可在载具选项中调整');}
 }
}
function renderPlan(){
 const path=draftPath(),spec=selectedSpec(),editing=state.jobs.find(j=>j.id===plan.editing);
 const fuelPercent=editing?.status==='active'?editing.fuel/spec.tank*100:+$('#fuel-slider').value;
 $('#fuel-value').textContent=Math.round(fuelPercent)+'%';
 $('#waypoint-count').textContent=plan.charted?'航路网络':plan.waypoints.length;
 $('#waypoint-list').innerHTML=plan.waypoints.map((p,i)=>'<div class="waypoint-item"><span>'+(i+1)+'</span>'+p[1].toFixed(2)+'°, '+p[0].toFixed(2)+'°<button data-remove-point="'+i+'" aria-label="删除途经点">×</button></div>').join('');
 if(plan.charted)$('#waypoint-list').innerHTML='<div class="source-note">已沿海运网络生成 '+Math.max(0,path.length-2)+' 个航路节点。</div>';
 mapView?.setDraft(path,plan.waypoints);
 if(path.length<2){$('#route-estimate').innerHTML='<span class="muted">选择两个设施以评估航线</span>';$('#route-warnings').innerHTML='';return;}
 const a=assessRoute(path,spec,envNow(),state.hour+(+$('#departure-offset').value||0),fuelPercent,plan.charted,ctx.isLand);
 $('#route-estimate').innerHTML='<div><label>总航程</label><strong>'+Math.round(a.distance).toLocaleString()+' <small>km</small></strong></div><div><label>预计用时</label><strong>'+hours(a.hours)+'</strong></div><div><label>预计耗油</label><strong>'+(a.fuel/1000).toFixed(1)+' <small>t</small></strong></div><div><label>安全备份燃油</label><strong>'+(a.reserve/1000).toFixed(1)+' <small>t</small></strong></div>';
 const warnings=[];
 const compatible=[plan.origin,plan.destination].every(id=>supportsFacility(spec,ctx.byId.get(id)));
 if(!compatible)warnings.push(['danger','载具与设施类型不兼容：直升机坪需直升机，水上机场需两栖水上飞机；停用设施不能调度。']);
 if(a.deficit>0)warnings.push(['danger','燃油缺口 '+(a.deficit/1000).toFixed(1)+' t，可能需要中途加油 / 备降。']);
 if(a.land)warnings.push(['danger','自定海运路线穿过陆地，将触发停航或避险。']);
 if(a.zones.length)warnings.push(['danger','经过 '+a.zones.length+' 处风险区域：'+a.zones.slice(0,2).map(z=>z.name).join('、')]);
 if(a.maxRisk>.4)warnings.push(['','沿途天气 / 海况风险较高。']);
 if(a.unknown>.1)warnings.push(['',Math.round(a.unknown*100)+'% 路段使用过期预报或演练外推。']);
 if(!warnings.length)warnings.push(['good','当前采样未发现显著风险，仍需保留备份燃油。']);
 $('#route-warnings').innerHTML=warnings.map(([type,text])=>'<div class="warning-line '+type+'">'+icon(type==='good'?'check':'alert')+'<span>'+esc(text)+'</span></div>').join('');
}
function bindSearch(key){
 pickers[key]=bindFacilityPicker({input:$('#'+key+'-input'),result:$('#'+key+'-results'),index:ctx.searchIndex,
  getKind:()=>plan.kind,getSelected:()=>ctx.byId.get(plan[key]),onSelect:f=>chooseFacility(key,f)});
}
function setDrawing(value){plan.drawing=value;$('#drawing-hint').classList.toggle('hidden',!value);$('#draw-route').classList.toggle('drawing',value);mapView.setDrawing(value);}
function render(){
 if(!state)return;
 $('#sim-clock').textContent=date(state.epoch+state.hour*3600000);
 $('#pause-button').textContent=state.speed?'Ⅱ':'▶';
 $('#air-stat').innerHTML=state.jobs.filter(j=>j.kind==='air'&&['active','diverting'].includes(j.status)).length+' <small>班执行中</small>';
 $('#sea-stat').innerHTML=state.jobs.filter(j=>j.kind==='sea'&&['active','diverting'].includes(j.status)).length+' <small>班执行中</small>';
 $('#cash-stat').textContent=money(state.cash);$('#reputation-stat').textContent='信誉 '+Math.round(state.reputation);
 $('#ontime-stat').innerHTML=state.completed?Math.round(state.onTime/state.completed*100)+'% <small>'+state.completed+' 班完成</small>':'— <small>等待首班</small>';
 $('#job-count').textContent=state.jobs.length;
 const issues=state.jobs.filter(j=>!terminalStatuses.has(j.status)&&(j.delay>.25||['diverting','servicing','stranded'].includes(j.status)));
 $('#issues-count').textContent=issues.length;
 const jobs=state.jobs.filter(j=>filter==='all'||filter==='issues'?filter==='all'||issues.includes(j):j.kind===filter);
 $('#jobs-table').innerHTML=jobs.map(j=>{
  const a=ctx.byId.get(j.origin),b=ctx.byId.get(j.destination),pct=clamp(j.progress/j.length*100,0,100),fuel=j.status==='scheduled'?j.fuelPercent:clamp(j.fuel/SPECS[j.spec].tank*100,0,100);
  return'<tr><td><span class="job-icon '+j.kind+'">'+icon(j.kind==='air'?'plane':'ship')+'</span><strong>'+esc(j.id)+'</strong><small>'+esc(j.assetId)+' · '+esc(SPECS[j.spec].name)+'</small></td><td><div class="route-code"><strong>'+esc(a?.code)+'</strong><span>→</span><strong>'+esc(b?.code)+'</strong></div><small>'+esc(facilityName(a))+' — '+esc(facilityName(b))+'</small></td><td><div class="progress-track '+j.kind+'"><i style="width:'+pct+'%"></i></div><div class="progress-sub"><span>'+Math.round(pct)+'%</span><span>'+hours(Math.max(0,j.length-j.progress)/SPECS[j.spec].speed)+'</span></div></td><td><span class="fuel-track '+(fuel<25?'low':'')+'"><i style="width:'+fuel+'%"></i></span>'+Math.round(fuel)+'%</td><td><span class="status-pill '+j.status+'"><i></i>'+esc(STATUS[j.status])+'</span>'+(j.delay>.25?'<small class="danger-text">延误 +'+hours(j.delay)+'</small>':'')+'</td><td><button class="text-button" data-job="'+esc(j.id)+'" aria-label="查看 '+esc(j.id)+' 详情">↗</button></td></tr>';
 }).join('')||'<tr><td colspan="6" class="empty-state">暂无符合条件的班次</td></tr>';
 $('#network-summary').textContent=state.fleet.length+' 部载具 · '+state.jobs.filter(j=>!terminalStatuses.has(j.status)).length+' 个未完成班次 · 事件 '+state.events.length;
 const level=levelOf(state);$('#growth-label').textContent='阶段 0'+level+' · '+['建立连接','联运网络','枢纽运营','全球调度'][level-1];
 mapView.updateTraffic(state);
 if(Date.now()-lastOverlay>5000){lastOverlay=Date.now();mapView.overlay(environment,state);}
 renderDataStatus();
}
function renderDataStatus(){
 const values=Object.values(environment.sources||{}),fresh=values.filter(s=>s.status==='live'&&Date.now()-(s.at||0)<12*3600000).length;
 $('#data-status').innerHTML='<span class="small-dot '+(fresh===3?'green':'amber-dot')+'"></span>'+(environment.refreshing?'世界数据同步中…':fresh===3?'世界数据已同步':'世界数据 '+fresh+'/3 已同步 · 含缓存 / 演练')+' · 12h 更新';
}
function modal(title,html){
 $('#modal-title').textContent=title;$('#modal-content').innerHTML=html;fillIcons($('#modal-content'));if(!$('#modal').open)$('#modal').showModal();
}
function showEvents(jobId=null){
 const rows=state.events.filter(e=>!jobId||e.jobId===jobId||state.events.find(r=>r.id===e.rootId)?.jobId===jobId);
 modal(jobId?jobId+' · 事件与连锁影响':'网络事件 · 每一步决策的回响',
  '<p>同一架飞机、同一艘船和转运货物会把一次意外传递给后续班次。点击班次可查看具体原因。</p>'+
  rows.map(e=>'<div class="event-row '+esc(e.type)+'"><div class="event-time">D'+(Math.floor(e.hour/24)+1)+' / '+(e.hour%24).toFixed(1)+'h</div><div class="event-body"><b>'+esc(e.title)+(e.impacted?' · 影响 '+e.impacted+' 个班次':'')+'</b><p>'+esc(regionalText(e.detail))+'</p>'+(e.rootId?'<small>源事件 '+esc(e.rootId)+'</small>':'')+'</div></div>').join(''));
}
function showJob(id){
 const j=state.jobs.find(j=>j.id===id);if(!j)return;
 mapView.focusJob(j);
 const a=ctx.byId.get(j.origin),b=ctx.byId.get(j.destination),asset=state.fleet.find(v=>v.id===j.assetId);
 const next=state.jobs.filter(x=>x.depends===id||x.rotation===id||(x.assetId===j.assetId&&x.scheduled>j.scheduled));
 modal(j.id+' · '+facilityName(a)+' → '+facilityName(b),
 '<div class="modal-grid"><div class="info-card"><h3>运行状态</h3><span class="stat">'+esc(STATUS[j.status])+'</span><p>'+esc(j.assetId)+' / '+esc(SPECS[j.spec].name)+'</p><p>计划出发：'+date(state.epoch+j.scheduled*3600000)+' UTC<br>计划抵达：'+date(state.epoch+j.plannedArrival*3600000)+' UTC<br>预计延误：'+hours(j.delay)+'</p></div><div class="info-card"><h3>任务与资源</h3><p>计划距离：'+Math.round(j.originalDistance).toLocaleString()+' km<br>已用燃油：'+(j.fuelUsed/1000).toFixed(1)+' t<br>当前燃油：'+(j.fuel/1000).toFixed(1)+' t<br>运载量：'+j.payload+' '+(j.kind==='air'?'人':'货运单位')+'<br>载具维护压力：'+Math.round(asset.wear*100)+'%</p></div></div>'+
 '<h3>衔接关系</h3><div class="connection-chain">'+(j.depends?'<div class="chain-node">'+esc(j.depends)+'</div> → ':'')+'<div class="chain-node">'+esc(j.id)+'</div>'+next.map(n=>' → <div class="chain-node">'+esc(n.id)+'</div>').join('')+'</div>'+
 (j.status==='scheduled'&&asset.location!==j.origin&&!asset.job?'<p class="danger-text">载具尚不在出发地，需要前序调机 / 调船抵达。</p>':'')+
 '<div class="modal-actions"><button data-action="job-events" data-id="'+esc(j.id)+'">查看事件影响</button>'+
 (['scheduled','active'].includes(j.status)?'<button data-action="edit-job" data-id="'+esc(j.id)+'">'+(j.status==='active'?'接管并修改在途航线':'修改待出发航线')+'</button>':'')+
 (j.status==='scheduled'?'<button data-action="cancel-job" data-id="'+esc(j.id)+'">取消班次</button>':'')+'</div>');
}
function showIntel(){
 const statusNames={live:'已同步',stale:'过期缓存',offline:'离线演练',cache:'文件快照'};
 modal('世界情报与数据来源',
 '<p>'+(runtime.mode==='static'?'天气与洋流使用公共全球采样。网站计划每 12 个真实小时更新一次数据快照；游戏计算和存档在你的浏览器中完成。':'天气与洋流使用全球稀疏采样，在用航线参与下一次加密采样。每 12 个真实小时更新一次；游戏加速不会加快外部数据更新。')+'</p>'+
 '<div class="modal-grid">'+[['weather','天气预报 · Open-Meteo'],['marine','海况与洋流 · Open-Meteo'],['conflict','冲突公告 · EASA']].map(([key,name])=>{
 const source=environment.sources?.[key]||{status:'offline'};
 return'<div class="info-card"><h3>'+name+'<span class="source-status '+esc(source.status)+'">'+(statusNames[source.status]||'未知')+'</span></h3><p>上次成功：'+(source.at?date(source.at)+' UTC':'未记录')+'<br>样本 / 区域：'+(source.count||0)+'</p><div class="source-note">'+esc(source.message||'无法连接时使用明确标注的演练模型。')+'</div></div>';
 }).join('')+'<div class="info-card"><h3>真实设施目录</h3><p>'+catalog.landAirports.toLocaleString()+' 处陆地机场<br>'+catalog.airportTypes.heliport.toLocaleString()+' 处直升机起降点<br>'+catalog.airportTypes.seaplane_base.toLocaleString()+' 处水上机场<br>'+catalog.closedAirports.toLocaleString()+' 条停用设施记录（仅供查阅）<br>'+catalog.ports.toLocaleString()+' 个港口<br>整理于 '+date(Date.parse(catalog.preparedAt))+' UTC</p></div></div>'+
 '<div class="modal-actions"><button data-action="refresh-data">立即更新世界数据</button><button data-action="policy">添加演练通行限制</button></div>'+
 '<p class="source-note">下一次自动检查：'+(environment.nextUpdate?date(environment.nextUpdate)+' UTC':'服务启动后')+'。'+(runtime.mode==='static'?'更新由网站的 GitHub Actions 执行，可能延迟；以各来源成功时间为准。点击更新会读取网站最新快照。':'服务需保持运行；关闭电脑期间暂停，重启后检查补更。')+'预报之外的未来使用外推并标注。</p>'+
 '<h3>当前公告 · 国家边界近似显示</h3><p>冲突公告不是全球禁飞令。这里不包含全球 NOTAM、国家实时许可或商业航行警报。公告可能仅针对部分地区、高度或运营主体，游戏用风险机制近似处理。</p>'+
 (environment.zones||[]).map(z=>'<div class="policy-item"><a href="'+esc(z.sourceUrl)+'" target="_blank" rel="noreferrer">'+esc(z.name)+' ↗</a><div class="source-note">'+esc(z.detail)+' · 有效期 '+(z.expires?date(z.expires).slice(0,10):'未注明')+'</div></div>').join('')+
 '<h3>来源与许可</h3>'+catalog.sources.map(s=>'<p><a href="'+esc(s.url)+'" target="_blank" rel="noreferrer">'+esc(s.name)+' ↗</a> · '+esc(s.license)+'<br><span class="source-note">'+esc(s.coverage)+'</span></p>').join(''));
}
function showCompany(){
 const level=levelOf(state),next=[3,8,15,30][level-1];
 modal('经营与成长 · 让网络更有韧性',
 '<div class="modal-grid"><div class="info-card"><h3>可用资金</h3><span class="stat">'+money(state.cash)+'</span><p>累计收入 '+money(state.revenue)+'<br>燃油、租赁与处置成本 '+money(state.costs)+'</p></div><div class="info-card"><h3>网络成长 · 阶段 '+level+'</h3><span class="stat">'+state.completed+' / '+next+'</span><p>完成 3 班开放投资；8 班进入枢纽经营；15 班进入全球调度。<br>信誉 '+state.reputation.toFixed(1)+' · CO₂ 约 '+Math.round(state.co2).toLocaleString()+' t</p></div></div>'+
 '<h3>基础设施投资</h3><div class="modal-grid">'+[['dispatch','周转调度','缩短到港后下一班次的准备时间。',250000],['maintenance','维护团队','缩短备降与避险后的检修时间。',350000],['terminals','枢纽容量','提高机场进场与港口处理能力。',500000]].map(([key,name,desc,cost])=>'<div class="info-card"><h3>'+name+' · Lv '+state.upgrades[key]+'</h3><p>'+desc+'</p><button data-action="upgrade" data-key="'+key+'">投资 '+money(cost*(state.upgrades[key]+1))+'</button></div>').join('')+'</div>'+
 '<h3>载具与位置</h3><table><thead><tr><th>载具</th><th>型号</th><th>当前位置 / 班次</th><th>维护压力</th></tr></thead><tbody>'+state.fleet.map(a=>'<tr><td>'+esc(a.id)+'</td><td>'+esc(SPECS[a.spec].name)+'</td><td>'+esc(a.job||ctx.byId.get(a.location)?.code||'运输中')+'</td><td>'+Math.round(a.wear*100)+'%</td></tr>').join('')+'</tbody></table>'+
 '<h3>存档管理</h3><p>'+esc(runtime.saveDescription)+' 定期自动保存，也可手动保存。重新打开时从暂停状态继续。</p><div class="modal-actions"><button data-action="save">立即保存</button><button data-action="export">导出存档</button><button data-action="import">导入存档</button><button data-action="new-game">建立新网络</button></div>');
}
function showGuide(){
 modal('欢迎来到 ORBIS',
 '<p>这里是一张真实的世界地图，也是一张由你的决策构成的运输网络。地图上的飞机和船舶是模拟班次。</p>'+
 '<div class="modal-grid"><div class="info-card"><h3>01 / 选择两座真实枢纽</h3><p>输入“丹麦”展开行政区和城市，再选择机场；输入“北京”列出首都、大兴等设施。保留名称、IATA / ICAO 代码搜索，列表底部可加载更多。也可点地图设置起终点。</p></div><div class="info-card"><h3>02 / 自己决定怎么走</h3><p>选择载具，直升机坪需直升机，水上机场需两栖水上飞机。在地图添加并拖动途经点。航空推荐为大圆线，海运推荐沿开放航路网络。调低燃油或经过风险区域仍可出发。</p></div><div class="info-card"><h3>03 / 启动时间，观察后果</h3><p>1× 为每真实秒推进 1 个游戏分钟。96× 适合航班，720× 适合远洋航运。暂停时可继续规划，+6h 可跳进。</p></div><div class="info-card"><h3>04 / 每一次延误都会传递</h3><p>共用载具会等待前序任务；出发地 150 km 内的前序班次可衔接货物，空海转运至少需要 3 小时。枢纽也会排队。</p></div></div>'+
 '<h3>开始一次可观察的演练</h3><p>启动模拟后，在“风险演练”中注入燃油故障或临时封锁。打开“事件与影响”，观察 OR101 → OR102 与 OC902 的空海联运延误。</p>'+
 '<h3>真实性的边界</h3><p>本版使用真实设施与地理、公开气象和洋流预报、EASA 冲突公告。载具性能、油耗、迫降概率、需求与费用是透明的游戏近似。地图不是航图，海岸和港口进出线是近似；不包含真实 ADS-B / AIS 班次、完整 NOTAM、双边航权、跑道与吃水限制。</p><p>网页载入后，断网可继续本次模拟。数据更新时间和缓存 / 演练来源可在“情报”查看。预报只有有限时域，加速到未来时会标注过期或外推。</p>'+
 '<div class="modal-actions"><button data-action="intel">查看数据来源</button><button data-action="close">开始规划</button></div>');
}
function showExercise(){
 modal('风险演练 · 观察连锁反应','<p>这些事件由你主动注入，仅属于游戏情景。建议在班次刚出发时触发，再推进 6 小时观察下游影响。</p><div class="modal-grid"><div class="info-card"><h3>燃油故障</h3><p>减少首个执行中航班的可用燃油，触发备降或救援。</p><button data-action="exercise" data-type="fuel">注入燃油故障</button></div><div class="info-card"><h3>临时领空封锁</h3><p>在执行中航班前方设置 24 小时演练限制区。</p><button data-action="exercise" data-type="closure">注入领空限制</button></div><div class="info-card"><h3>海上通道封锁</h3><p>在船舶前方设置 24 小时演练封锁区，触发避港。</p><button data-action="exercise" data-type="port">注入海上限制</button></div></div>');
}
function showPolicy(){
 modal('自定义演练通行限制','<p>添加游戏内临时区域，可模拟战争、外交封锁或海运管制。区域会明确标注“演练”，不会冒充官方公告。</p><div class="modal-grid"><div class="field"><label>区域名称</label><input id="policy-name" value="临时通行限制" maxlength="80"></div><div class="field"><label>适用运输</label><select id="policy-kind"><option value="air">航空</option><option value="sea">海运</option><option value="both">空海同时</option></select></div><div class="field"><label>中心经度</label><input id="policy-lon" type="number" min="-180" max="180" value="45"></div><div class="field"><label>中心纬度</label><input id="policy-lat" type="number" min="-85" max="85" value="30"></div><div class="field"><label>半径 / km</label><input id="policy-radius" type="number" min="20" max="3000" value="450"></div><div class="field"><label>持续 / 游戏小时</label><input id="policy-duration" type="number" min="1" max="720" value="24"></div></div><button class="primary-button" data-action="add-policy">使演练区域生效</button>');
}
async function save(manual=false){
 if(saveBusy||saveConflict)return;if(!dirty&&!manual)return;saveBusy=true;
 try{const savingMutation=mutation,snapshot=structuredClone(state);snapshot.speed=0;const out=await api('/api/save','PUT',{revision,state:snapshot});revision=out.revision;dirty=mutation!==savingMutation;if(manual)toast(runtime.savedMessage);}
 catch(e){if(e.status===409){saveConflict=true;state.speed=0;toast(e.message,true);}else if(manual)toast('保存失败：'+e.message,true);}
 finally{saveBusy=false;}
}
function editJob(j){
 state.speed=0;plan={kind:j.kind,origin:j.origin,destination:j.destination,waypoints:[],path:j.status==='active'?null:j.path,charted:j.status==='scheduled'&&j.charted,drawing:false,editing:j.id};
 if(j.status==='scheduled'&&!j.charted)plan.waypoints=j.path.slice(1,-1);
 $('#fuel-slider').value=j.fuelPercent;$$('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===j.kind));$('#modal').close();syncFields();toast('修改模式：'+j.id+'。切换航空 / 海运可退出修改。');render();
}
async function submitPlan(){
 if(!plan.origin||!plan.destination)throw Error('请先选择出发地和目的地');
 const path=draftPath();if(!path.length||routeLength(path)<1)throw Error('起终点必须不同');
 const j=state.jobs.find(j=>j.id===plan.editing);
 if(j){
  if(!supportsFacility(SPECS[j.spec],ctx.byId.get(plan.destination)))throw Error('当前载具不能使用此目的地设施，请选择兼容的机场 / 港口');
  const oldRemaining=(j.length-j.progress)/SPECS[j.spec].speed;
  j.path=path.map(p=>[...p]);j.length=routeLength(path);j.progress=0;j.destination=plan.destination;j.charted=plan.charted;j.handlingDone=false;j.holdUntil=null;j.visitedZones=[];
  if(j.status==='scheduled'){j.fuelPercent=+$('#fuel-slider').value;j.originalPath=j.path;j.originalDistance=j.length;j.plannedArrival=j.scheduled+j.length/SPECS[j.spec].speed;}
  else{const extra=Math.max(0,j.length/SPECS[j.spec].speed-oldRemaining);if(extra>0)cascade(state,j,extra,'人工修改在途航线');}
  for(const next of state.jobs.filter(x=>x.status==='scheduled'&&(x.rotation===j.id||x.depends===j.id))){
   if(distance(ctx.byId.get(next.origin),ctx.byId.get(j.destination))>150){next.status='cancelled';logEvent(state,'cascade',next.id+' · 衔接取消','前序目的地改变，无法完成原定转运。',next);}
  }
  logEvent(state,'info',j.id+' · 航线已修改','新目的地 '+ctx.byId.get(j.destination).code+'。',j);plan.editing=null;toast(j.id+' 航线已更新');
 }else{
  const input={origin:plan.origin,destination:plan.destination,assetId:$('#asset-select').value,path,charted:plan.charted,scheduled:state.hour+(+$('#departure-offset').value||0),fuelPercent:+$('#fuel-slider').value,depends:$('#dependency-select').value||null};
  const job=dispatch(state,input,ctx);toast(job.id+' 已加入网络；启动时间后按计划出发');
 }
 setDrawing(false);changed();syncFields();await save();
}
async function autoRoute(){
 if(!plan.origin||!plan.destination)throw Error('请先选定起终点');
 const a=ctx.byId.get(plan.origin),b=ctx.byId.get(plan.destination),edit=state.jobs.find(j=>j.id===plan.editing);
 const origin=edit?.status==='active'?edit.position:coord(a);
 resetDraft();
 if(plan.kind==='sea'){plan.path=ctx.seaRouter(origin,b);plan.charted=true;toast('已沿海运网络生成推荐路线，请查看途经风险');}
 else toast('已生成最短大圆线，风险区仍需自行绕行');
 renderPlan();
}
function bind(){
 bindSearch('origin');bindSearch('destination');
 $$('[data-mode]').forEach(b=>b.onclick=()=>{Object.values(pickers).forEach(p=>p.reset());plan={kind:b.dataset.mode,origin:null,destination:null,waypoints:[],path:null,charted:false,drawing:false,editing:null};const codes=plan.kind==='air'?['PVG','SIN']:['CNSHA','SGSIN'];for(const [i,key]of['origin','destination'].entries())plan[key]=ctx.facilities.find(f=>f.code===codes[i]&&f.kind===plan.kind)?.id;
 $$('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));setDrawing(false);syncFields();if(plan.kind==='sea')autoRoute().catch(e=>toast(e.message,true));});
 $('#swap-button').onclick=()=>{if(plan.editing)return toast('退出修改模式后可交换起终点');[plan.origin,plan.destination]=[plan.destination,plan.origin];resetDraft();syncFields();};
 $('#draw-route').onclick=()=>{if(plan.charted){plan.charted=false;plan.path=null;plan.waypoints=[];toast('已切换到自由绘制，点击地图添加途经点');}setDrawing(!plan.drawing);renderPlan();};
 $('#clear-route').onclick=()=>{resetDraft();renderPlan();};
 $('#auto-route').onclick=()=>autoRoute().catch(e=>toast(e.message,true));
 $('#waypoint-list').onclick=e=>{const b=e.target.closest('[data-remove-point]');if(b){plan.waypoints.splice(+b.dataset.removePoint,1);renderPlan();}};
 for(const id of['fuel-slider','asset-select','departure-offset'])$('#'+id).addEventListener('input',renderPlan);
 $('#dispatch-button').onclick=()=>submitPlan().catch(e=>toast(e.message,true));
 $('#pause-button').onclick=()=>{state.speed=state.speed?0:lastSpeed;changed();};
 $$('[data-speed]').forEach(b=>b.onclick=()=>{lastSpeed=+b.dataset.speed;if(state.speed)state.speed=lastSpeed;$$('[data-speed]').forEach(x=>x.classList.toggle('speed-selected',x===b));render();});
 $('#advance-button').onclick=()=>{advance(state,6,ctx);changed();renderPlan();};
 $('#fit-map').onclick=()=>mapView.fit();
 $$('[data-layer]').forEach(b=>b.onclick=()=>b.classList.toggle('on',mapView.toggle(b.dataset.layer)));
 $$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle('selected',x===b));render();});
 $('#jobs-table').onclick=e=>{const b=e.target.closest('[data-job]');if(b)showJob(b.dataset.job);};
 $('#events-button').onclick=()=>showEvents();$('#exercise-button').onclick=showExercise;
 $('#data-status').onclick=showIntel;$('#guide-button').onclick=showGuide;$('#save-button').onclick=()=>save(true);
 $('#close-modal').onclick=()=>$('#modal').close();
 $('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
 $$('[data-view]').forEach(b=>b.onclick=()=>{
  $$('[data-view]').forEach(x=>x.classList.toggle('active',x===b));
  if(b.dataset.view==='intel')return showIntel();if(b.dataset.view==='company')return showCompany();
  document.body.classList.toggle('focus-operations',b.dataset.view==='operations');mapView.map.invalidateSize();
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape')setDrawing(false);if(e.code==='Space'&&!['INPUT','SELECT','TEXTAREA','BUTTON'].includes(e.target.tagName)&&!$('#modal').open){e.preventDefault();state.speed=state.speed?0:lastSpeed;render();}});
 $('#modal-content').onclick=async e=>{
  const b=e.target.closest('[data-action]');if(!b)return;
  try{
   const action=b.dataset.action;
   if(action==='close')$('#modal').close();
   if(action==='job-events')showEvents(b.dataset.id);
   if(action==='intel')showIntel();
   if(action==='edit-job')editJob(state.jobs.find(j=>j.id===b.dataset.id));
   if(action==='cancel-job'){const j=state.jobs.find(j=>j.id===b.dataset.id);j.status='cancelled';logEvent(state,'warning',j.id+' · 主动取消','尚未出发的班次已取消，关联货物衔接将受影响。',j);changed();showJob(j.id);}
   if(action==='upgrade'){upgrade(state,b.dataset.key);changed();showCompany();}
   if(action==='exercise'){injectScenario(state,b.dataset.type,ctx);changed();mapView.overlay(environment,state,true);$('#modal').close();toast('演练事件已注入，继续推进时间查看连锁影响');}
   if(action==='policy')showPolicy();
   if(action==='add-policy'){
    const lon=+$('#policy-lon').value,lat=+$('#policy-lat').value,radius=+$('#policy-radius').value,duration=+$('#policy-duration').value;
    if(![lon,lat,radius,duration].every(Number.isFinite)||Math.abs(lon)>180||Math.abs(lat)>85||radius<20||radius>3000||duration<1||duration>720)throw Error('请填写有效经纬度、20–3000 km 半径和 1–720h 时长');
    state.scenarioZones.push({id:'custom-'+(++state.eventSeq),name:'演练 · '+$('#policy-name').value,kind:$('#policy-kind').value,center:[lon,lat],radius,type:'closure',severity:1,source:'scenario',untilHour:state.hour+duration});
    logEvent(state,'warning','自定义演练区域生效','半径 '+radius+' km，持续 '+duration+' 个游戏小时。');changed();mapView.overlay(environment,state,true);$('#modal').close();toast('演练通行限制已生效');
   }
   if(action==='refresh-data'){
    b.disabled=true;b.textContent='正在同步…';
    const points=state.jobs.filter(j=>!terminalStatuses.has(j.status)).flatMap(j=>sampleRoute(j.path,700)).slice(0,100);
    environment=await api('/api/refresh','POST',{points});ctx.environment=environment;mapView.overlay(environment,state,true);showIntel();renderPlan();toast('已完成数据更新检查；各来源的成功或失败状态见情报页');
   }
   if(action==='save')await save(true);
   if(action==='export'){const blob=new Blob([JSON.stringify({...state,speed:0},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='orbis-save-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
   if(action==='import')$('#import-input').click();
   if(action==='new-game'){modal('建立新网络','<p>这将替换当前游戏进度。可先在经营面板导出存档。</p><div class="modal-actions"><button data-action="confirm-new">确认建立新网络</button><button data-action="close">返回游戏</button></div>');}
   if(action==='confirm-new'){state=createState(ctx.facilities,ctx.seaRouter,environment);dirty=true;$('#modal').close();$('#fuel-slider').value=100;$('#departure-offset').value=0;$('#dependency-select').value='';$('[data-mode="air"]').click();changed();syncFields();await save(true);}
  }catch(error){toast(error.message,true);b.disabled=false;}
 };
 $('#import-input').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>8e6)throw Error('存档大于 8 MB');const next=validateSave(JSON.parse(await file.text()));for(const j of next.jobs)if(!ctx.byId.has(j.origin)||!ctx.byId.has(j.destination))throw Error('存档中含当前目录无法识别的设施');state=next;dirty=true;changed();syncFields();$('#modal').close();await save(true);}catch(error){toast(error.message,true);}finally{e.target.value='';}};
 window.addEventListener('beforeunload',()=>{if(dirty&&!saveConflict){const snapshot=structuredClone(state);snapshot.speed=0;runtime.flush({revision,state:snapshot}).catch(()=>{});}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){state.speed=0;render();save();}});
}
async function init(){
 runtime=await createRuntime();
 fillIcons();
 $('#runtime-label').textContent=runtime.mode==='static'?'浏览器运行':'本机运行';
 const results=await Promise.all(['/data/world.json?v=2','/data/facilities.json?v=2','/data/sea-network.json','/data/catalog.json?v=2','/api/environment','/api/save','/data/directory.json?v=2'].map(u=>api(u)));
 const[world,facilities,sea,meta,env,saved,directory]=results;catalog=meta;environment=env;revision=saved.revision;
 const searchIndex=createFacilityIndex(facilities,directory);
 ctx={facilities,directory,searchIndex,byId:new Map(facilities.map(f=>[f.id,f])),seaRouter:createSeaRouter(sea),isLand:landIndex(world),environment};
 state=saved.state?validateSave(saved.state):createState(facilities,ctx.seaRouter,environment);state.speed=0;
 mapView=createWorldMap(world,facilities,{
  onFacility:chooseFacility,onWaypoint:p=>{if(plan.waypoints.length>=80)return toast('最多添加 80 个自定途经点',true);plan.charted=false;plan.path=null;plan.waypoints.push(p);renderPlan();},
  onMove:(i,p)=>{plan.waypoints[i]=p;renderPlan();},onJob:showJob},directory);
 plan.origin=facilities.find(f=>f.code==='PVG'&&f.kind==='air').id;plan.destination=facilities.find(f=>f.code==='SIN'&&f.kind==='air').id;
 $('#facility-count').textContent=catalog.airports.toLocaleString()+' 航空设施 · '+catalog.ports.toLocaleString()+' 港口';
 bind();syncFields();render();mapView.overlay(environment,state,true);
 $('#loading').remove();
 if(runtime.storageWarning)toast(runtime.storageWarning,true);
 let last=performance.now();setInterval(()=>{
  const now=performance.now(),delta=Math.min(2000,now-last);last=now;
  if(state.speed&&!document.hidden){try{advance(state,delta/1000*state.speed/60,ctx);dirty=true;mutation++;render();}catch(e){state.speed=0;toast(e.message,true);}}
 },750);
 setInterval(()=>save(),7000);
 setInterval(async()=>{try{environment=await api('/api/environment');ctx.environment=environment;renderDataStatus();mapView.overlay(environment,state,true);renderPlan();}catch{}},20000);
 window.orbis={get runtime(){return runtime;},get state(){return state;},get context(){return ctx;},get plan(){return plan;},advance(h){advance(state,h,ctx);changed();},get map(){return mapView.map;}};
}
init().catch(e=>{console.error(e);$('#loading').innerHTML='<b>ORBIS</b><span>载入失败：'+esc(e.message)+'</span><span>请通过已发布的网站地址打开；本机版本使用 start.cmd 启动。</span>';});
