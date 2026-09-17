"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { fail, safePath, within, uuid } = require("./security.cjs");
const FOLDERS = [
  "Incoming",
  "Completed",
  "Failed",
  "Projects",
  "Reports",
  "Exports",
  "Tasks/Queued",
  "Tasks/InProgress",
  "Tasks/Completed",
  "Tasks/Failed",
  "Tasks/Workers",
];
// A native PDF parser crash must never terminate the desktop process. Inputs and
// outputs travel in memory; the child receives neither the vault nor API keys.
function processFile(args) {
  return new Promise((resolve, reject) => {
    const entry = path.join(__dirname, "files-worker.cjs");
    const electron = !!process.versions.electron;
    let child;
    try {
      child = electron
        ? require("electron").utilityProcess.fork(entry, [], {
            serviceName: "Private AI document processing",
            stdio: "ignore",
            execArgv: ["--max-old-space-size=256"],
          })
        : require("node:child_process").fork(entry, [], {
            stdio: ["ignore", "ignore", "ignore", "ipc"],
            serialization: "advanced",
            execArgv: ["--max-old-space-size=256"],
          });
    } catch {
      return reject(fail("FILE"));
    }
    let done = false;
    const timer = setTimeout(() => finish(fail("LIMIT")), 60000);
    function finish(err, result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {}
      err ? reject(err) : resolve(result);
    }
    child.on("message", (m) =>
      m?.ok
        ? finish(null, m.result)
        : finish(fail(m?.code === "LIMIT" ? "LIMIT" : "FILE")),
    );
    child.on("error", () => finish(fail("FILE")));
    child.on("exit", () => {
      if (!done) finish(fail("FILE"));
    });
    child.once("spawn", () => {
      try {
        electron ? child.postMessage(args) : child.send(args);
      } catch {
        finish(fail("FILE"));
      }
    });
  });
}
function workspace(root, privateRoot) {
  if (typeof root !== "string" || !path.isAbsolute(root))
    throw fail("WORKSPACE");
  if (within(root, privateRoot) || within(privateRoot, root))
    throw fail("WORKSPACE");
  try {
    fs.mkdirSync(root, { recursive: true });
    const actual = fs.realpathSync(root),
      priv = fs.realpathSync(privateRoot);
    if (within(actual, priv) || within(priv, actual)) throw fail("WORKSPACE");
    for (const sub of FOLDERS)
      fs.mkdirSync(safePath(root, sub), { recursive: true });
    const probe = safePath(root, ".privateai-" + uuid());
    fs.writeFileSync(probe, "", { flag: "wx" });
    fs.unlinkSync(probe);
  } catch {
    throw fail("WORKSPACE");
  }
  return root;
}
function tableRows(content) {
  const lines = content
    .split("\n")
    .filter((l) => l.trim().startsWith("|") && l.trim().endsWith("|"));
  return lines
    .filter((l) => !/^\s*\|[\s:|\-]+\|\s*$/.test(l))
    .map((l) =>
      l
        .trim()
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim()),
    );
}
async function exportFile(
  root,
  { content, format, title = "Report", subfolder = "Reports", jobId, onPrepared },
) {
  if (!["txt", "md", "docx", "pdf", "xlsx", "csv"].includes(format))
    throw fail("FILE");
  const rows = ["xlsx", "csv"].includes(format) ? tableRows(content) : [];
  if (["xlsx", "csv"].includes(format) && !rows.length) throw fail("FILE");
  const result = await processFile({
    op: "export",
    ext: "." + format,
    content,
    title,
    rows,
  });
  const dir = safePath(root, subfolder);
  fs.mkdirSync(dir, { recursive: true });
  const name =
    (jobId
      ? "Report_" + jobId
      : "Report_" + new Date().toISOString().replace(/[:.]/g, "-")) +
    "_" +
    uuid().slice(0, 8) +
    "." +
    format;
  const file = safePath(root, path.join(subfolder, name));
  const temp = safePath(root, path.join(subfolder, "." + uuid() + ".partial"));
  onPrepared?.({relative:path.relative(root,file),sha256:require("node:crypto").createHash("sha256").update(Buffer.from(result.bytes)).digest("hex")});
  try {
    fs.writeFileSync(temp, Buffer.from(result.bytes), {
      flag: "wx",
      mode: 0o600,
    });
    const fd=fs.openSync(temp,"r+");try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    if (fs.existsSync(file)) throw fail("WORKSPACE");
    fs.renameSync(temp, file);
  } catch {
    try {
      fs.unlinkSync(temp);
    } catch {}
    throw fail("WORKSPACE");
  }
  return {
    name,
    path: file,
    relative: path.relative(root, file),
    bytes: result.bytes.length,
  };
}
module.exports = { processFile, workspace, exportFile, tableRows, FOLDERS };
