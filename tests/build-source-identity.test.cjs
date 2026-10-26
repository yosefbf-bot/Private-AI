'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {sourceDigest}=require('../build/prepare-browser-assets.cjs');

test('committed build metadata already matches the packaged source before Windows staging',()=>{
 const root=path.resolve(__dirname,'..'),info=JSON.parse(fs.readFileSync(path.join(root,'source/build-info.json'),'utf8'));
 assert.equal(info.version,require('../package.json').version);
 assert.equal(info.sourceSHA256,sourceDigest(root),'Run npm run prepare:browser after the last source edit and commit its generated metadata before packaging.');
});

const binary=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x00,0xff]);
const texts=[
 ['source/a.cjs','module.exports=1;\n'],
 ['source/Z.cjs','module.exports=2;\n'],
 ['source/nested/Á.mjs','export default "synthetic";\n'],
 ['chrome_extension/panel.js','console.log("synthetic");\n'],
 ['chrome_extension/a.css','body { color: blue; }\n'],
 ['package.json','{\n  "version": "3.0.4-dev"\n}\n']
];
function fixture(t){
 const base=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(base,'private-ai-build-identity-'));
 t.after(()=>{const target=fs.realpathSync(root);assert.equal(path.dirname(target),base);assert.ok(path.basename(target).startsWith('private-ai-build-identity-'));fs.rmSync(target,{recursive:true,force:true});});
 for(const [relative,text] of texts){const file=path.join(root,...relative.split('/'));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
 fs.writeFileSync(path.join(root,'source/binary.png'),binary);
 fs.writeFileSync(path.join(root,'source/build-info.json'),'{"updatedAt":"synthetic","sourceSHA256":"excluded"}\n');
 return root;
}

test('build identity uses canonical POSIX names and deterministic filename order',t=>{
 const root=fixture(t),expected=crypto.createHash('sha256');
 // Independent expected byte stream: uppercase Z precedes lowercase a on every OS.
 for(const chunk of ['source/Z.cjs','module.exports=2;\n','source/a.cjs','module.exports=1;\n','source/binary.png',binary,'source/nested/Á.mjs','export default "synthetic";\n','chrome_extension/a.css','body { color: blue; }\n','chrome_extension/panel.js','console.log("synthetic");\n','{\n  "version": "3.0.4-dev"\n}\n'])expected.update(chunk);
 assert.equal(sourceDigest(root),expected.digest('hex'));
});

test('LF and CRLF source/package checkouts share identity; generated metadata is excluded',t=>{
 const root=fixture(t),before=sourceDigest(root);
 for(const [relative,text] of texts)fs.writeFileSync(path.join(root,...relative.split('/')),text.replace(/\n/g,'\r\n'));
 fs.writeFileSync(path.join(root,'source/build-info.json'),'{"updatedAt":"different synthetic metadata"}\r\n');
 assert.equal(sourceDigest(root),before);
});

test('binary CRLF and invalid UTF-8 bytes remain significant to build identity',t=>{
 const root=fixture(t),before=sourceDigest(root);
 fs.writeFileSync(path.join(root,'source/binary.png'),Buffer.from([0x89,0x50,0x4e,0x47,0x0a,0x00,0xff]));
 assert.notEqual(sourceDigest(root),before,'Binary CRLF must not be normalized as text');
 fs.writeFileSync(path.join(root,'source/binary.png'),binary);
 fs.writeFileSync(path.join(root,'source/opaque.txt'),Buffer.from([0xff,0x0d,0x0a]));
 const invalid=sourceDigest(root);
 fs.writeFileSync(path.join(root,'source/opaque.txt'),Buffer.from([0xfe,0x0d,0x0a]));
 assert.notEqual(sourceDigest(root),invalid,'Invalid UTF-8 must not collapse into replacement characters');
});
