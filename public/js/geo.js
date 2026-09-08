export const R = 6371.0088;
export const rad = x => x * Math.PI / 180;
export const deg = x => x * 180 / Math.PI;
export const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export const wrap = lon => ((lon + 180) % 360 + 360) % 360 - 180;
export const coord = p => Array.isArray(p) ? p : [p.lon,p.lat];
export function distance(a,b) {
  a=coord(a);b=coord(b);
  const x=Math.sin(rad(b[1]-a[1])/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(rad(b[0]-a[0])/2)**2;
  return 2*R*Math.asin(Math.sqrt(clamp(x,0,1)));
}
export function bearing(a,b) {
  a=coord(a);b=coord(b);const d=rad(b[0]-a[0]);
  return (deg(Math.atan2(Math.sin(d)*Math.cos(rad(b[1])),Math.cos(rad(a[1]))*Math.sin(rad(b[1]))-Math.sin(rad(a[1]))*Math.cos(rad(b[1]))*Math.cos(d)))+360)%360;
}
export function interpolate(a,b,t) {
  a=coord(a);b=coord(b);t=clamp(t,0,1);const d=distance(a,b)/R;
  if(d<1e-8)return [...a];
  if(Math.abs(Math.sin(d))<1e-8)return [wrap(a[0]+wrap(b[0]-a[0])*t),a[1]+(b[1]-a[1])*t];
  const A=Math.sin((1-t)*d)/Math.sin(d),B=Math.sin(t*d)/Math.sin(d);
  const x=A*Math.cos(rad(a[1]))*Math.cos(rad(a[0]))+B*Math.cos(rad(b[1]))*Math.cos(rad(b[0]));
  const y=A*Math.cos(rad(a[1]))*Math.sin(rad(a[0]))+B*Math.cos(rad(b[1]))*Math.sin(rad(b[0]));
  const z=A*Math.sin(rad(a[1]))+B*Math.sin(rad(b[1]));
  return [wrap(deg(Math.atan2(y,x))),deg(Math.atan2(z,Math.hypot(x,y)))];
}
export function routeLength(points) {return points.slice(1).reduce((s,p,i)=>s+distance(points[i],p),0);}
export function sampleRoute(points,step=120) {
  const out=[];
  for(let i=1;i<points.length;i++){const n=Math.max(1,Math.ceil(distance(points[i-1],points[i])/step));for(let j=0;j<n;j++)out.push(interpolate(points[i-1],points[i],j/n));}
  if(points.length)out.push(coord(points.at(-1)));return out;
}
export function positionAt(points,km) {
  for(let i=1;i<points.length;i++){const d=distance(points[i-1],points[i]);if(km<=d)return{point:interpolate(points[i-1],points[i],d?km/d:0),heading:bearing(points[i-1],points[i])};km-=d;}
  return{point:coord(points.at(-1)),heading:bearing(points.at(-2)||points[0],points.at(-1))};
}
export function remainingRoute(points,km) {
  for(let i=1;i<points.length;i++){const d=distance(points[i-1],points[i]);if(km<d)return[interpolate(points[i-1],points[i],km/d),...points.slice(i)];km-=d;}
  return[points.at(-1)];
}
export function displaySegments(points) {
  const segments=[[]];let last;
  for(const p of sampleRoute(points,150)){
    if(last && Math.abs(p[0]-last[0])>180)segments.push([]);
    segments.at(-1).push([p[1],p[0]]);last=p;
  }return segments.filter(s=>s.length>1);
}
export function pointInRing(p,ring) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
export function inGeometry(p,geometry) {
  if(!geometry)return false;
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
  return polygons.some(poly=>pointInRing(p,poly[0])&&!poly.slice(1).some(hole=>pointInRing(p,hole)));
}
export function landIndex(world) {
  const polygons=[];
  for(const f of world.features){
    const ps=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    for(const p of ps){const ring=p[0];polygons.push({p,minX:Math.min(...ring.map(x=>x[0])),maxX:Math.max(...ring.map(x=>x[0])),minY:Math.min(...ring.map(x=>x[1])),maxY:Math.max(...ring.map(x=>x[1]))});}
  }
  return point=>polygons.some(b=>point[0]>=b.minX&&point[0]<=b.maxX&&point[1]>=b.minY&&point[1]<=b.maxY&&pointInRing(point,b.p[0])&&!b.p.slice(1).some(h=>pointInRing(point,h)));
}
export class MinHeap {
  constructor(){this.items=[];}
  push(item){const a=this.items;a.push(item);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p][0]<=item[0])break;a[i]=a[p];i=p;}a[i]=item;}
  pop(){const a=this.items;if(!a.length)return null;const first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(a[c][0]>=last[0])break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}
export function createSeaRouter(geojson) {
  const nodes=[],ids=new Map(),edges=[];
  function node(p){const key=`${wrap(p[0]).toFixed(5)},${p[1].toFixed(5)}`;if(ids.has(key))return ids.get(key);const id=nodes.length;ids.set(key,id);nodes.push([wrap(p[0]),p[1]]);edges.push([]);return id;}
  for(const feature of geojson.features){
    const lines=feature.geometry.type==='LineString'?[feature.geometry.coordinates]:feature.geometry.type==='MultiLineString'?feature.geometry.coordinates:[];
    for(const line of lines)for(let i=1;i<line.length;i++){const a=node(line[i-1]),b=node(line[i]),w=distance(nodes[a],nodes[b]);edges[a].push([b,w]);edges[b].push([a,w]);}
  }
  function nearest(p){let best=-1,d=Infinity;nodes.forEach((n,i)=>{const v=distance(n,p);if(v<d){best=i;d=v;}});return best;}
  return function route(a,b,avoid=()=>false){
    a=coord(a);b=coord(b);const start=nearest(a),end=nearest(b);
    if(start<0||end<0)throw Error('海运网络为空');
    const costs=new Float64Array(nodes.length).fill(Infinity),prev=new Int32Array(nodes.length).fill(-1),q=new MinHeap();costs[start]=0;q.push([distance(nodes[start],nodes[end]),start,0]);
    while(q.items.length){const [,u,cost]=q.pop();if(cost>costs[u])continue;if(u===end)break;
      for(const [v,w] of edges[u]){const penalty=avoid(nodes[v])?12:1;const next=cost+w*penalty;if(next<costs[v]){costs[v]=next;prev[v]=u;q.push([next+distance(nodes[v],nodes[end]),v,next]);}}
    }
    if(!Number.isFinite(costs[end]))throw Error('这两个港口暂未连入同一海运网络，请手动规划');
    const points=[];for(let u=end;u!==-1;u=prev[u])points.push(nodes[u]);points.reverse();
    return [a,...points.filter(p=>distance(p,a)>1&&distance(p,b)>1),b];
  };
}
