'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {execFileSync} = require('node:child_process');

test('restored browser preparation supports development versions and preserves release metadata', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'private-ai-browser-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'build'));
  fs.mkdirSync(path.join(root, 'source'));
  fs.copyFileSync(path.join(__dirname, '../build/prepare-browser-assets.cjs'), path.join(root, 'build/prepare-browser-assets.cjs'));
  fs.cpSync(path.join(__dirname, '../chrome_extension'), path.join(root, 'chrome_extension'), {recursive: true});
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({version: '3.0.1-dev'}));
  fs.writeFileSync(path.join(root, 'source/browser-hosts.cjs'), 'module.exports={firefoxId:"synthetic@example.invalid"};');
  const infoFile = path.join(root, 'source/build-info.json');
  fs.writeFileSync(infoFile, JSON.stringify({version: '3.0.1-dev', releaseStatus: 'blocked'}));
  const prepare = () => execFileSync(process.execPath, [path.join(root, 'build/prepare-browser-assets.cjs')]);
  prepare();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'chrome_extension/firefox/manifest.json')));
  assert.equal(manifest.version, '3.0.1');
  assert.ok(!manifest.permissions.includes('sidePanel'));
  const first = fs.readFileSync(infoFile, 'utf8'), info = JSON.parse(first);
  assert.equal(info.version, '3.0.1-dev');
  assert.equal(info.releaseStatus, 'blocked');
  assert.match(info.sourceSHA256, /^[a-f0-9]{64}$/);
  prepare();
  assert.equal(fs.readFileSync(infoFile, 'utf8'), first);
});
