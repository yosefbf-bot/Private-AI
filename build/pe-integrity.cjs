'use strict';
function inspectPe(b){
 if(!Buffer.isBuffer(b)||b.length<64||b.toString('ascii',0,2)!=='MZ')throw Error('Invalid DOS header');
 const pe=b.readUInt32LE(60);
 if(pe<64||pe+24>b.length||b.toString('binary',pe,pe+4)!=='PE\0\0')throw Error('Invalid PE header');
 const machine=b.readUInt16LE(pe+4),count=b.readUInt16LE(pe+6),optionalSize=b.readUInt16LE(pe+20),optional=pe+24,sections=optional+optionalSize;
 if(!count||count>96||sections+count*40>b.length)throw Error('Missing section table');
 if(optionalSize<112||b.readUInt16LE(optional)!==0x20b)throw Error('Expected PE64 optional header');
 for(let i=0;i<count;i++){const off=sections+i*40,size=b.readUInt32LE(off+16),start=b.readUInt32LE(off+20);if(size&&(start<sections+count*40||start+size>b.length))throw Error('truncated section');}
 const directories=b.readUInt32LE(optional+108);
 if(directories>4){if(optionalSize<152)throw Error('Missing data directories');const start=b.readUInt32LE(optional+144),size=b.readUInt32LE(optional+148);if(size&&(start===0||start+size>b.length))throw Error('Invalid certificate table');}
 return {machine:'0x'+machine.toString(16),sections:count};
}
module.exports={inspectPe};
