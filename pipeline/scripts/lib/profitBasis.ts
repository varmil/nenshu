import type { PerformanceHistoryRow } from "./csv";

/**
 * 稼ぐ力を出さない会社の判定（Issue #911・`docs/performance/profit-per-employee/design.md`）。
 *
 * **連結の経常利益が無い会社（IFRS・米国基準）は、単体の経常利益を連結の従業員数で割った値を
 * 出さない。** 単体の経常利益は連結の値の代わりにならない——最新年で240社を実測すると、
 * 連結の税引前利益に対する比の中央値が 0.59、±25% に収まるのは 21%、符号が逆の会社が15社あった
 * （連結の経常利益がある J-GAAP の会社でも単体 ÷ 連結は中央値 0.85・±25% は51%）。
 *
 * **判定は最新年で行う。** 最新年の経常利益が単体だけで、連結の従業員数がある会社
 * （直近5期がすべて単体の203社＋最新年だけ単体の37社）。旧年だけ単体で新しい年が連結の会社
 * （連結決算を後から作り始めた155社）は、旧年の単体がグループ全体なので対象にしない。
 * 連結の従業員数が無い会社（連結財務諸表を作っていない）は、単体がグループ全体なので対象にしない。
 *
 * **逆向き（連結の経常利益 ÷ 単体の従業員数）も出さない。** 最新年の経常利益が連結なのに、ランキングの
 * 行に連結の従業員数が無い会社。分母の代用（連結が無ければ単体）は、連結財務諸表を作らない会社のための
 * 規則で、連結の利益を単体の人数で割ると大きく出る。いまはクラサスケミカル1社（有価証券届出書の様式の
 * 書類で、連結の従業員数が「前期」の文脈にしか無い）。
 *
 * **レーダーの稼ぐ力（`buildPerformance`）と推移の節（`buildProfitHistory`）が同じ関数を通る。**
 * 片方だけ落とすと、同じページで推移は出るのにレーダーは掲載なし（またはその逆）になる。
 */

/** EDINETコード → その会社の経常利益の最新年の行。 */
export function latestRowsByCode(
  rows: readonly PerformanceHistoryRow[]
): Map<string, PerformanceHistoryRow> {
  const latest = new Map<string, PerformanceHistoryRow>();
  for (const row of rows) {
    const old = latest.get(row.edinetCode);
    if (old === undefined || row.year > old.year) latest.set(row.edinetCode, row);
  }
  return latest;
}

/**
 * 稼ぐ力を出さないか。
 *
 * @param latest その会社の経常利益の最新年の行（履歴が無ければ `undefined`）
 * @param employeesConsolidated ランキングの行が持つ連結の従業員数（無ければ `null`）
 */
export function isProfitBasisMismatched(
  latest: PerformanceHistoryRow | undefined,
  employeesConsolidated: number | null
): boolean {
  if (latest === undefined) return false;
  // 分子（経常利益）と分母（従業員数）の範囲がそろっているか。分母は連結があれば連結、無ければ単体
  const incomeIsGroup = latest.basis === "consolidated";
  const employeesAreGroup = employeesConsolidated !== null;
  return incomeIsGroup !== employeesAreGroup;
}
