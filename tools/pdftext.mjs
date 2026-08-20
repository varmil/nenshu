#!/usr/bin/env node
/**
 * PDF → テキスト。`docs/AI-DLC実践リファレンス_v10.pdf` を読むために置いている。
 *
 * poppler（`pdftotext`）は apt が要る＝root が要るので、どの環境でも動くように
 * mupdf の WASM ビルドを devDependency にしてある。
 *
 * **素の正規表現で PDF をパースしようとしないこと。** このPDFは ReportLab 製で
 * フォントがサブセット化されており、ToUnicode を自前で辿ると文字化けする
 * （実際に一度やって読めなかった）。
 *
 *   npm run pdftext -- docs/AI-DLC実践リファレンス_v10.pdf 13
 *   npm run pdftext -- <file.pdf> [開始ページ] [終了ページ]
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import * as mupdf from "mupdf";

const [file, from, to] = process.argv.slice(2);
if (!file) {
  console.error("usage: npm run pdftext -- <file.pdf> [firstPage] [lastPage]");
  process.exit(1);
}

const doc = mupdf.Document.openDocument(readFileSync(file), "application/pdf");
const pageCount = doc.countPages();
const start = from ? Math.max(1, Number.parseInt(from, 10)) : 1;
const end = to ? Math.min(pageCount, Number.parseInt(to, 10)) : pageCount;

console.log(`# ${basename(file)} — ${pageCount}ページ（${start}〜${end} を出力）`);
for (let i = start - 1; i < end; i++) {
  const structured = JSON.parse(
    doc.loadPage(i).toStructuredText("preserve-whitespace").asJSON()
  );
  const lines = [];
  for (const block of structured.blocks ?? []) {
    for (const line of block.lines ?? []) {
      if ((line.text ?? "").trim()) lines.push(line.text);
    }
  }
  console.log(`\n===== p.${i + 1} =====`);
  console.log(lines.join("\n"));
}
