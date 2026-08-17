/**
 * id 生成。証券コード優先、欠損（非上場）は機械的フォールバックにする。
 *
 * 正確なローマ字化に必要な読み仮名辞書がリポジトリにもEDINETコードリストにも無いため、
 * 全角→半角正規化(NFKC)で拾えるASCII文字だけをprefixにし、一意性はdoc_id（EDINET書類ID、
 * 既に一意）をsuffixにすることで保証する。連番サフィックスではなくdoc_id由来にするのは、
 * 走査順序に依存しない決定的な方式にするため。
 *
 * 「読める URL」ではない点は既知の制約。Bolt 2 で企業詳細ページを作る際、正式な読み仮名
 * データを調達してから作り直す前提（docs/ranking/data-pipeline/design.md 参照）。
 */
export function makeId(row: { secCode: string; name: string; docId: string }): string {
  if (row.secCode) return row.secCode;

  const asciiPrefix = row.name
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

  const docIdSuffix = row.docId.toLowerCase();
  return asciiPrefix ? `${asciiPrefix}-${docIdSuffix}` : docIdSuffix;
}
