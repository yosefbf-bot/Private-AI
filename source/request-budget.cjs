'use strict';
const REQUEST_BYTE_LIMIT=40000000;
// UTF-8 JSON string size without allocating an escaped copy of a large base64
// body. Lone surrogates are escaped by JSON.stringify rather than replaced.
function jsonStringBytes(value,nested=false){
 const text=String(value),base=Buffer.byteLength(text)+2;let extra=0,escaping=0;
 for(const match of text.matchAll(/["\\\u0000-\u001f\ud800-\udfff]/g)){
  const code=match[0].charCodeAt(0),at=match.index;
  if(code===34||code===92){extra++;escaping+=2;}
  else if(code<32){extra+=[8,9,10,12,13].includes(code)?1:5;escaping++;}
  else if(code<=0xdbff&&text.charCodeAt(at+1)>=0xdc00&&text.charCodeAt(at+1)<=0xdfff)continue;
  else if(code>=0xdc00&&text.charCodeAt(at-1)>=0xd800&&text.charCodeAt(at-1)<=0xdbff)continue;
  else {extra+=3;escaping++;}
 }
 return base+extra+(nested?4+escaping:0);
}
function fileInputMetadata(file){
 return {inputBudgetVersion:1,image:!!file.image,mime:file.mime,ocr:!!file.ocr,hasOcrText:!!(file.ocr&&file.text?.trim()),textChars:String(file.text).length,bodyChars:typeof file.bytes==='string'?file.bytes.length:null,textJSONBytes:jsonStringBytes(file.text,true),bodyJSONBytes:jsonStringBytes(file.bytes,true)};
}
module.exports={REQUEST_BYTE_LIMIT,jsonStringBytes,fileInputMetadata};
