/**
 * 文章の中身を作った有報（refresh の D3・#873・`docs/refresh/text-period/design.md`）。
 *
 * **文章の記録（要約と分析・給与の決定方針・説明文）は、自分を作った書類を持つ。** 毎日の更新では
 * 数字が先に新しい書類へ替わり、文章は書き直すまで前の書類のまま出る（`docs/refresh/spec.md` 1.5）。
 * 文章の節が数字の側（`companies.json` の決算期・`filings.json` の書類）を借りて名乗ると、前の期の
 * 文章が新しい期を名乗ることになる。
 */
export interface FilingRef {
  /** EDINET の書類 ID（`S100YAHE` の形）。 */
  docId: string;
  /** その書類の決算期（`YYYY-MM`）。`companies.json` の `periods` と同じ形。 */
  period: string;
}

const DOC_ID = /^S1[0-9A-Z]{6}$/;
const PERIOD_END = /^(\d{4}-\d{2})-\d{2}$/;

/**
 * 成果物の列（書類 ID と `YYYY-MM-DD` の期末）から作る。**形が崩れていたらビルドを落とす**
 * ——黙って空にすると、その会社の節だけ期もリンクも無いまま配られる。
 */
export function filingRef(docId: string, periodEnd: string, where: string): FilingRef {
  const match = PERIOD_END.exec(periodEnd.trim());
  if (!DOC_ID.test(docId.trim()) || match === null) {
    throw new Error(`${where} の原文の書類が読めません（書類 ID "${docId}"・期末 "${periodEnd}"）`);
  }
  return { docId: docId.trim(), period: match[1] };
}
