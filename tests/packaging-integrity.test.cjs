'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const modulePath = path.join(__dirname, '../build/pe-integrity.cjs');
if (!fs.existsSync(modulePath)) {
  test.skip('build/pe-integrity.cjs not present in workspace', () => {});
  return;
}
const { inspectPe } = require(modulePath);
// A minimal complete PE64 fixture, with independently declared disk extents.
function fixture() {
  const b = Buffer.alloc(1536); b.write('MZ'); b.writeUInt32LE(128, 60); b.write('PE\0\0', 128, 'binary');
  b.writeUInt16LE(0x8664, 132); b.writeUInt16LE(1, 134); b.writeUInt16LE(240, 148);
  b.writeUInt16LE(0x20b, 152); b.writeUInt32LE(4096, 168); b.writeUInt32LE(512, 212); b.writeUInt32LE(16, 260);
  b.write('.text', 392); b.writeUInt32LE(4096, 404); b.writeUInt32LE(1024, 408); b.writeUInt32LE(512, 412); b.writeUInt32LE(0x60000020, 428);
  return b;
}
test('complete PE passes while the same signature and a truncated section fail', () => {
  assert.equal(inspectPe(fixture()).machine, '0x8664');
  assert.throws(() => inspectPe(fixture().subarray(0, 1100)), /truncated section/);
});
test('missing PE section table is rejected before dereferencing it', () => {
  assert.throws(() => inspectPe(fixture().subarray(0, 400)), /section table/);
});
test('certificate extent outside the file is rejected', () => {
  const b = fixture(); b.writeUInt32LE(1500, 296); b.writeUInt32LE(100, 300);
  assert.throws(() => inspectPe(b), /certificate table/);
});
