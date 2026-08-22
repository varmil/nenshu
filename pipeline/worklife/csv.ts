/**
 * 引用符と改行を含む CSV の読み書き（RFC 4180）。
 *
 * **`pipeline/scripts/lib/csv.ts` の素朴な `split(",")` は使えない。** 女性活躍DBの
 * 「男女の賃金の差異 注釈・説明」は自由記述で、718社ぶんが改行・カンマ・引用符を
 * 含む（`docs/worklife/spec.md` 1.3）。行で切ると1社の途中で切れる。
 */

/** BOM を落とす。女性活躍DBは BOM 有り／無しの2種類が配られている。 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * CSV を1行ずつ渡す。改行は CRLF・LF のどちらも受ける。
 *
 * **全件版は 64,879行 × 236列＝約1,500万セルあるので、全行を配列に溜めない。**
 * 突合に使うのは有報の1,867社ぶんだけなので、呼び出し側が要らない行をその場で
 * 捨てられるようにコールバックで渡す。
 */
export function forEachCsvRow(text: string, onRow: (row: string[], index: number) => void): void {
  const src = stripBom(text);
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let index = 0;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      // CRLF は1つの区切りとして扱う
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      onRow(row, index++);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  // 末尾に改行が無いファイルの最終行を落とさない
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    onRow(row, index++);
  }
}

/** 小さい CSV を丸ごと開く。大きいファイルには `forEachCsvRow` を使う。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  forEachCsvRow(text, (row) => rows.push(row));
  return rows;
}

/** 1セルを書き出す。引用が要るのは カンマ・引用符・改行 を含むときだけ。 */
export function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\n") + "\n";
}
