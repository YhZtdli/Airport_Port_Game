import{inflateRawSync}from'node:zlib';
export function parseCSV(text){
 const rows=[];let row=[],cell='',quoted=false;text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
 const headers=rows.shift()||[];return rows.filter(r=>r.length===headers.length).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])));
}
export function unzipEntry(buffer,filename){
 let end=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Invalid ZIP archive');
 const count=buffer.readUInt16LE(end+10);let at=buffer.readUInt32LE(end+16);
 for(let i=0;i<count;i++){
  if(buffer.readUInt32LE(at)!==0x02014b50)throw Error('Invalid ZIP directory');
  const method=buffer.readUInt16LE(at+10),compressed=buffer.readUInt32LE(at+20),size=buffer.readUInt32LE(at+24);
  const nameLength=buffer.readUInt16LE(at+28),extraLength=buffer.readUInt16LE(at+30),commentLength=buffer.readUInt16LE(at+32),offset=buffer.readUInt32LE(at+42);
  const name=buffer.toString('utf8',at+46,at+46+nameLength);
  if(name===filename){
   if(size>100*1024*1024)throw Error('Unexpectedly large GeoNames file');
   if(buffer.readUInt32LE(offset)!==0x04034b50)throw Error('Invalid ZIP entry');
   const start=offset+30+buffer.readUInt16LE(offset+26)+buffer.readUInt16LE(offset+28);
   const data=buffer.subarray(start,start+compressed);
   const result=method===0?data:method===8?inflateRawSync(data,{maxOutputLength:100*1024*1024}):null;
   if(!result||result.length!==size)throw Error('Unsupported or invalid ZIP entry');return result.toString('utf8');
  }at+=46+nameLength+extraLength+commentLength;
 }throw Error('ZIP entry not found: '+filename);
}
