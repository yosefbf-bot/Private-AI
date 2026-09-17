"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { uuid, fail } = require("./security.cjs");
function restrictedDacl(sddl, sid) {
  const dacl = sddl.split(/\r?\n/).find((line) => line.startsWith("D:"));
  if (!dacl || !/^D:[^(]*P/.test(dacl)) return false;
  const entries = [...dacl.matchAll(/\(([^)]+)\)/g)].map((m) =>
    m[1].split(";"),
  );
  return (
    entries.length >= 2 &&
    entries.every((e) => e[0] === "A" && [sid, "SY", "S-1-5-18"].includes(e[5]))
  );
}
function verifyPrivateAcl(root, sid) {
  const file = path.join(root, "acl-check-" + uuid() + ".tmp");
  try {
    execFileSync(
      path.join(
        process.env.SystemRoot || "C:\\Windows",
        "System32",
        "icacls.exe",
      ),
      [root, "/save", file, "/q"],
      { windowsHide: true, stdio: "ignore" },
    );
    if (
      !restrictedDacl(
        fs
          .readFileSync(file)
          .toString("utf16le")
          .replace(/^\uFEFF/, ""),
        sid,
      )
    )
      throw fail("STORAGE");
  } finally {
    try {
      fs.unlinkSync(file);
    } catch {}
  }
}
module.exports = { restrictedDacl, verifyPrivateAcl };
