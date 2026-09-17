const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const { fixture } = require("./helpers.cjs");
const {
  workspace,
  exportFile,
  processFile,
  FOLDERS,
} = require("../source/files.cjs");
const { safePath } = require("../source/security.cjs");
test("Workspace paths with spaces are supported and all required folders are created", (t) => {
  const { core } = fixture(t);
  for (const sub of FOLDERS)
    assert.ok(
      fs.statSync(path.join(core.settings().workspace, sub)).isDirectory(),
    );
});
test("Workspace rejects private-data overlap and path traversal", (t) => {
  const { core, root, dir } = fixture(t);
  assert.throws(() => workspace(root, root));
  assert.throws(() => workspace(dir, root));
  for (const value of [
    "../outside",
    "x/../../outside",
    "C:\\private",
    "/etc/passwd",
  ])
    assert.throws(() => safePath(core.settings().workspace, value));
});
test("Workspace rejects symlink escapes", (t) => {
  const { core, dir } = fixture(t);
  fs.symlinkSync(dir, path.join(core.settings().workspace, "escape"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => safePath(core.settings().workspace, "escape/source"));
});
test("DOCX is created and its contents can be extracted locally", async (t) => {
  const { core } = fixture(t);
  const out = await exportFile(core.settings().workspace, {
    content: "# Synthetic Report\n\nThe documented result is 42.",
    format: "docx",
  });
  const parsed = await processFile({
    op: "extract",
    ext: ".docx",
    bytes: fs.readFileSync(out.path),
  });
  assert.ok(parsed.text.includes("42"));
});
test("XLSX is created from a table and analyzed locally without formula execution", async (t) => {
  const { core } = fixture(t);
  const content =
    "| Item | Value |\n| --- | --- |\n| Example | 42 |\n| Formula text | =2+2 |";
  const out = await exportFile(core.settings().workspace, {
    content,
    format: "xlsx",
  });
  const parsed = await processFile({
    op: "extract",
    ext: ".xlsx",
    bytes: fs.readFileSync(out.path),
  });
  assert.ok(parsed.text.includes("42"));
  assert.ok(parsed.text.includes("=2+2"));
  assert.equal(parsed.text.includes("[formula:"), false);
});
test("CSV formula-like values are escaped", async (t) => {
  const { core } = fixture(t);
  const out = await exportFile(core.settings().workspace, {
    content: "| Value |\n| --- |\n| =cmd |\n| +cmd |\n| @cmd |",
    format: "csv",
  });
  const csv = fs.readFileSync(out.path, "utf8");
  assert.ok(csv.includes("'=cmd"));
  assert.ok(csv.includes("'+cmd"));
  assert.ok(csv.includes("'@cmd"));
});
test("PDF is created and its text can be read back locally", async (t) => {
  const { core } = fixture(t);
  const out = await exportFile(core.settings().workspace, {
    content: "Synthetic PDF report\n\nA total of 42 items.",
    format: "pdf",
  });
  assert.equal(fs.readFileSync(out.path).subarray(0, 4).toString(), "%PDF");
  const parsed = await processFile({
    op: "extract",
    ext: ".pdf",
    bytes: fs.readFileSync(out.path),
  });
  assert.ok(parsed.text.includes("42"));
});
test("Repeated exports create unique files and leave originals intact", async (t) => {
  const { core } = fixture(t);
  const a = await exportFile(core.settings().workspace, {
      content: "one",
      format: "txt",
    }),
    b = await exportFile(core.settings().workspace, {
      content: "two",
      format: "txt",
    });
  assert.notEqual(a.path, b.path);
  assert.equal(fs.readFileSync(a.path, "utf8"), "one");
});
test("Malformed documents and unsupported types fail safely", async () => {
  await assert.rejects(
    processFile({ op: "extract", ext: ".docx", bytes: Buffer.from("broken") }),
  );
  await assert.rejects(
    processFile({ op: "extract", ext: ".exe", bytes: Buffer.from("MZ") }),
  );
});
