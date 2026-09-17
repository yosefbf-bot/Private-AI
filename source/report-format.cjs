"use strict";
const fs = require("node:fs"),
  path = require("node:path");
function plain(tokens = []) {
  return tokens
    .map((t) =>
      t.type === "html"
        ? ""
        : t.type === "image"
          ? "[Image omitted]"
          : t.type === "br"
            ? "\n"
            : t.tokens
              ? plain(t.tokens)
              : t.text || t.raw || "",
    )
    .join("");
}
async function word(body, title) {
  const { marked } = await import("marked"),
    d = require("docx");
  const inline = (tokens = [], style = {}) =>
    tokens.flatMap((t) => {
      if (t.type === "html") return [];
      if (t.type === "strong" || t.type === "em")
        return inline(t.tokens, {
          ...style,
          [t.type === "strong" ? "bold" : "italics"]: true,
        });
      if (t.type === "br") return [new d.TextRun({ ...style, break: 1 })];
      if (t.tokens) return inline(t.tokens, style);
      return [
        new d.TextRun({
          ...style,
          text: t.type === "image" ? "[Image omitted]" : t.text || t.raw || "",
          ...(t.type === "codespan" ? { font: "Consolas" } : {}),
        }),
      ];
    });
  const paragraph = (tokens, options = {}) =>
    new d.Paragraph({
      children: inline(tokens),
      spacing: { after: 140 },
      ...options,
    });
  function render(tokens) {
    const out = [];
    for (const t of tokens) {
      if (t.type === "heading")
        out.push(
          paragraph(t.tokens, {
            heading: d.HeadingLevel["HEADING_" + Math.min(t.depth, 6)],
          }),
        );
      else if (t.type === "paragraph" || t.type === "text")
        out.push(paragraph(t.tokens || [{ text: t.text }]));
      else if (t.type === "list")
        t.items.forEach((item, i) =>
          out.push(
            paragraph(
              [
                { text: t.ordered ? `${Number(t.start || 1) + i}. ` : "" },
                ...(item.tokens?.flatMap(
                  (x) => x.tokens || [{ text: x.text || "" }],
                ) || []),
              ],
              t.ordered ? {} : { bullet: { level: 0 } },
            ),
          ),
        );
      else if (t.type === "blockquote") out.push(...render(t.tokens));
      else if (t.type === "code")
        out.push(
          new d.Paragraph({
            children: [
              new d.TextRun({ text: t.text, font: "Consolas", size: 19 }),
            ],
            shading: { fill: "F1F3F5" },
            spacing: { before: 120, after: 160 },
          }),
        );
      else if (t.type === "table") {
        if (t.header.length > 20 || t.rows.length > 10000) throw Error("LIMIT");
        out.push(
          new d.Table({
            width: { size: 100, type: d.WidthType.PERCENTAGE },
            rows: [t.header, ...t.rows].map(
              (row, i) =>
                new d.TableRow({
                  tableHeader: i === 0,
                  children: row.map(
                    (cell) =>
                      new d.TableCell({
                        shading: i === 0 ? { fill: "E8F0ED" } : undefined,
                        children: [
                          new d.Paragraph({
                            children: inline(
                              cell.tokens,
                              i === 0 ? { bold: true } : {},
                            ),
                            spacing: { after: 100 },
                          }),
                        ],
                      }),
                  ),
                }),
            ),
          }),
        );
        out.push(new d.Paragraph(""));
      }
    }
    return out;
  }
  return d.Packer.toBuffer(
    new d.Document({
      creator: "Private AI",
      title,
      styles: {
        default: {
          document: {
            run: { font: "Calibri", size: 22 },
            paragraph: { spacing: { after: 140 } },
          },
          heading1: { run: { size: 36, bold: true, color: "215B53" } },
          heading2: { run: { size: 28, bold: true, color: "215B53" } },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
            },
          },
          children: render(marked.lexer(body, { gfm: true })),
        },
      ],
    }),
  );
}
async function pdf(body, title) {
  const { marked } = await import("marked"),
    PDF = require("pdfkit");
  return new Promise((resolve, reject) => {
    const doc = new PDF({
        margin: 50,
        size: "LETTER",
        info: { Title: title, Author: "Private AI" },
      }),
      chunks = [];
    doc.on("data", (b) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const win = process.platform === "win32",
      root = win
        ? path.join(process.env.SystemRoot || "C:\\Windows", "Fonts")
        : "/usr/share/fonts/truetype/dejavu";
    const normal = path.join(root, win ? "segoeui.ttf" : "DejaVuSans.ttf"),
      bold = path.join(root, win ? "segoeuib.ttf" : "DejaVuSans-Bold.ttf");
    const font = fs.existsSync(normal) ? normal : "Helvetica",
      strong = fs.existsSync(bold) ? bold : "Helvetica-Bold";
    const text = (value, size = 11, heading = false) => {
      doc
        .font(heading ? strong : font)
        .fontSize(size)
        .fillColor(heading ? "#215B53" : "#172B26")
        .text(value, { lineGap: 3 });
      doc.moveDown(0.5);
    };
    function render(tokens) {
      for (const t of tokens) {
        if (t.type === "heading")
          text(
            plain(t.tokens),
            t.depth === 1 ? 20 : t.depth === 2 ? 15 : 12,
            true,
          );
        else if (t.type === "paragraph" || t.type === "text")
          text(t.tokens ? plain(t.tokens) : t.text);
        else if (t.type === "list")
          t.items.forEach((item, i) =>
            text(
              (t.ordered ? `${Number(t.start || 1) + i}. ` : "• ") +
                plain(item.tokens),
            ),
          );
        else if (t.type === "blockquote") render(t.tokens);
        else if (t.type === "code") text(t.text, 9);
        else if (t.type === "table") {
          if (t.header.length > 20 || t.rows.length > 10000)
            throw Error("LIMIT");
          doc.font(font).fontSize(10).fillColor("#172B26");
          doc.table({
            data: [t.header, ...t.rows].map((row) =>
              row.map((c) => plain(c.tokens)),
            ),
            rowStyles: (i) =>
              i === 0
                ? { backgroundColor: "#E8F0ED", border: { bottom: 1 } }
                : { border: { bottom: 0.3 } },
            defaultStyle: { padding: 6 },
          });
          doc.moveDown(0.7);
        }
      }
    }
    try {
      render(marked.lexer(body, { gfm: true }));
      doc.end();
    } catch (e) {
      reject(e);
      doc.destroy();
    }
  });
}
module.exports = { word, pdf };
