import{readFile,writeFile,mkdir,cp,readdir,lstat,realpath,rm}from'node:fs/promises';
import path from'node:path';
import{fileURLToPath}from'node:url';
import{gzipSync}from'node:zlib';
import{createHash}from'node:crypto';
import{readWorldSnapshot}from'./refresh-world.mjs';
const root=path.dirname(fileURLToPath(new URL('../package.json',import.meta.url))),dist=path.join(root,'dist'),marker=path.join(dist,'.orbis-build.json');
export async function buildStatic(){
 const canonicalRoot=await realpath(root);
 try{
  const info=await lstat(dist);
  if(!info.isDirectory()||info.isSymbolicLink()||await realpath(dist)!==path.join(canonicalRoot,'dist'))throw Error('Refusing output outside the project dist directory');
  let previous;try{previous=JSON.parse(await readFile(marker,'utf8'));}catch{throw Error('dist already exists without an ORBIS build marker; choose another folder for those files');}
  if(previous.producer!=='orbis-static-build')throw Error('dist does not belong to the ORBIS builder');
  // The resolved directory and marker have both been verified before recursive cleanup.
  await rm(dist,{recursive:true});
 }catch(e){if(e.code!=='ENOENT')throw e;}
 await mkdir(dist,{recursive:true});
 await writeFile(marker,JSON.stringify({producer:'orbis-static-build',version:1}));
 await cp(path.join(root,'public'),dist,{recursive:true,filter:source=>!source.endsWith('environment.seed.json')});
 const snapshot=await readWorldSnapshot();await writeFile(path.join(dist,'data/environment.json'),JSON.stringify(snapshot));
 const compressed={},sizes={};
 for(const name of['facilities','directory','world','sea-network']){
  const file='data/'+name+'.json',bytes=await readFile(path.join(dist,file)),packed=gzipSync(bytes,{level:9});
  await writeFile(path.join(dist,file+'.gz'),packed);compressed[file]=file+'.gz';sizes[file]={original:bytes.length,download:packed.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 }
 await writeFile(path.join(dist,'runtime-config.json'),JSON.stringify({version:1,mode:'static',builtAt:new Date().toISOString(),environmentURL:'data/environment.json',cadenceHours:12,compressed}));
 await writeFile(path.join(dist,'.nojekyll'),'');
 await writeFile(path.join(dist,'build-info.json'),JSON.stringify({mode:'static',builtAt:new Date().toISOString(),sizes,storage:'browser IndexedDB; no player saves included'},null,2));
 const total=Object.values(sizes).reduce((n,s)=>n+s.download,0);
 console.log('Static site: '+dist+'\nCompressed map and facility download: '+(total/1e6).toFixed(2)+' MB');
 return dist;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildStatic();
