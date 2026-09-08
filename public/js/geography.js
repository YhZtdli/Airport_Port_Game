// Product geography follows the UN M49 statistical grouping described in README.
export const CONTINENTS={
 AF:{id:'AF',name:'非洲',aliases:['Africa']},AS:{id:'AS',name:'亚洲',aliases:['Asia']},
 EU:{id:'EU',name:'欧洲',aliases:['Europe']},NA:{id:'NA',name:'北美洲',aliases:['North America','北美']},
 SA:{id:'SA',name:'南美洲',aliases:['South America','南美']},OC:{id:'OC',name:'大洋洲',aliases:['Oceania']},
 AN:{id:'AN',name:'南极洲',aliases:['Antarctica','南极']},ZZ:{id:'ZZ',name:'其他地区',aliases:[]}
};
export const SPECIAL_AREAS={
 HK:{country:'CN',region:'CN-HK',name:'中国香港',aliases:['香港','香港特别行政区','Hong Kong','Hongkong','HKG','HK']},
 MO:{country:'CN',region:'CN-MO',name:'中国澳门',aliases:['澳门','澳門','澳门特别行政区','Macau','Macao','MAC','MO']},
 TW:{country:'CN',region:'CN-TW',name:'中国台湾省',aliases:['台湾','臺灣','台湾省','中国台湾','Taiwan','Taiwan Province of China','TWN','TW']},
 XK:{country:'RS',region:'RS-XK',name:'科索沃地区',aliases:['Kosovo','XK']}
};
export const FACILITY_TYPES={
 large_airport:'大型机场',medium_airport:'中型机场',small_airport:'小型机场',
 heliport:'直升机起降点',seaplane_base:'水上机场',closed:'已停用设施',port:'港口'
};
export const normalizeText=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[\s_.,/()[\]{}'’·–—-]+/g,'').trim();
export const countryFor=source=>SPECIAL_AREAS[source]?.country||source;
export const regionFor=(source,region)=>SPECIAL_AREAS[source]?.region||region||(countryFor(source)+'-UN');
export function regionalText(value){
 return String(value??'').replace(/中国香港|中国澳门|中国台湾省|中国台湾|香港|澳门|澳門|台湾省|臺灣省|台湾|臺灣/g,s=>
 ['香港','中国香港'].includes(s)?'中国香港':['澳门','澳門','中国澳门'].includes(s)?'中国澳门':'中国台湾省');
}
export function facilityName(f){
 if(!f)return '';
 const area=SPECIAL_AREAS[f.sourceCountry||f.country];
 let name=f.zh||f.name||f.code;
 if(area&&area.country==='CN'&&!name.includes(area.name))name=area.name+' · '+name;
 return regionalText(name);
}
export function facilityLocation(f,directory={}){
 if(!f)return '';
 const country=directory.countries?.[f.country]?.name||({CN:'中国',HK:'中国香港',MO:'中国澳门',TW:'中国台湾省'}[f.country])||f.country;
 const region=directory.regions?.[f.region]?.name||SPECIAL_AREAS[f.sourceCountry]?.name||'';
 const city=directory.cities?.[f.cityKey]?.name||f.city||'';
 return [...new Set([country,region,city].filter(Boolean))].join(' / ');
}
export function normalizeMapGeography(world){
 for(const f of world.features){
  const p=f.properties,source=p.sourceName||p.name||p.ADMIN||p.NAME,iso=p.iso||p.ISO_A3||p.ADM0_A3;
  const code=({TWN:'TW',HKG:'HK',MAC:'MO',CHN:'CN',KOS:'XK'})[iso];
  if(code){p.sourceName=source;p.country=countryFor(code);p.sovereignCode=code==='XK'?'SRB':'CHN';
   if(SPECIAL_AREAS[code]){p.regionCode=SPECIAL_AREAS[code].region;p.nameZh=SPECIAL_AREAS[code].name;p.name=code==='TW'?'Taiwan, Province of China':code==='HK'?'China, Hong Kong SAR':code==='MO'?'China, Macao SAR':source;}
   else{p.name='China';p.nameZh='中国';}
  }
 }
 return world;
}
