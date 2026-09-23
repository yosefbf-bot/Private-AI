'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');
const {Cipher} = require('../source/security.cjs');
const {Store} = require('../source/database.cjs');

// Representative historical schema, not a real 2.1.x installation or DPAPI fixture.
test('schema 2 encrypted records migrate to schema 3 without losing synthetic content', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'privateai-migration-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const file = path.join(root,'legacy.db');
  const cipher = new Cipher(crypto.randomBytes(32));
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,updated INTEGER NOT NULL,expires INTEGER,payload BLOB NOT NULL,PRIMARY KEY(kind,id)); CREATE INDEX expiry ON records(expires); CREATE TABLE audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,time INTEGER NOT NULL,event TEXT NOT NULL,detail TEXT NOT NULL,prev TEXT NOT NULL,mac TEXT NOT NULL); CREATE TABLE claims(id TEXT PRIMARY KEY,claimed INTEGER NOT NULL); PRAGMA user_version=2;');
  const insert = db.prepare('INSERT INTO records VALUES(?,?,?,?,?)');
  const chat = {id:'synthetic-chat',title:'SYNTHETIC_PRIVATE_MIGRATION',messages:[{role:'user',text:'Synthetic legacy message'}],hipaa:true};
  insert.run('chat',chat.id,Date.now(),null,cipher.seal(chat,'chat:'+chat.id));
  const settings = {provider:'openai',approved:true,hipaa:true};
  insert.run('settings','main',Date.now(),null,cipher.seal(settings,'settings:main'));
  db.close();
  const store = new Store(file,cipher);
  try {
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,3);
    assert.deepEqual(store.get('chat',chat.id),chat);
    assert.equal(store.summaries('chat')[0].title,chat.title);
    assert.equal(require('../source/provider-policy.cjs').approved(store.get('settings','main'),'synthetic'),false);
  } finally {store.close();}
  assert.equal(fs.readFileSync(file).includes(Buffer.from(chat.title)),false);
});
