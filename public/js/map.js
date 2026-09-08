import{displaySegments,coord,distance,wrap,clamp}from'./geo.js';
import{conditionsAt,conditionsRisk,fallbackAt}from'./conditions.js';
import{icon,esc}from'./icons.js';
import{facilityName,facilityLocation,FACILITY_TYPES,normalizeMapGeography}from'./geography.js';
export function createWorldMap(world,facilities,callbacks,directory={}){
 normalizeMapGeography(world);
 const L=window.L;
 const map=L.map('map',{crs:L.CRS.EPSG4326,zoomControl:false,attributionControl:false,zoomSnap:.1,minZoom:-1,maxZoom:7,preferCanvas:true,maxBounds:[[-95,-195],[95,195]],maxBoundsViscosity:.8});
 L.control.zoom({position:'bottomleft'}).addTo(map);
 const fit=()=>map.fitBounds([[-80,-180],[85,180]],{padding:[15,25],animate:false});
 fit();
 const grid=L.layerGroup().addTo(map);
 for(let lon=-180;lon<=180;lon+=30)L.polyline([[-90,lon],[90,lon]],{color:'#36546c',weight:.5,opacity:.22,interactive:false}).addTo(grid);
 for(let lat=-60;lat<=60;lat+=30)L.polyline([[lat,-180],[lat,180]],{color:'#36546c',weight:.5,opacity:.22,interactive:false}).addTo(grid);
 L.geoJSON(world,{style:{fillColor:'#223a4c',fillOpacity:.92,color:'#3b566b',weight:.55,opacity:.8},onEachFeature:(f,l)=>l.bindTooltip(esc(f.properties.nameZh||f.properties.name),{sticky:true})}).addTo(map);
 const labels=L.layerGroup().addTo(map);
 const continents=[[-106,46,'NORTH AMERICA'],[-58,-16,'SOUTH AMERICA'],[12,54,'EUROPE'],[20,7,'AFRICA'],[92,47,'ASIA'],[135,-24,'OCEANIA']];
 for(const[lon,lat,name]of continents)L.marker([lat,lon],{icon:L.divIcon({className:'continent-label',html:name,iconSize:[120,14],iconAnchor:[60,7]}),interactive:false}).addTo(labels);
 for(const[lon,lat,name]of [[-135,-8,'PACIFIC OCEAN'],[-31,15,'ATLANTIC OCEAN'],[76,-20,'INDIAN OCEAN']])L.marker([lat,lon],{icon:L.divIcon({className:'ocean-label',html:name,iconSize:[130,12],iconAnchor:[65,6]}),interactive:false}).addTo(labels);
 const groups={airports:L.layerGroup().addTo(map),ports:L.layerGroup().addTo(map),weather:L.layerGroup(),currents:L.layerGroup(),risk:L.layerGroup().addTo(map)};
 const routeGroup=L.layerGroup().addTo(map),vehicleGroup=L.layerGroup().addTo(map),draftGroup=L.layerGroup().addTo(map);
 let drawing=false,selected=null,lastEnv=null,lastState=null,riskKey='',drawn=new Map();
 const hubCodes=new Set(['PVG','LHR','JFK','LAX','SIN','DXB','SYD','JNB','GRU','NRT','PEK','CDG','SFO','DEL','HKG','CNSHA','SGSIN','NLRTM','USNYC','USLAX','ZACPT','KRPUS']);
 function facilitiesLayer(){
  groups.airports.clearLayers();groups.ports.clearLayers();const bounds=map.getBounds(),zoom=map.getZoom();
  const visible=facilities.filter(f=>!f.closed&&bounds.contains([f.lat,f.lon])&&(zoom>3?true:zoom>2?f.size>=2:hubCodes.has(f.code)||(f.size===3&&f.scheduled)));
  visible.sort((a,b)=>Number(hubCodes.has(b.code))-Number(hubCodes.has(a.code))||b.size-a.size);
  const occupied=new Set();let count=0;
  for(const f of visible){
   if(count>850)break;
   const px=map.latLngToContainerPoint([f.lat,f.lon]),key=Math.floor(px.x/(zoom>2?9:22))+','+Math.floor(px.y/(zoom>2?9:22));
   if(occupied.has(key)&&!hubCodes.has(f.code))continue;occupied.add(key);count++;
   const color=f.kind==='air'?'#78bce9':'#dab471',g=f.kind==='air'?groups.airports:groups.ports;
   const marker=L.circleMarker([f.lat,f.lon],{radius:hubCodes.has(f.code)?3.2:2,weight:1,color,fillColor:color,fillOpacity:.8,opacity:.9}).addTo(g);
   marker.bindTooltip(esc(facilityName(f)+' · '+f.code),{direction:'top',offset:[0,-3]});
   marker.on('click',e=>{
    L.DomEvent.stopPropagation(e);
    if(drawing){callbacks.onWaypoint(coord(f));return;}
    const div=document.createElement('div');div.innerHTML='<b>'+esc(facilityName(f))+'</b><br><small>'+esc(f.code+' · '+(FACILITY_TYPES[f.type]||'机场'))+'<br>'+esc(facilityLocation(f,directory))+'<br>'+f.lat.toFixed(4)+'°, '+f.lon.toFixed(4)+'°</small><br>';
    for(const[key,label]of[['origin','设为出发地'],['destination','设为目的地']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{callbacks.onFacility(key,f);map.closePopup();};div.append(b);}
    L.popup().setLatLng([f.lat,f.lon]).setContent(div).openOn(map);
   });
   if(hubCodes.has(f.code))L.marker([f.lat,f.lon],{interactive:false,icon:L.divIcon({className:'facility-label',html:esc(f.code),iconSize:[60,12],iconAnchor:[-3,7]})}).addTo(g);
  }
 }
 facilitiesLayer();map.on('moveend',facilitiesLayer);
 map.on('click',e=>{if(drawing)callbacks.onWaypoint([wrap(e.latlng.lng),clamp(e.latlng.lat,-85,85)]);});
 function drawLine(path,style,group){return displaySegments(path).map(segment=>L.polyline(segment,{weight:1.3,opacity:.7,...style}).addTo(group));}
 function updateTraffic(s){
  lastState=s;const present=new Set();
  for(const j of s.jobs){
   if(j.status==='cancelled')continue;present.add(j.id);let r=drawn.get(j.id);
   const color=j.kind==='air'?'#68baf1':'#dbaf69';
   if(!r||r.path!==j.path){if(r){r.lines.forEach(l=>routeGroup.removeLayer(l));vehicleGroup.removeLayer(r.marker);}
    const lines=drawLine(j.path,{color,weight:selected===j.id?2.7:1.25,opacity:j.status==='completed'?.16:.62,dashArray:j.status==='scheduled'?'3 6':null},routeGroup);
    lines.forEach(l=>l.on('click',()=>callbacks.onJob(j.id)));
    const marker=L.marker([j.position[1],j.position[0]],{icon:L.divIcon({className:'vehicle-icon '+(j.kind==='sea'?'sea':''),html:icon(j.kind==='air'?'plane':'ship'),iconSize:[20,20],iconAnchor:[10,10]}),zIndexOffset:100}).addTo(vehicleGroup);
    marker.on('click',()=>callbacks.onJob(j.id));marker.bindTooltip('',{direction:'top',offset:[0,-9]});r={path:j.path,lines,marker};drawn.set(j.id,r);
   }
   r.lines.forEach(l=>l.setStyle({opacity:j.status==='completed'?.12:selected===j.id?.95:.55,weight:selected===j.id?2.6:1.2,dashArray:j.status==='scheduled'?'3 6':null}));
   r.marker.setLatLng([j.position[1],j.position[0]]);
   r.marker.setOpacity(['active','diverting'].includes(j.status)?1:0);
   r.marker.setTooltipContent(esc(j.id)+' · '+esc(j.status==='diverting'?'正在备降 / 避险':'模拟运输'));
   const svg=r.marker.getElement()?.querySelector('svg');if(svg&&j.kind==='air')svg.style.transform='rotate('+j.heading+'deg)';
  }
  for(const[id,r]of drawn)if(!present.has(id)){r.lines.forEach(l=>routeGroup.removeLayer(l));vehicleGroup.removeLayer(r.marker);drawn.delete(id);}
 }
 function overlay(env,s,force=false){
  lastEnv=env;lastState=s;
  const zones=[...(env.zones||[]),...s.scenarioZones],key=zones.map(z=>z.id).join('|');
  if(force||key!==riskKey){riskKey=key;groups.risk.clearLayers();
   for(const z of zones){
    const style={color:z.source==='scenario'?'#efb46a':'#c68076',weight:.9,fillColor:z.source==='scenario'?'#d1934f':'#ad6d69',fillOpacity:.15,opacity:.75,dashArray:'3 4'};
    const layer=z.geometry?L.geoJSON(z.geometry,{style}):L.circle([z.center[1],z.center[0]],{radius:z.radius*1000,...style});
    layer.bindTooltip(esc(z.name)+'<br><small>'+esc(z.source==='scenario'?'游戏演练区域':z.scopeNote||'公告区域近似边界')+'</small>',{sticky:true});layer.addTo(groups.risk);
   }
  }
  for(const name of['weather','currents']){
   groups[name].clearLayers();if(!map.hasLayer(groups[name]))continue;
   let samples=name==='weather'?env.weather:env.marine;
   if(!samples?.length){samples=[];for(const lat of[-40,0,40])for(const lon of[-140,-70,0,70,140])samples.push({point:[lon,lat]});}
   for(const sample of samples.slice(0,100)){
    const p=sample.point,c=conditionsAt({...env,anchorTime:s.epoch},p,s.hour,name==='weather'?'air':'sea');
    if(name==='weather'){
     const risk=conditionsRisk(c,'air');
     L.circle([p[1],p[0]],{radius:180000+risk*220000,color:'#caa887',weight:.7,fillColor:'#caae8e',fillOpacity:.035+risk*.13,opacity:.4,interactive:false}).addTo(groups.weather);
     L.marker([p[1],p[0]],{icon:L.divIcon({className:'weather-symbol',html:(c.source==='live'?'':'~ ')+Math.round(c.gust)+' km/h',iconSize:[70,15],iconAnchor:[30,7]})}).bindTooltip('阵风 '+Math.round(c.gust)+' km/h · CAPE '+Math.round(c.cape)+'<br>'+esc(c.source==='live'?'Open-Meteo 预报':c.source==='stale'?'过期预报 / 外推':'演练模型')).addTo(groups.weather);
    }else L.marker([p[1],p[0]],{icon:L.divIcon({className:'current-arrow',html:'<span style="display:block;transform:rotate('+c.currentDir+'deg)">↑</span>',iconSize:[20,20]})}).bindTooltip('洋流 '+c.current.toFixed(1)+' km/h · '+Math.round(c.currentDir)+'°<br>'+esc(c.source==='live'&&!c.currentSource?'Open-Meteo 海洋预报':'缓存或演练外推')).addTo(groups.currents);
   }
  }
 }
 function setDraft(path,waypoints){
  draftGroup.clearLayers();if(path?.length>1)drawLine(path,{color:'#c5ebff',weight:2,opacity:.95,dashArray:'5 5'},draftGroup);
  for(let i=0;i<waypoints.length;i++){
   const p=waypoints[i],marker=L.marker([p[1],p[0]],{draggable:true,icon:L.divIcon({className:'waypoint-marker',html:String(i+1),iconSize:[20,20],iconAnchor:[10,10]})}).addTo(draftGroup);
   marker.on('dragend',()=>{const ll=marker.getLatLng();callbacks.onMove(i,[wrap(ll.lng),clamp(ll.lat,-85,85)]);});
  }
 }
 new ResizeObserver(()=>{map.invalidateSize();}).observe(document.getElementById('map'));
 return{map,fit,updateTraffic,overlay,setDraft,
  setDrawing(value){drawing=value;map.getContainer().style.cursor=value?'crosshair':'';},
  toggle(name){if(map.hasLayer(groups[name]))map.removeLayer(groups[name]);else groups[name].addTo(map);if(lastEnv)overlay(lastEnv,lastState,true);return map.hasLayer(groups[name]);},
  focusJob(j){selected=j.id;updateTraffic(lastState);const b=L.latLngBounds(j.path.map(p=>[p[1],p[0]]));if(b.getEast()-b.getWest()<180)map.fitBounds(b,{padding:[65,60],maxZoom:4});else fit();},
  focusPoint(p){map.setView([p.lat,p.lon],Math.max(2.6,map.getZoom()));}
 };
}
