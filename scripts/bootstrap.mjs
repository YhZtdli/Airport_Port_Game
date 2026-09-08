import{mkdir,writeFile,readFile,rename}from'node:fs/promises';
import{fileURLToPath}from'node:url';
import{spawnSync}from'node:child_process';
const root=new URL('../',import.meta.url);
const sources=[
 ['public/data/world.json','https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'],
 ['data/countries.csv','https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/countries.csv'],
 ['data/regions.csv','https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/regions.csv'],
 ['data/cities5000.zip','https://download.geonames.org/export/dump/cities5000.zip'],
 ['data/airports.csv','https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv'],
 ['public/data/sea-network.json','https://raw.githubusercontent.com/genthalili/searoute-py/main/searoute/data/marnet_searoute.geojson'],
 ['data/sea-ports.json','https://raw.githubusercontent.com/genthalili/searoute-py/main/searoute/data/ports.geojson'],
 ['public/vendor/SEAROUTE-LICENSE.txt','https://raw.githubusercontent.com/genthalili/searoute-py/main/LICENCE.txt'],
 ['public/vendor/leaflet.js','https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'],
 ['public/vendor/leaflet.css','https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'],
 ['public/vendor/LEAFLET-LICENSE.txt','https://raw.githubusercontent.com/Leaflet/Leaflet/v1.9.4/LICENSE'],
 ['data/easa-raw.json','https://www.easa.europa.eu/en/domains/air-operations/czibs/export-json?_format=json&page=']
];
let failures=0;
for(let i=0;i<sources.length;i+=3)await Promise.all(sources.slice(i,i+3).map(async([file,url])=>{
 let lastError;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('HTTP '+response.status);
   const binary=file.endsWith('.zip'),text=binary?Buffer.from(await response.arrayBuffer()):await response.text();if(file.endsWith('.json'))JSON.parse(text);
   if(binary&&text.readUInt32LE(0)!==0x04034b50)throw Error('Unexpected ZIP file');
   if(file.endsWith('.csv')&&(!text.startsWith('"id"')&&!text.startsWith('id,')))throw Error('Unexpected CSV header');
   const target=new URL(file,root),temporary=new URL(file+'.download',root);await mkdir(new URL('./',target),{recursive:true});
   await writeFile(temporary,text);await rename(temporary,target);
   console.log('Updated '+file+' ('+text.length+' bytes)');return;
  }catch(e){lastError=e;}
 }
 failures++;console.error('Kept existing file: '+file+' — '+lastError.message);
}));
const prepared=spawnSync(process.execPath,[fileURLToPath(new URL('scripts/prepare-data.mjs',root))],{stdio:'inherit'});
if(prepared.status!==0)process.exitCode=1;else if(failures)console.error(failures+' source(s) could not refresh. Existing data was retained.');
