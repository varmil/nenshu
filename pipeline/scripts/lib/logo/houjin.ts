import { execFileSync } from "node:child_process";

/**
 * EDINETコード一覧（`Edinetcode.zip`）から EDINETコード → 法人番号 を作る。
 * CSV は CP932。ヘッダは2行目にある（1行目はダウンロード実行日）。
 */
export function parseEdinetCodeList(csvText: string): Map<string, string> {
  const lines = csvText.split(/\r?\n/).slice(1);
  const header = splitCsvLine(lines[0] ?? "");
  const codeIdx = header.findIndex((h) => h.includes("ＥＤＩＮＥＴコード"));
  const houjinIdx = header.findIndex((h) => h.includes("法人番号"));
  if (codeIdx === -1 || houjinIdx === -1) {
    throw new Error("EDINETコード一覧の列が想定と違います");
  }
  const map = new Map<string, string>();
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    const code = cells[codeIdx];
    const houjin = (cells[houjinIdx] ?? "").trim();
    if (code && houjin) map.set(code, houjin);
  }
  return map;
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** zip の中の唯一の CSV を CP932 として読む。 */
export function readEdinetCodeZip(zipPath: string): Map<string, string> {
  const raw = execFileSync("unzip", ["-p", zipPath], { maxBuffer: 64 * 1024 * 1024 });
  const text = new TextDecoder("shift_jis").decode(raw);
  return parseEdinetCodeList(text);
}
