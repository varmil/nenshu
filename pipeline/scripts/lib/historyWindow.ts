/**
 * 10年推移を会社ごとの窓に詰める規則（refresh の D5・#875・`docs/refresh/history-window/design.md`）。
 *
 * 窓の年の振り方（`historyWindowYears`）は web と共有する。ここに置くのは、CSV の行から
 * 会社ごとの右端を決めることと、行を窓の添字に置くことだけ。
 */
import { HISTORY_SPAN, historyWindowYears } from "../../../web/features/company/lib/historyWindow";

export { HISTORY_SPAN, historyWindowYears };

/**
 * 会社ごとの窓の右端（EDINETコード → 年）。**その会社の推移で値のある最新の年。**
 *
 * `salary_history.csv` の行は値のある年にしか無い（平均年収が空の行は作らない）ので、
 * 行の最新の年がそのまま右端になる。
 */
export function windowEnds(
  rows: readonly { edinetCode: string; year: number }[]
): Map<string, number> {
  const ends = new Map<string, number>();
  for (const row of rows) {
    const end = ends.get(row.edinetCode);
    if (end === undefined || row.year > end) ends.set(row.edinetCode, row.year);
  }
  return ends;
}

/** `year` が右端 `end` の窓の何番目か。窓の外なら `-1`。 */
export function indexInWindow(end: number, year: number, span: number = HISTORY_SPAN): number {
  const k = year - (end - span + 1);
  return k >= 0 && k < span ? k : -1;
}

/**
 * 全社の窓を覆う連続した年（古い順）。在籍年数の業種の中央値はこの年の並びで持ち、
 * 画面は会社の窓の年だけを引く。
 */
export function coveringYears(ends: Iterable<number>, span: number = HISTORY_SPAN): number[] {
  const list = [...ends];
  if (list.length === 0) return [];
  const last = Math.max(...list);
  const first = Math.min(...list) - span + 1;
  return historyWindowYears(last, last - first + 1);
}
