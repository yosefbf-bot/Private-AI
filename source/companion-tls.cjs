'use strict';
const crypto = require('node:crypto');
const tls = require('node:tls');
const {fail} = require('./security.cjs');

function tlsOptions(row) { return {key:row.privateKey, cert:row.cert, minVersion:'TLSv1.2'}; }
function describeCertificate(row, host) {
  try {
    const cert = new crypto.X509Certificate(row.cert);
    if (!cert.checkIP(host) || !cert.checkPrivateKey(crypto.createPrivateKey(row.privateKey)) || Date.parse(cert.validTo) <= Date.now() || Date.parse(cert.validFrom) > Date.now()) throw Error();
    tls.createSecureContext(tlsOptions(row));
    return {fingerprint: crypto.createHash('sha256').update(cert.raw).digest('hex'), expires: cert.validTo, certificate: cert.raw.toString('base64')};
  } catch { throw fail('COMPANION_TLS'); }
}

async function createCertificate(host) {
  try {
    const pems = await require('selfsigned').generate([{name:'commonName',value:'Private AI Companion'}], {
      keySize:2048, algorithm:'sha256', notBeforeDate:new Date(Date.now()-300000), notAfterDate:new Date(Date.now()+365*86400000),
      extensions:[{name:'basicConstraints',cA:false,critical:true},{name:'keyUsage',digitalSignature:true,keyEncipherment:true,critical:true},{name:'extKeyUsage',serverAuth:true},{name:'subjectAltName',altNames:[{type:7,ip:host}]}]
    });
    // The owning Store encrypts the record with the existing vault key.
    // Never return the private key in status/pairing or write it to a file/log.
    const row = {host,privateKey:pems.private,cert:pems.cert};
    describeCertificate(row,host);
    return row;
  } catch { throw fail('COMPANION_TLS'); }
}
module.exports = {createCertificate, describeCertificate, tlsOptions};
