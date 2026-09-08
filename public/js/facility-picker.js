import{esc}from'./icons.js';
import{facilityName,facilityLocation,FACILITY_TYPES}from'./geography.js';
const groupLabels={continent:'大洲',country:'国家 / 地区',region:'行政区',city:'城市'};
export function bindFacilityPicker({input,result,index,getKind,getSelected,onSelect}){
 let scope={},query='',type='all',includeClosed=false,limit=20,groupLimit=8,groupBy='region',timer,current,suppressFocus=false;
 input.setAttribute('role','combobox');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls',result.id);input.setAttribute('aria-haspopup','dialog');input.setAttribute('aria-autocomplete','list');
 document.body.append(result);
 result.setAttribute('role','dialog');result.setAttribute('aria-label','设施分区检索');result.classList.add('facility-picker');
 function close(restore=true){
  clearTimeout(timer);result.classList.add('hidden');input.setAttribute('aria-expanded','false');
  if(restore){const f=getSelected();input.value=f?facilityName(f)+' · '+f.code:'';}
 }
 function reset(){scope={};query='';limit=20;groupLimit=8;groupBy='region';close();}
 function finish(){reset();suppressFocus=true;input.focus({preventScroll:true});suppressFocus=false;}
 function focusChoice(){(result.querySelector('.group-option,.search-option:not(:disabled)')||result.querySelector('[data-crumb]'))?.focus({preventScroll:true});}
 function position(){
  if(result.classList.contains('hidden'))return;
  const r=input.getBoundingClientRect(),width=Math.min(440,window.innerWidth-16);
  if(r.bottom<0||r.top>window.innerHeight){close();return;}
  const below=window.innerHeight-r.bottom-12,above=r.top-12,up=below<270&&above>below;
  Object.assign(result.style,{width:width+'px',left:Math.max(8,Math.min(r.left,window.innerWidth-width-8))+'px',right:'auto',
   top:up?'auto':r.bottom+5+'px',bottom:up?window.innerHeight-r.top+5+'px':'auto',maxHeight:Math.min(560,Math.max(200,up?above:below))+'px'});
 }
 function draw({preserveScroll=false}={}){
  const oldScroll=result.querySelector('.picker-scroll')?.scrollTop||0;
  current=index.search({query,kind:getKind(),scope,type,includeClosed,groupBy,limit,groupLimit});
  const trail=index.breadcrumbs(current.scope),groupTitle=groupLabels[current.groupField]||'';
  result.innerHTML='<div class="picker-head"><nav aria-label="检索路径">'+trail.map((b,i)=>'<button type="button" data-crumb="'+i+'" '+(i===trail.length-1?'aria-current="location"':'')+'>'+esc(b.name)+'</button>').join('<span>›</span>')+'</nav><button type="button" data-close aria-label="关闭检索">×</button></div>'+
   '<div class="picker-tools">'+(getKind()==='air'?'<label>类型 <select aria-label="航空设施类型" data-type>'+[['all','全部在用设施'],['fixed','陆地机场'],['heliport','直升机起降点'],['seaplane_base','水上机场']].map(([id,name])=>'<option value="'+id+'" '+(type===id?'selected':'')+'>'+name+'</option>').join('')+'</select></label><label class="picker-closed"><input type="checkbox" data-closed '+(includeClosed?'checked':'')+'>含停用记录</label>':'<span>全球真实港口 · 支持城市与 UN/LOCODE</span>')+'</div>'+
   '<div class="picker-scroll">'+(current.scope.country&&!current.scope.region?'<div class="picker-tabs"><button type="button" data-group-by="region" class="'+(groupBy==='region'?'selected':'')+'">按行政区</button><button type="button" data-group-by="city" class="'+(groupBy==='city'?'selected':'')+'">按城市</button></div>':'')+
   (current.groups.length?'<div class="picker-section">'+groupTitle+' <span>'+current.totalGroups+' 项 · 点击展开下一级</span></div><div class="picker-groups">'+current.groups.map((g,i)=>'<button type="button" class="group-option" data-group="'+i+'"><span>'+esc(g.name)+'<small>'+esc(g.field==='city'?[index.directory.countries[g.country]?.name,index.directory.regions[g.region]?.name].filter(Boolean).join(' / '):g.english||'')+'</small></span><b>'+g.count.toLocaleString()+' <i>›</i></b></button>').join('')+'</div>'+
    (current.groups.length<current.totalGroups?'<button type="button" class="picker-more" data-more-groups>展开更多'+groupTitle+'（已显示 '+current.groups.length+' / '+current.totalGroups+'）</button>':''):'')+
   '<div class="picker-section" role="status" aria-live="polite">'+(getKind()==='air'?'航空设施':'港口')+' <span>共 '+current.totalFacilities.toLocaleString()+' 项 · '+(includeClosed?'含停用记录':'在用')+'</span></div>'+
   current.facilities.map(f=>'<button type="button" class="search-option '+(f.closed?'is-closed':'')+'" data-facility="'+esc(f.id)+'" '+(f.closed?'disabled title="来源已标记停用，仅供查阅"':'')+'><span>'+esc(facilityName(f))+'<small>'+esc(facilityLocation(f,index.directory))+'</small><small class="facility-detail">'+esc(FACILITY_TYPES[f.type]||'机场')+(f.scheduled?' · 定期航班':'')+'</small></span><b>'+esc(f.code)+'<small>'+esc((f.codes||[]).filter(c=>c!==f.code).slice(0,2).join(' / '))+'</small></b></button>').join('')+
   (!current.totalFacilities?'<div class="empty-state">未找到匹配设施<br><small>可点“全球”扩大范围，或切换设施类型。</small></div>':'')+
   (current.facilities.length<current.totalFacilities?'<button type="button" class="picker-more" data-more>加载更多设施（已显示 '+current.facilities.length+' / '+current.totalFacilities.toLocaleString()+'）</button>':'')+
   '</div><div class="picker-foot">输入国家、城市、名称或代码 · ↑ ↓ 选择 · Enter 确认</div>';
  result.classList.remove('hidden');input.setAttribute('aria-expanded','true');position();
  if(preserveScroll)result.querySelector('.picker-scroll').scrollTop=oldScroll;
 }
 function changed(){limit=20;groupLimit=8;draw();}
 input.addEventListener('focus',()=>{if(suppressFocus)return;if(result.classList.contains('hidden')){scope={};query='';limit=20;groupLimit=8;}input.select();draw();});
 input.addEventListener('input',()=>{query=input.value;clearTimeout(timer);result.classList.add('hidden');input.setAttribute('aria-expanded','false');timer=setTimeout(changed,110);});
 input.addEventListener('keydown',e=>{
  if(e.key==='Escape'){finish();return;}
  if(e.key==='ArrowDown'){e.preventDefault();clearTimeout(timer);query=input.value===((getSelected()?facilityName(getSelected())+' · '+getSelected().code:''))?'':input.value;draw();result.querySelector('.group-option,.search-option:not(:disabled)')?.focus();}
  if(e.key==='Enter'){e.preventDefault();clearTimeout(timer);query=input.value;draw();const choice=current.exact?result.querySelector('.search-option:not(:disabled)'):result.querySelector('.group-option,.search-option:not(:disabled)');choice?.click();}
 });
 result.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-close')){close();return;}
  if(b.dataset.crumb!==undefined){scope=index.breadcrumbs(current.scope)[+b.dataset.crumb].scope;query='';input.value='';changed();focusChoice();return;}
  if(b.dataset.group!==undefined){scope=current.groups[+b.dataset.group].scope;query='';input.value='';changed();focusChoice();return;}
  if(b.dataset.groupBy){groupBy=b.dataset.groupBy;changed();result.querySelector('[data-group-by="'+groupBy+'"]').focus({preventScroll:true});return;}
  if(b.hasAttribute('data-more')){limit+=20;draw({preserveScroll:true});return;}
  if(b.hasAttribute('data-more-groups')){groupLimit+=12;draw({preserveScroll:true});return;}
  if(b.dataset.facility){const f=current.facilities.find(f=>f.id===b.dataset.facility);if(f&&!f.closed){onSelect(f);reset();input.blur();}}
 });
 result.addEventListener('change',e=>{
  if(e.target.hasAttribute('data-type'))type=e.target.value;
  if(e.target.hasAttribute('data-closed'))includeClosed=e.target.checked;
  changed();
 });
 result.addEventListener('keydown',e=>{
  if(e.key==='Escape'){finish();return;}
  if(['ArrowDown','ArrowUp'].includes(e.key)){
   const all=[...result.querySelectorAll('button:not(:disabled)')],i=all.indexOf(document.activeElement);
   all[Math.max(0,Math.min(all.length-1,i+(e.key==='ArrowDown'?1:-1)))]?.focus();e.preventDefault();
  }
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!result.classList.contains('hidden')){e.preventDefault();finish();}});
 document.addEventListener('pointerdown',e=>{if(!result.contains(e.target)&&e.target!==input)close();});
 document.addEventListener('focusin',e=>{if(!result.contains(e.target)&&e.target!==input)close();});
 window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
 return{close,reset};
}
