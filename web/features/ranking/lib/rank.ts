import type { CompaniesData, CurvesData, RankedCompany, RankingState } from "../types";
import { estimateSalary } from "./salary";

/**
 * フィルタ→補正年収の計算→ソート→ランク付与→visibleCountで切り出し、の順で行う。
 * U3（フィルタ）・U4（検索）は「フィルタ」の位置に絞り込みステップを追加する形で乗る。
 * state.industry / employeeSize / tenure / avgAgeBucket / query はU2では常に未設定。
 */
export function buildRankedCompanies(
  companies: CompaniesData,
  curves: CurvesData,
  state: RankingState
): RankedCompany[] {
  const withSalary: Omit<RankedCompany, "rank">[] = companies.rows.map((row) => {
    const [id, name, tse33Idx, curveIdx, avgAge, avgTenure, avgSalary, employees, badge] = row;
    const curveKey = companies.curveKeys[curveIdx];
    const curveValues = curves.curves[curveKey];
    const estimatedSalary = estimateSalary(avgSalary, avgAge, curveValues, curves.agePoints, state.targetAge);

    return {
      id,
      name,
      tse33: companies.industries[tse33Idx],
      hasBadge: badge === 1,
      avgAge,
      avgTenure,
      avgSalary,
      employees,
      estimatedSalary,
    };
  });

  const sorted = withSalary.sort((a, b) => b.estimatedSalary - a.estimatedSalary);

  const ranked: RankedCompany[] = sorted.map((company, index) => ({
    ...company,
    rank: index + 1,
  }));

  return ranked.slice(0, state.visibleCount);
}
