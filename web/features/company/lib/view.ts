import type { CompaniesData, CurvesData } from "@/features/ranking/types";
import { TARGET_AGES } from "@/features/ranking/types";
import { curveValuesInYen } from "@/features/ranking/lib/curve";
import { estimateSalary } from "@/features/ranking/lib/salary";
import type { CompanyAgeStats, CompanyStatsData, CompanyView } from "../types";
import { deviationScore, topPercent } from "./stats";

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

  const byAge: CompanyAgeStats[] = TARGET_AGES.map((targetAge, k) => {
    const estimatedSalary = estimateSalary(
      avgSalary,
      avgAge,
      curveValues,
      curves.agePoints,
      targetAge
    );
    const { mean, sd } = stats.population[k];
    const rankAll = stats.rankAll[index][k];
    return {
      targetAge,
      estimatedSalary,
      rankAll,
      rankIndustry: stats.rankIndustry[index][k],
      topPercent: topPercent(rankAll, stats.count),
      deviation: deviationScore(estimatedSalary, mean, sd),
      diffFromMean: estimatedSalary - mean,
      populationMean: mean,
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
    byAge,
  };
}

/**
 * id → 行番号。1,867行の走査を毎リクエスト繰り返さないよう、isolate ごとに
 * 1度だけ索引を作る。`companies` は `import` した固定のオブジェクトなので
 * WeakMap のキーとして安定する。
 */
const indexCache = new WeakMap<CompaniesData, Map<string, number>>();

function findRowIndex(companies: CompaniesData, id: string): number {
  let index = indexCache.get(companies);
  if (index === undefined) {
    index = new Map(companies.rows.map((row, i) => [row[0], i]));
    indexCache.set(companies, index);
  }
  return index.get(id) ?? -1;
}
