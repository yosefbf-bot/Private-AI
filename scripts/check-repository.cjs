'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const blockedPath = /(^|\/)(app-data|uploads|workspace|backups|cache|logs|tmp|temp|browser[_-]profiles|sessions?|recordings)(\/|$)|\.(db(?:-wal|-shm|-journal)?|sqlite3?(?:-wal|-shm|-journal)?|gguf|wav|mp3|m4a|webm|log|key|pem|pfx|p12)$/i;
const secretName = /(^|\/)(vault\.[^/]+|credentials[^/]*|secrets[^/]*|\.env(?:\.[^/]+)?)$/i;
function inspect(file, content = '') {
  const issues = [];
  if (blockedPath.test(file) || (secretName.test(file) && file !== '.env.example')) issues.push('runtime or secret file');
  // Never include matching text or keys in errors. Fixtures build fake keys at runtime.
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content) || /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AIza[\w-]{30,}|sk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{32,})/.test(content)) issues.push('possible credential');
  if (file === '.env.example' && content.split(/\r?\n/).some(l => /^\s*[A-Z][A-Z0-9_]*\s*=\s*[^\s#]/.test(l))) issues.push('example variables must have empty values');
  return issues;
}
function check() {
  let files;
  try {
    files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  } catch {
    const path = require('node:path');
    function walk(dir) {
      const out = [];
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else out.push(p.split(path.sep).join('/').replace(/^\.\//, ''));
      }
      return out;
    }
    files = walk('.');
  }
  const issues = files.flatMap(file => inspect(file, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '').map(reason => `${file}: ${reason}`));
  if (issues.length) throw new Error(issues.join('\n'));
  console.log(`Repository policy passed (${files.length} tracked files).`);
}
if (require.main === module) { try { check(); } catch(e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { inspect, check };

