"use strict";
const fs = require("node:fs");
function limit(s) {
  if (s.length > 350000) throw new Error("LIMIT");
  return s;
}
function zipGuard(b) {
  if (b.readUInt32LE(0) !== 0x04034b50) throw Error("FILE");
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (b.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw Error("FILE");
  const count = b.readUInt16LE(end + 10);
  let p = b.readUInt32LE(end + 16),
    size = 0;
  if (count > 10000 || count === 65535) throw Error("LIMIT");
  for (let i = 0; i < count; i++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50)
      throw Error("FILE");
    size += b.readUInt32LE(p + 24);
    if (size > 80000000) throw Error("LIMIT");
    p +=
      46 +
      b.readUInt16LE(p + 28) +
      b.readUInt16LE(p + 30) +
      b.readUInt16LE(p + 32);
  }
}
function csvCell(v) {
  let s = String(v ?? "");
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
async function main(workerData) {
  const { op, ext } = workerData;
  const b = Buffer.from(workerData.bytes || []);
  if (op === "extract") {
    if (b.length > 20000000) throw Error("LIMIT");
    if ([".txt", ".md", ".csv"].includes(ext))
      return { text: limit(b.toString("utf8")) };
    if (ext === ".ics") {
      const value = limit(b.toString("utf8"));
      if (
        !value.includes("BEGIN:VCALENDAR") ||
        !value.includes("END:VCALENDAR")
      )
        throw Error("FILE");
      return { text: value };
    }
    if (ext === ".eml") {
      if (
        !/^(From|To|Subject|MIME-Version|Content-Type):/im.test(
          b.subarray(0, 32000).toString("utf8"),
        )
      )
        throw Error("FILE");
      const mail = await require("mailparser").simpleParser(b, {
        skipTextToHtml: true,
        skipImageLinks: true,
        skipTextLinks: true,
        maxHtmlLengthToParse: 350000,
      });
      if (!mail.text?.trim()) throw Error("FILE");
      return {
        text: limit(
          `Subject: ${mail.subject || ""}\nFrom: ${mail.from?.text || ""}\nTo: ${mail.to?.text || ""}\nDate: ${mail.date?.toISOString() || ""}\n\n${mail.text}\n\n[Email attachments were not analyzed. Save and attach them separately if needed.]`,
        ),
      };
    }
    if (ext === ".msg") {
      const MsgReader = require("@kenjiuno/msgreader").default;
      const mail = new MsgReader(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      ).getFileData();
      let body = mail.body;
      if (!body?.trim() && mail.bodyHtml) {
        const parsed = await require("mailparser").simpleParser(
          Buffer.from(
            "Content-Type: text/html; charset=utf-8\r\nMIME-Version: 1.0\r\n\r\n" +
              mail.bodyHtml,
          ),
          {
            skipTextToHtml: true,
            skipImageLinks: true,
            skipTextLinks: true,
            maxHtmlLengthToParse: 350000,
          },
        );
        body = parsed.text;
      }
      if (mail.error || !body?.trim()) throw Error("FILE");
      return {
        text: limit(
          `Subject: ${mail.subject || ""}\nFrom: ${mail.senderName || ""} ${mail.senderEmail || ""}\nTo: ${(mail.recipients || []).map((r) => r.name || r.email || "").join(", ")}\n\n${body}\n\n[Email attachments were not analyzed. Save and attach them separately if needed.]`,
        ),
      };
    }
    if (ext === ".docx") {
      zipGuard(b);
      const r = await require("mammoth").extractRawText({ buffer: b });
      return { text: limit(r.value), warnings: r.messages.length };
    }
    if (ext === ".xlsx") {
      zipGuard(b);
      const Excel = require("exceljs");
      const wb = new Excel.Workbook();
      await wb.xlsx.load(b);
      let out = "";
      for (const sheet of wb.worksheets) {
        out += "\nSHEET: " + sheet.name + "\n";
        if (sheet.rowCount > 10000 || sheet.columnCount > 200)
          throw Error("LIMIT");
        sheet.eachRow((row, n) => {
          out +=
            "Row " +
            n +
            ": " +
            row.values
              .slice(1)
              .map((v) => {
                if (v && typeof v === "object") {
                  if (v.formula)
                    return (
                      "[formula: " +
                      v.formula +
                      "; cached result: " +
                      String(v.result ?? "not available") +
                      "]"
                    );
                  if (v.richText) return v.richText.map((r) => r.text).join("");
                  if (v.text) return v.text;
                }
                return String(v ?? "");
              })
              .join(" | ") +
            "\n";
          limit(out);
        });
      }
      return { text: out };
    }
    if (ext === ".pdf") {
      const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const job = pdf.getDocument({
        data: new Uint8Array(b),
        isEvalSupported: false,
        useSystemFonts: false,
        disableFontFace: true,
        verbosity: 0,
      });
      try {
        const doc = await job.promise;
        if (doc.numPages > 300) throw Error("LIMIT");
        let out = "";
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          const content = await page.getTextContent();
          out +=
            "\n[Page " +
            p +
            "]\n" +
            content.items.map((i) => i.str + (i.hasEOL ? "\n" : " ")).join("") +
            "\n";
          limit(out);
        }
        if (out.replace(/\[Page \d+\]/g, "").trim().length < 10)
          throw Error("FILE");
        return { text: out };
      } finally {
        await job.destroy();
      }
    }
    if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      const valid =
        ext === ".png"
          ? b
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : ext === ".webp"
            ? b.subarray(0, 4).toString() === "RIFF" &&
              b.subarray(8, 12).toString() === "WEBP"
            : b[0] === 255 && b[1] === 216;
      if (!valid) throw Error("FILE");
      return {
        image: true,
        mime:
          ext === ".png"
            ? "image/png"
            : ext === ".webp"
              ? "image/webp"
              : "image/jpeg",
      };
    }
    throw Error("FILE");
  }
  const body = String(workerData.content || "");
  limit(body);
  const title = String(workerData.title || "Private AI report").slice(0, 150);
  if (ext === ".txt" || ext === ".md") return { bytes: Buffer.from(body) };
  const rows = workerData.rows || [];
  if (
    rows.length > 10000 ||
    rows.some((r) => !Array.isArray(r) || r.length > 200)
  )
    throw Error("LIMIT");
  if (ext === ".csv")
    return {
      bytes: Buffer.from(
        "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"),
      ),
    };
  if (ext === ".xlsx") {
    const Excel = require("exceljs");
    const wb = new Excel.Workbook();
    wb.creator = "Private AI";
    const sheet = wb.addWorksheet("Report");
    for (const row of rows)
      sheet.addRow(
        row.map((v) => {
          const s = String(v ?? "");
          return /^-?(0|[1-9]\d{0,13})(\.\d+)?$/.test(s) &&
            s.replace(/\D/g, "").length <= 15
            ? Number(s)
            : s;
        }),
      );
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF215B53" },
    };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.columns.forEach((c) => (c.width = 28));
    sheet.eachRow((r) => {
      r.alignment = { vertical: "top", wrapText: true };
    });
    return { bytes: Buffer.from(await wb.xlsx.writeBuffer()) };
  }
  if (ext === ".docx") {
    return { bytes: await require("./report-format.cjs").word(body, title) };
  }
  if (ext === ".pdf") {
    return { bytes: await require("./report-format.cjs").pdf(body, title) };
  }
  throw Error("FILE");
}
function receive(data) {
  const reply = (m) =>
    process.parentPort ? process.parentPort.postMessage(m) : process.send(m);
  main(data)
    .then((result) => reply({ ok: true, result }))
    .catch((e) =>
      reply({ ok: false, code: e.message === "LIMIT" ? "LIMIT" : "FILE" }),
    );
}
if (process.parentPort)
  process.parentPort.once("message", (event) => receive(event.data));
else process.once("message", receive);
