import type { CompaniesData, CurvesData, TargetAge } from "@/features/ranking/types";
import { curveValuesInYen } from "@/features/ranking/lib/curve";
import { estimateSalary } from "@/features/ranking/lib/salary";
import type { CompanyAgeStats, CompanyStatsData, CompanyView } from "../types";
import { binOf, deviationScore, topPercent } from "./stats";
import { findNeighbors } from "./neighbors";

/**
 * 企業詳細ページ1枚ぶんの表示データを作る。
 *
 * リクエスト時にやるのは**この1社ぶんの8年齢＝16回の補間**だけ。母集団の順位と
 * 統計は `stats.json` に確定済みで、ここでは引くだけになる（理由は
 * `docs/company/company-page/design.md`）。
 *
 * 見つからなければ `null` を返す。呼び出し側（`app/company/[id]/page.tsx`）が
 * `notFound()` に変換する。
 */
export function buildCompanyView(
  companies: CompaniesData,
  curves: CurvesData,
  stats: CompanyStatsData,
  id: string
): CompanyView | null {
  const index = findRowIndex(companies, id);
  if (index === -1) return null;

  const [rowId, name, tse33Idx, curveIdx, avgAge, avgTenure, avgSalary, employees, badge] =
    companies.rows[index];
  const curveValues = curveValuesInYen(curves.curves[companies.curveKeys[curveIdx]]);

  // stats.json の `bases`（先頭が実測値、続いて8年齢）と同じ並びで作る。
  // ここで並びがずれると別の表示基準の順位を出すことになる（ADR-0007）。
  const byBasis: CompanyAgeStats[] = stats.bases.map((basis, k) => {
    const targetAge = basis === null ? null : (basis as TargetAge);
    const salary =
      targetAge === null
        ? avgSalary
        : estimateSalary(avgSalary, avgAge, curveValues, curves.agePoints, targetAge);
    const { mean, sd } = stats.population[k];
    const rankAll = stats.rankAll[index][k];
    const distribution = stats.distribution[k];
    return {
      targetAge,
      salary,
      rankAll,
      rankIndustry: stats.rankIndustry[index][k],
      topPercent: topPercent(rankAll, stats.count),
      deviation: deviationScore(salary, mean, sd),
      diffFromMean: salary - mean,
      populationMean: mean,
      populationMedian: distribution.median,
      distribution,
      bin: binOf(distribution, salary),
      // 9基準ぶんまとめて出す。1業種は最大173社なので、実測 0.05ms/基準に収まる。
      neighbors: findNeighbors(companies, curves, rowId, targetAge),
    };
  });

  return {
    id: rowId,
    name,
    tse33: companies.industries[tse33Idx],
    hasBadge: badge === 1,
    avgAge,
    avgTenure,
    avgSalary,
    employees,
    totalCount: stats.count,
    industryCount: stats.industryCounts[tse33Idx],
    byBasis,
  };
}

/**
 * id → 行番号。1,867行の走査を毎リクエスト繰り返さないよう、isolate ごとに
 * 1度だけ索引を作る。`companies` は `import` した固定のオブジェクトなので
 * WeakMap のキーとして安定する。
 *
 * **`stats.json` と `worklife.json` は `companies.rows` と同じ並びの配列**なので、
 * ここで引いた添字がそのまま両方の行番号になる（W1・Issue #150）。**別々に
 * 索引を作らない**——2つの引き方があると、片方だけずれても気づけない。
 */
const indexCache = new WeakMap<CompaniesData, Map<string, number>>();

export function findRowIndex(companies: CompaniesData, id: string): number {
  let index = indexCache.get(companies);
  if (index === undefined) {
    index = new Map(companies.rows.map((row, i) => [row[0], i]));
    indexCache.set(companies, index);
  }
  return index.get(id) ?? -1;
}
