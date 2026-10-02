'use strict';
const crypto=require('node:crypto'),net=require('node:net'),https=require('node:https');
let certificate;
async function testCertificate(host='127.0.0.1') {
  certificate ||= require('../source/companion-tls.cjs').createCertificate(host);
  return certificate;
}
async function freePort() {const server=net.createServer();await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});const port=server.address().port;await new Promise(r=>server.close(r));return port;}
function request(gateway, pairing, endpoint, body, extra={}) {
  const s=gateway.settings(), ca=pairing?.certificate && new crypto.X509Certificate(Buffer.from(pairing.certificate,'base64')).toString();
  const content=typeof body==='string'?body:body===undefined?undefined:JSON.stringify(body);
  return new Promise((resolve,reject)=>{
    const req=https.request({host:s.host,port:s.port,path:'/mobile/api/v1'+endpoint,method:content===undefined?'GET':'POST',ca,agent:false,...extra,headers:{...(pairing?.key?{'X-Pair-Key':pairing.key}:{}),...(content!==undefined?{'Content-Type':'application/json'}:{}),...extra.headers}},res=>{let raw='';res.on('data',b=>raw+=b);res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(raw),headers:res.headers});}catch(e){reject(e);}});});
    req.on('error',reject);if(content!==undefined)req.write(content);req.end();
  });
}
module.exports={testCertificate,freePort,request};
