"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const {
  fail,
  uuid,
  isId,
  safePath,
  text,
  atomicWrite,
} = require("./security.cjs");
const { executableInfo, registerApp } = require("./apps.cjs");
const { exportFile } = require("./files.cjs");
const EXT = /\.(txt|md|csv|pdf|docx|xlsx|png|jpg|jpeg|webp|eml|msg|ics)$/i;
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
const OUTLOOK = {
  "outlook.messages": "readMessages",
  "outlook.message": "readMessages",
  "outlook.calendar": "readCalendar",
  "outlook.draft": "writeDrafts",
  "outlook.appointment": "writeCalendar",
  "outlook.delete": "deleteMessages",
  "outlook.cleanup": "deleteMessages",
};
function helperCall(executable, data, {signal,authorize,spawnProcess=spawn}={}) {
  return new Promise((resolve, reject) => {
    const idle=data.op==='memory.trimIdle';
    if(signal?.aborted||idle&&typeof authorize!=='function')return reject(fail('ACCESS'));
    const child = spawnProcess(executable, [], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"],
      shell: false,
    });
    let chunks = [],
      size = 0,
      finished = false,ready=false;
    const done = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort',aborted);
      child.kill();
      error ? reject(fail("ACCESS")) : resolve(result);
    };
    const timer = setTimeout(() => done(true), 30000);
    const aborted=()=>done(true);signal?.addEventListener('abort',aborted,{once:true});if(signal?.aborted)aborted();
    child.on("error", () => done(true));
    child.stdin.on("error", () => done(true));
    child.stdout.on("data", (b) => {
      size += b.length;
      if (size > 850000) return done(true);
      chunks.push(b);
      if(idle&&!ready){
        const buffer=Buffer.concat(chunks),at=buffer.indexOf(10);if(at<0)return;
        try{const message=JSON.parse(buffer.subarray(0,at).toString('utf8'));if(message.ready!==true||Object.keys(message).length!==1)throw Error();ready=true;chunks=[buffer.subarray(at+1)];if(signal?.aborted||!authorize())return done(true);child.stdin.end('trim\n');}catch{return done(true);}
      }
    });
    child.on("close", () => {
      try {
        if(idle&&!ready)throw Error();
        const r = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!r.ok) throw Error();
        done(false, r.result);
      } catch {
        done(true);
      }
    });
    if(idle)child.stdin.write(JSON.stringify(data)+'\n');else child.stdin.end(JSON.stringify(data) + "\n");
  });
}
class AccessManager {
  constructor(core, helper) {
    this.core = core;
    this.helper = helper;
    this.choices = new Map();
  }
  require(kind, id, permission) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail("INVALID");
    const grant = this.core.store.get(kind, id);
    if (!grant || grant[permission] !== true) throw fail("POLICY");
    return grant;
  }
  async choicesForApps() {
    this.core.assertUnlocked();
    const result = await this.helper({ op: "windows" });
    this.core.assertUnlocked();
    this.choices.clear();
    return result.map((w) => {
      const id = uuid();
      this.choices.set(id, { ...w, expires: Date.now() + 300000 });
      return { id, name: w.name, title: w.title };
    });
  }
  async grantRunningApp(id, read, write) {
    this.core.assertUnlocked();
    const choice = this.choices.get(id);
    if (!choice || choice.expires < Date.now()) throw fail("EXPIRED");
    const app = await registerApp(this.core, choice.path);
    return this.updateApp(app.id, read, write);
  }
  updateApp(id, read, write) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail("INVALID");
    const a = this.core.store.get("app", id);
    if (!a) throw fail("APP");
    a.read = read === true;
    a.write = write === true;
    a.capability =
      [
        a.read ? "Read visible text" : null,
        a.write ? "Write to chosen draft field" : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Open program only";
    this.core.store.put("app", id, a);
    this.core.store.audit("access_permissions");
    return a;
  }
  async appAction(id, op, data = {}) {
    if (!["windows", "ui.read", "ui.fields", "ui.writeDraft"].includes(op))
      throw fail("POLICY");
    const mode = op === "ui.read" ? "read" : "write";
    const a =
      op === "windows" ? this.windowGrant(id) : this.require("app", id, mode);
    const info = await executableInfo(a.path);
    if (info.sha256 !== a.sha256) throw fail("APP");
    if (op === "windows") this.windowGrant(id);
    else this.require("app", id, mode);
    const args = { op, path: info.path };
    if (op !== "windows") {
      if (!Number.isSafeInteger(data.pid) || data.pid <= 0)
        throw fail("INVALID");
      args.pid = data.pid;
    }
    if (op === "ui.writeDraft") {
      args.fieldId = text(data.fieldId, 300);
      args.text = text(data.text, 50000);
    }
    if(op==='ui.writeDraft'){await this.core.resources.preflight('desktop');this.require('app',id,mode);}
    const result = await this.helper(args);
    if (op === "windows") this.windowGrant(id);
    else this.require("app", id, mode);
    this.core.store.audit(op === "ui.read" ? "access_read" : "access_action");
    return result;
  }
  windowGrant(id) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail("INVALID");
    const a = this.core.store.get("app", id);
    if (!a || (!a.read && !a.write)) throw fail("POLICY");
    return a;
  }
  setOutlook(input) {
    this.core.assertUnlocked();
    const grant = {};
    for (const p of new Set(Object.values(OUTLOOK)))
      grant[p] = input[p] === true;
    this.core.store.put("access", "outlook", grant);
    this.core.store.audit("access_permissions");
    return grant;
  }
  async outlook(op, data = {}) {
    const permission = OUTLOOK[op];
    if (!permission) throw fail("POLICY");
    const check = () => {
      this.core.assertUnlocked();
      if (this.core.store.get("access", "outlook")?.[permission] !== true)
        throw fail("POLICY");
    };
    check();
    await this.core.resources.preflight('outlook');
    check();
    const result = await this.helper({ ...data, op });
    check();
    if (op === 'outlook.message') {
      // Only the message the owner actually selected, after the post-await grant
      // check. Optional cached triage must not break a successful mailbox read.
      try { require('./workflows/correspondence.cjs').observeOutlook(this.core,data,result); }
      catch { this.core.stability?.incident('service-failed'); }
    }
    this.core.store.audit(
      permission.startsWith("read") ? "access_read" : "access_action",
    );
    return result;
  }
  grantFolder(folder, read, write) {
    this.core.assertUnlocked();
    if (typeof folder !== "string" || !path.isAbsolute(folder))
      throw fail("PATH");
    const actual = fs.realpathSync(folder),
      privateRoot = fs.realpathSync(this.core.root);
    if (
      fs.lstatSync(folder).isSymbolicLink() ||
      !fs.statSync(actual).isDirectory()
    )
      throw fail("PATH");
    const within = (root, p) => {
      const relative = path.relative(root, p);
      return (
        relative === "" ||
        (!relative.startsWith(".." + path.sep) &&
          relative !== ".." &&
          !path.isAbsolute(relative))
      );
    };
    if (within(privateRoot, actual) || within(actual, privateRoot))
      throw fail("PATH");
    safePath(actual, "probe.txt");
    const old = this.core.store.list("folder").find((f) => f.path === actual);
    const grant = {
      id: old?.id || uuid(),
      path: actual,
      name: path.basename(actual),
      read: read === true,
      write: write === true,
    };
    this.core.store.put("folder", grant.id, grant);
    this.core.store.audit("access_permissions");
    return grant;
  }
  updateFolder(id, read, write) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail("INVALID");
    const grant = this.core.store.get("folder", id);
    if (!grant) throw fail("PATH");
    grant.read = read === true;
    grant.write = write === true;
    this.core.store.put("folder", id, grant);
    this.core.store.audit("access_permissions");
    return grant;
  }
  folderPath(id, relative, mode) {
    const grant = this.require("folder", id, mode);
    if (
      fs.realpathSync(grant.path) !== grant.path ||
      fs.lstatSync(grant.path).isSymbolicLink()
    )
      throw fail("PATH");
    return {
      grant,
      file: relative === "" ? grant.path : safePath(grant.path, relative),
    };
  }
  listFolder(id, relative = "") {
    const { file } = this.folderPath(id, relative, "read");
    return fs
      .readdirSync(file, { withFileTypes: true })
      .filter(
        (d) =>
          !d.isSymbolicLink() &&
          (d.isDirectory() || (d.isFile() && EXT.test(d.name))),
      )
      .slice(0, 500)
      .map((d) => ({
        name: d.name,
        directory: d.isDirectory(),
        relative: path.join(relative, d.name),
      }));
  }
  async importFolderFile(id, relative, chatId) {
    const { file } = this.folderPath(id, relative, "read");
    if (!EXT.test(file)) throw fail("FILE");
    const result = await this.core.importFile(file, null, chatId);
    this.require("folder", id, "read");
    return result;
  }
  readText(id, relative) {
    const { file } = this.folderPath(id, relative, "read");
    if (!/\.(txt|md)$/i.test(file) || fs.statSync(file).size > 350000)
      throw fail("FILE");
    const b = fs.readFileSync(file);
    this.core.store.audit("access_read");
    return { text: b.toString("utf8"), version: hash(b) };
  }
  writeText(id, relative, content, version = null) {
    const { file } = this.folderPath(id, relative, "write");
    if (!/\.(txt|md)$/i.test(file)) throw fail("FILE");
    const value = text(content, 350000);
    if (version !== null) {
      if (
        !/^[a-f0-9]{64}$/.test(version) ||
        !fs.existsSync(file) ||
        hash(fs.readFileSync(file)) !== version
      )
        throw fail("CHANGED");
      atomicWrite(file, value);
    } else {
      let fd;
      try {
        fd = fs.openSync(file, "wx", 0o600);
        fs.writeFileSync(fd, value);
        fs.fsyncSync(fd);
      } catch (e) {
        if (e.code === "EEXIST") throw fail("CHANGED");
        throw e;
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
    }
    this.core.store.audit("access_action");
    return { saved: true };
  }
  async exportToFolder(id, chatId, index, format) {
    const { file } = this.folderPath(id, "", "write");
    const chat = this.core.chat(chatId);
    if (!Number.isInteger(index) || chat.messages[index]?.role !== "assistant")
      throw fail("INVALID");
    const result = await exportFile(file, {
      subfolder: ".",
      format,
      content: chat.messages[index].text,
      title: chat.title,
    });
    this.require("folder", id, "write");
    this.core.store.audit("export");
    return result;
  }
  importReference(name, content) {
    this.core.assertUnlocked();
    const value = text(content, 60000),
      c = this.core.createChat({});
    c.hipaa = true;
    c.title = text(name, 100);
    this.core.saveChat(c);
    const f = {
      id: uuid(),
      name: text(name, 100) + ".txt",
      kind: "text",
      ext: ".txt",
      bytes: Buffer.from(value).toString("base64"),
      text: value,
      size: Buffer.byteLength(value),
      hipaa: true,
      ownerChat: c.id,
      updated: Date.now(),
    };
    this.core.store.put("file", f.id, f);
    this.core.store.audit("import");
    return { chat: c, file: f };
  }
}
module.exports = { AccessManager, helperCall };
