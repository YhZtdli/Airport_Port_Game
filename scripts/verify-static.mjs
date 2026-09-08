import{readdir,readFile,stat}from'node:fs/promises';
import{gunzipSync}from'node:zlib';
import assert from'node:assert/strict';
import path from'node:path';
import{fileURLToPath}from'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url)),json=async file=>JSON.parse((await readFile(path.join(root,file),'utf8')).replace(/^\uFEFF/,''));
const config=await json('runtime-config.json');assert.equal(config.mode,'static');
const html=await readFile(path.join(root,'index.html'),'utf8');
assert.ok(!/(?:src|href)=["']\/(?!\/)/.test(html),'Assets must support a repository subpath');
for(const [file,compressed]of Object.entries(config.compressed)){
 const decoded=gunzipSync(await readFile(path.join(root,compressed)));assert.deepEqual(decoded,await readFile(path.join(root,file)));JSON.parse(decoded);
}
let count=0,bytes=0;
async function walk(dir){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const name=path.join(dir,entry.name);
  assert.ok(!entry.isSymbolicLink(),'Do not publish links to private local files');
  assert.ok(!['save.json','.git','.env','work','server.mjs','node_modules'].includes(entry.name),'Unexpected private/runtime file: '+name);
  if(entry.isDirectory())await walk(name);else{count++;const size=(await stat(name)).size;assert.ok(size<100*1024*1024,'GitHub file too large');bytes+=size;}
 }
}
await walk(root);assert.ok(bytes<1024**3,'Pages output exceeds 1 GB');
const environment=await json('data/environment.json');
for(const key of['state','jobs','fleet','scenarioZones','save','cash'])assert.equal(environment[key],undefined);
assert.equal(environment.hosting,'static');
console.log('Verified '+count+' static files, '+(bytes/1e6).toFixed(2)+' MB on disk; no player save or server process required.');
