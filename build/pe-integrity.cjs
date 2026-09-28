'use strict';
// Structural validation complements trusted-baseline hashes. An MZ/PE signature
// alone does not detect a truncated executable (the 2.1.4–2.1.6 regression).
const fs = require('node:fs'), path = require('node:path');
const crypto = require('node:crypto');
function inspectPe(bytes, label = 'PE file') {
  const need = (condition, reason) => { if (!condition) throw Error(`${label}: ${reason}`); };
  need(bytes.length >= 64 && bytes.toString('ascii', 0, 2) === 'MZ', 'missing DOS header');
  const pe = bytes.readUInt32LE(60);
  need(pe >= 64 && pe + 24 <= bytes.length, 'truncated PE header');
  need(bytes.toString('binary', pe, pe + 4) === 'PE\0\0', 'missing PE signature');
  const machine = bytes.readUInt16LE(pe + 4), count = bytes.readUInt16LE(pe + 6);
  const opt = pe + 24, optSize = bytes.readUInt16LE(pe + 20), table = opt + optSize;
  need(count > 0 && count <= 96 && optSize >= 96 && table + count * 40 <= bytes.length, 'truncated section table');
  const magic = bytes.readUInt16LE(opt), is64 = magic === 0x20b;
  need(is64 || magic === 0x10b, 'unsupported optional header');
  need(optSize >= (is64 ? 112 : 96), 'truncated optional header');
  const headers = bytes.readUInt32LE(opt + 60), entry = bytes.readUInt32LE(opt + 16);
  need(headers >= table + count * 40 && headers <= bytes.length, 'invalid header extent');
  let entryBacked = entry === 0;
  const extents = [];
  for (let i = 0; i < count; i++) {
    const s = table + i * 40, name = bytes.toString('ascii', s, s + 8).replace(/\0.*$/, '');
    const virtual = bytes.readUInt32LE(s + 12), size = bytes.readUInt32LE(s + 16), offset = bytes.readUInt32LE(s + 20);
    if (size) {
      need(offset >= headers && offset + size <= bytes.length, `truncated section ${name}: needs ${offset + size} bytes, has ${bytes.length}`);
      extents.push([offset, offset + size]);
      if (entry >= virtual && entry < virtual + size && (bytes.readUInt32LE(s + 36) & 0x20000000)) entryBacked = true;
    }
  }
  extents.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < extents.length; i++) need(extents[i][0] >= extents[i - 1][1], 'overlapping raw sections');
  need(entryBacked, 'entry point is not backed by an executable section');
  const directoryCount = bytes.readUInt32LE(opt + (is64 ? 108 : 92));
  need((is64 ? 112 : 96) + directoryCount * 8 <= optSize, 'truncated data directories');
  if (directoryCount > 4) {
    const cert = opt + (is64 ? 112 : 96) + 32, start = bytes.readUInt32LE(cert), size = bytes.readUInt32LE(cert + 4);
    if (size) need(start > 0 && start + size <= bytes.length, 'truncated certificate table');
  }
  return { bytes: bytes.length, machine: '0x' + machine.toString(16), sections: count, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
function validateTree(root) {
  const records = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else if (/\.(exe|dll|node)$/i.test(item.name)) {
        const relative = path.relative(root, file).replaceAll(path.sep, '/');
        // The historical archive also carries these unused Linux canvas builds.
        // Their bytes are covered by the trusted-baseline comparison, not PE rules.
        if (/^resources\/app\.asar\.unpacked\/node_modules\/@napi-rs\/canvas-linux-x64-(gnu|musl)\/skia\.linux-x64-(gnu|musl)\.node$/.test(relative)) continue;
        records.push({ path: relative, ...inspectPe(fs.readFileSync(file), file) });
      }
    }
  }
  walk(root);
  if (!records.some(r => r.path === 'PrivateAI.exe' && r.machine === '0x8664')) throw Error('Complete x64 PrivateAI.exe is required');
  return records;
}
if (require.main === module) console.log(JSON.stringify(validateTree(path.resolve(process.argv[2])), null, 2));
module.exports = { inspectPe, validateTree };
