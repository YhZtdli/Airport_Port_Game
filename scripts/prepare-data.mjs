import{readFile,writeFile,rename}from'node:fs/promises';
import{createHash}from'node:crypto';
import{parseCSV,unzipEntry}from'./data-utils.mjs';
import{normalizeText,countryFor,regionFor,CONTINENTS,SPECIAL_AREAS,normalizeMapGeography,facilityName}from'../public/js/geography.js';
import{distance}from'../public/js/geo.js';
const root=new URL('../',import.meta.url);
const read=async file=>(await readFile(new URL(file,root),'utf8')).replace(/^\uFEFF/,'');
const json=async file=>JSON.parse(await read(file));
const save=async(file,data)=>{const temp=new URL(file+'.prepared',root);await writeFile(temp,JSON.stringify(data));await rename(temp,new URL(file,root));};
const countryRows=parseCSV(await read('data/countries.csv')),regionRows=parseCSV(await read('data/regions.csv'));
const sourceCountries=new Map(countryRows.map(c=>[c.code,c]));
const countryZh=new Intl.DisplayNames(['zh-Hans'],{type:'region'}),countryHant=new Intl.DisplayNames(['zh-Hant'],{type:'region'});
const directory={version:2,continents:CONTINENTS,countries:{},regions:{},cities:{},policy:{source:'UN M49',url:'https://unstats.un.org/unsd/methodology/m49/',note:'台湾省纳入中国；香港、澳门作为中国特别行政区分区显示。原始设施代码用于数据关联。'}};
const countryAliases={CN:['中国','中华人民共和国','中國','PRC','China'],GB:['英国','英國','UK','United Kingdom','Britain'],US:['美国','美國','USA','United States','America'],DK:['丹麦','丹麥','Denmark','Danmark'],KR:['韩国','韓國','South Korea'],RU:['俄罗斯','俄羅斯','Russia']};
function ensureCountry(source){
 const code=countryFor(source);if(directory.countries[code])return directory.countries[code];
 const row=sourceCountries.get(code)||{code,name:code,continent:'ZZ'};
 let name=code==='ZZ'?'未分区':countryZh.of(code)||row.name;
 directory.countries[code]={id:code,name,english:row.name,continent:row.continent||'ZZ',aliases:[...new Set([code,row.name,name,countryHant.of(code),...(row.keywords||'').split(','),...(countryAliases[code]||[])].filter(Boolean))]};
 return directory.countries[code];
}
for(const row of countryRows)ensureCountry(row.code);
const regionZh={
 'CN-BJ':'北京市','CN-TJ':'天津市','CN-HE':'河北省','CN-SX':'山西省','CN-NM':'内蒙古自治区','CN-LN':'辽宁省','CN-JL':'吉林省','CN-HL':'黑龙江省',
 'CN-SH':'上海市','CN-JS':'江苏省','CN-ZJ':'浙江省','CN-AH':'安徽省','CN-FJ':'福建省','CN-JX':'江西省','CN-SD':'山东省','CN-HA':'河南省',
 'CN-HB':'湖北省','CN-HN':'湖南省','CN-GD':'广东省','CN-GX':'广西壮族自治区','CN-HI':'海南省','CN-CQ':'重庆市','CN-SC':'四川省','CN-GZ':'贵州省',
 'CN-YN':'云南省','CN-XZ':'西藏自治区','CN-SN':'陕西省','CN-GS':'甘肃省','CN-QH':'青海省','CN-NX':'宁夏回族自治区','CN-XJ':'新疆维吾尔自治区',
 'DK-84':'首都大区','DK-82':'中日德兰大区','DK-81':'北日德兰大区','DK-85':'西兰大区','DK-83':'南丹麦大区'
};
const provinceCodes={11:'BJ',12:'TJ',13:'HE',14:'SX',15:'NM',21:'LN',22:'JL',23:'HL',31:'SH',32:'JS',33:'ZJ',34:'AH',35:'FJ',36:'JX',37:'SD',41:'HA',42:'HB',43:'HN',44:'GD',45:'GX',46:'HI',50:'CQ',51:'SC',52:'GZ',53:'YN',54:'XZ',61:'SN',62:'GS',63:'QH',64:'NX',65:'XJ'};
for(const [number,letters]of Object.entries(provinceCodes))regionZh['CN-'+number]=regionZh['CN-'+letters];
for(const r of regionRows){
 const id=regionFor(r.iso_country,r.code),special=SPECIAL_AREAS[r.iso_country];
 if(special){directory.regions[id]={id,name:special.name,country:special.country,aliases:special.aliases};continue;}
 const name=regionZh[id]||(/offshore platforms/i.test(r.name)?'海上平台':/unassigned/i.test(r.name)?'未标注行政区':r.name);
 directory.regions[id]={id,name,country:countryFor(r.iso_country),aliases:[r.code,r.name,name,name.replace(/市$|省$/,''),...(r.keywords||'').split(',')].filter(Boolean)};
}
for(const special of Object.values(SPECIAL_AREAS))directory.regions[special.region]={id:special.region,name:special.name,country:special.country,aliases:special.aliases};
const cityPreferred={
 Beijing:'北京',Shanghai:'上海',Guangzhou:'广州',Shenzhen:'深圳',Chengdu:'成都',Chongqing:'重庆',Tianjin:'天津',Nanjing:'南京',Hangzhou:'杭州',Wuhan:'武汉',Xian:'西安',
 Kunming:'昆明',Xiamen:'厦门',Fuzhou:'福州',Qingdao:'青岛',Dalian:'大连',Shenyang:'沈阳',Harbin:'哈尔滨',Changsha:'长沙',Zhengzhou:'郑州',Haikou:'海口',Sanya:'三亚',
 'Hong Kong':'中国香港',Macau:'中国澳门',Macao:'中国澳门',Taipei:'台北',Taoyuan:'桃园',Kaohsiung:'高雄',Taichung:'台中',Tainan:'台南',Hualien:'花莲',
 Copenhagen:'哥本哈根',Kobenhavn:'哥本哈根',Aarhus:'奥胡斯',Aalborg:'奥尔堡',Billund:'比隆',Ronne:'伦讷',Odense:'欧登塞',Esbjerg:'埃斯比约',
 London:'伦敦',Paris:'巴黎',Berlin:'柏林',Frankfurt:'法兰克福',Munich:'慕尼黑',Amsterdam:'阿姆斯特丹',Rome:'罗马',Madrid:'马德里',
 Tokyo:'东京',Osaka:'大阪',Seoul:'首尔',Singapore:'新加坡',Bangkok:'曼谷',Dubai:'迪拜',Doha:'多哈',Istanbul:'伊斯坦布尔',
 'New York City':'纽约','New York':'纽约','Los Angeles':'洛杉矶','San Francisco':'旧金山',Chicago:'芝加哥',Boston:'波士顿',
 Sydney:'悉尼',Melbourne:'墨尔本',Auckland:'奥克兰',Toronto:'多伦多',Vancouver:'温哥华',Cairo:'开罗',Johannesburg:'约翰内斯堡','Cape Town':'开普敦'
};
const preferred=new Map(Object.entries(cityPreferred).map(([k,v])=>[normalizeText(k),v]));
const cityText=unzipEntry(await readFile(new URL('data/cities5000.zip',root)),'cities5000.txt');
const cityMatches=new Map();
for(const line of cityText.split('\n')){
 const r=line.split('\t');if(r.length<19)continue;
 const aliases=[r[1],r[2],...r[3].split(',')].filter(Boolean),chinese=aliases.filter(a=>/^[\p{Script=Han}·・]{2,20}$/u.test(a));
 const city={id:r[0],name:r[1],aliases,zh:preferred.get(normalizeText(r[2]))||chinese[0]||'',lon:+r[5],lat:+r[4],country:r[8],population:+r[14]};
 for(const alias of new Set(aliases.map(normalizeText))){if(!alias)continue;const key=city.country+':'+alias;if(!cityMatches.has(key))cityMatches.set(key,[]);cityMatches.get(key).push(city);}
}
function ensureRegion(source,rawRegion){
 const country=countryFor(source),id=regionFor(source,rawRegion);
 if(!directory.regions[id])directory.regions[id]={id,name:rawRegion||'未标注行政区',country,aliases:[rawRegion].filter(Boolean)};
 return id;
}
function enrich(f,source,rawRegion){
 source=sourceCountries.has(source)?source:'ZZ';const country=ensureCountry(source);f.sourceCountry=source;f.country=country.id;f.continent=country.continent;f.region=ensureRegion(source,rawRegion);
 const rawCity=(f.city||'').trim(),cityQuery=rawCity.replace(/\s*\([^)]*\)\s*/g,'').trim();
 const candidates=cityMatches.get(source+':'+normalizeText(cityQuery))||cityMatches.get(source+':'+normalizeText(rawCity))||[];
 const geo=candidates.filter(c=>distance(c,f)<200).sort((a,b)=>distance(a,f)-distance(b,f)||b.population-a.population)[0];
 const cityName=preferred.get(normalizeText(cityQuery))||geo?.zh||rawCity||'未标注城市';
 const key=country.id+'|'+f.region+'|'+(normalizeText(geo?.name||cityQuery)||'unknown');
 f.cityKey=key;
 if(!directory.cities[key])directory.cities[key]={id:key,name:cityName,english:geo?.name||rawCity,country:country.id,region:f.region,aliases:[...new Set([rawCity,cityQuery,cityName,...(geo?.aliases||[])].filter(Boolean))]};
 if(SPECIAL_AREAS[source]?.country==='CN')f.zh=facilityName(f);
 return f;
}
const names={PVG:'上海浦东国际机场',PEK:'北京首都国际机场',PKX:'北京大兴国际机场',CAN:'广州白云国际机场',SZX:'深圳宝安国际机场',
 HKG:'中国香港国际机场',MFM:'中国澳门国际机场',TPE:'中国台湾省 · 桃园国际机场',TSA:'中国台湾省 · 台北松山机场',KHH:'中国台湾省 · 高雄国际机场',
 RMQ:'中国台湾省 · 台中国际机场',TNN:'中国台湾省 · 台南机场',HUN:'中国台湾省 · 花莲机场',TTT:'中国台湾省 · 台东机场',KNH:'中国台湾省 · 金门机场',
 CPH:'哥本哈根凯斯楚普机场',BLL:'比隆机场',AAL:'奥尔堡机场',AAR:'奥胡斯机场',RKE:'罗斯基勒机场',ODE:'欧登塞机场',RNN:'博恩霍尔姆机场',EBJ:'埃斯比约机场',
 SIN:'新加坡樟宜机场',NRT:'东京成田机场',HND:'东京羽田机场',ICN:'首尔仁川机场',LHR:'伦敦希思罗机场',CDG:'巴黎戴高乐机场',FRA:'法兰克福机场',AMS:'阿姆斯特丹史基浦机场',
 DXB:'迪拜国际机场',DOH:'多哈哈马德机场',IST:'伊斯坦布尔机场',JFK:'纽约肯尼迪机场',LAX:'洛杉矶国际机场',SFO:'旧金山国际机场',ORD:'芝加哥奥黑尔机场',
 SYD:'悉尼机场',MEL:'墨尔本机场',AKL:'奥克兰机场',DEL:'新德里机场',BOM:'孟买机场',BKK:'曼谷素万那普机场',KUL:'吉隆坡机场',CGK:'雅加达机场',
 JNB:'约翰内斯堡机场',CPT:'开普敦机场',CAI:'开罗机场',GRU:'圣保罗瓜鲁柳斯机场',EZE:'布宜诺斯艾利斯机场',YYZ:'多伦多皮尔逊机场',YVR:'温哥华机场',KEF:'凯夫拉维克机场',HNL:'檀香山机场',ANC:'安克雷奇机场',ATH:'雅典机场',MAD:'马德里机场',FCO:'罗马菲乌米奇诺机场',NBO:'内罗毕机场'};
const airportText=await read('data/airports.csv'),rows=parseCSV(airportText),types=new Set(['large_airport','medium_airport','small_airport','heliport','seaplane_base','closed','closed_airport']);
const airports=rows.filter(r=>types.has(r.type)&&r.latitude_deg.trim()!==''&&r.longitude_deg.trim()!==''&&Number.isFinite(+r.latitude_deg)&&Number.isFinite(+r.longitude_deg)&&Math.abs(+r.latitude_deg)<=90&&Math.abs(+r.longitude_deg)<=180)
 .map(r=>enrich({id:'A'+r.id,code:r.iata_code||r.icao_code||r.ident,name:r.name,zh:names[r.iata_code]||'',city:r.municipality,lat:+r.latitude_deg,lon:+r.longitude_deg,
 kind:'air',type:r.type==='closed_airport'?'closed':r.type,closed:['closed','closed_airport'].includes(r.type),size:r.type==='large_airport'?3:r.type==='medium_airport'?2:1,
 scheduled:r.scheduled_service==='yes',elevation:+r.elevation_ft||0,codes:[...new Set([r.iata_code,r.icao_code,r.gps_code,r.ident,r.local_code].filter(Boolean))],
 keywords:r.keywords||''},r.iso_country,r.iso_region));
const portGeo=await json('data/sea-ports.json');
const portNames={CNSHA:'上海港',CNNGB:'宁波舟山港',CNSZX:'深圳港',CNHKG:'中国香港港',SGSIN:'新加坡港',NLRTM:'鹿特丹港',BEANR:'安特卫普港',DEHAM:'汉堡港',USLAX:'洛杉矶港',USLGB:'长滩港',USNYC:'纽约港',GBFXT:'费利克斯托港',JPTYO:'东京港',JPYOK:'横滨港',KRPUS:'釜山港',AEJEA:'杰贝阿里港',EGPSD:'塞得港',ZADUR:'德班港',ZACPT:'开普敦港',AUSYD:'悉尼港',BRSSZ:'桑托斯港',INBOM:'孟买港',LKCMB:'科伦坡港',PAPTY:'巴拿马港',ESALG:'阿尔赫西拉斯港'};
const countryNames=new Map(countryRows.map(c=>[normalizeText(c.name),c.code])),portsMap=new Map();
for(const f of portGeo.features){
 const p=f.properties,c=f.geometry.coordinates,code=p.port||p.code||String(p.name);
 if(!Array.isArray(c)||!c.every(Number.isFinite)||Math.abs(c[0])>180||Math.abs(c[1])>90)continue;
 let source=code.slice(0,2);if(!sourceCountries.has(source))source=countryNames.get(normalizeText(p.cty))||'ZZ';
 if(code==='CNHKG'||/hong\s*kong/i.test(p.name))source='HK';if(/^(CNMFM|MOMFM)$/.test(code)||/^macau$|^macao$/i.test(p.name))source='MO';
 if(!portsMap.has(code)||p.t)portsMap.set(code,enrich({id:'P'+code,code,name:p.name,zh:portNames[code]||'',city:p.name,lon:c[0],lat:c[1],kind:'sea',type:'port',closed:false,
 size:portNames[code]?3:p.t?2:1,terminal:!!p.t,codes:[code],keywords:''},source,null));
}
const ports=[...portsMap.values()],facilities=[...airports,...ports];
const byId=new Map(facilities.map(f=>[f.id,f]));
// Keep referenced legacy endpoints available to an existing campaign if upstream removed an entry.
try{
 const previous=await json('public/data/facilities.json'),saved=await json('data/save.json'),needed=new Set(saved.state.jobs.flatMap(j=>[j.origin,j.destination,j.landingAt,j.rescueFacility]).concat(saved.state.fleet.map(a=>a.location)));
 for(const f of previous)if(needed.has(f.id)&&!byId.has(f.id)){f.closed=true;f.type='closed';f.legacy=true;enrich(f,f.sourceCountry||f.country,f.region);facilities.push(f);byId.set(f.id,f);}
}catch{}
let world=await json('public/data/world.json');
for(const f of world.features){const p=f.properties;f.properties={...p,name:p.ADMIN||p.NAME||p.name,nameZh:p.NAME_ZH||p.nameZh||p.ADMIN,iso:p.ISO_A3||p.ADM0_A3||p.iso,label:p.label||[p.LABEL_X,p.LABEL_Y],continent:p.CONTINENT||p.continent};}
normalizeMapGeography(world);
const active=airports.filter(f=>!f.closed),counts=Object.fromEntries([...new Set(airports.map(f=>f.type))].map(t=>[t,airports.filter(f=>f.type===t).length]));
const catalog={version:2,preparedAt:new Date().toISOString(),airports:active.length,airportRecords:airports.length,closedAirports:counts.closed||0,
 landAirports:active.filter(f=>['large_airport','medium_airport','small_airport'].includes(f.type)).length,airportTypes:counts,ports:ports.length,largeAirports:counts.large_airport||0,
 sources:[
 {name:'OurAirports',url:'https://ourairports.com/data/',license:'Public Domain',coverage:'全球固定翼机场、直升机起降点、水上机场及停用设施查阅；同时保留 IATA、ICAO、本地代码、国家、行政区与城市。',sha256:createHash('sha256').update(airportText).digest('hex')},
 {name:'GeoNames',url:'https://www.geonames.org/',license:'CC BY 4.0',coverage:'城市中英文及多语言别名；以来源城市名称匹配，不把附近城市强行替换为机场所属城市。'},
 {name:'UN Statistics Division · M49',url:'https://unstats.un.org/unsd/methodology/m49/',license:'联合国公开统计分区说明',coverage:'台湾省、香港、澳门纳入中国分区，显示中国台湾省、中国香港、中国澳门；原始代码用于关联。'},
 {name:'Natural Earth',url:'https://www.naturalearthdata.com/',license:'Public Domain',coverage:'本地 1:110m 地理要素；展示名称按上述产品分区统一。'},
 {name:'Searoute / Eurostat',url:'https://github.com/genthalili/searoute-py',license:'Apache-2.0',coverage:'全球港口目录与海运网络；港口出入口和运河连接是近似。'},
 {name:'Open-Meteo / DWD / NOAA / Météo-France',url:'https://open-meteo.com/',license:'数据 CC BY 4.0；免费 API 供非商业使用',coverage:'全球稀疏采样与在用航线采样。'},
 {name:'EASA Conflict Zones Advisories',url:'https://www.easa.europa.eu/en/domains/air-operations/czibs',license:'按 EASA 使用条款',coverage:'公开冲突公告；非完整 NOTAM 或领空许可。'}]};
await save('public/data/directory.json',directory);await save('public/data/facilities.json',facilities);await save('public/data/world.json',world);await save('public/data/catalog.json',catalog);
console.log(JSON.stringify({active:active.length,fixedWing:catalog.landAirports,heliports:counts.heliport,seaplanes:counts.seaplane_base,closed:counts.closed,ports:ports.length,cityGroups:Object.keys(directory.cities).length,countries:Object.keys(directory.countries).length},null,2));
