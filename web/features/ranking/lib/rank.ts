import type { CompaniesData, CurvesData, RankedCompany, RankingState } from "../types";
import { PAGE_SIZE } from "../types";
import { matchesFilters } from "./filter";
import { matchesQuery } from "./search";
import { estimateSalary } from "./salary";

export interface RankedCompaniesResult {
  /** 現在ページぶん（最大PAGE_SIZE件）。 */
  companies: RankedCompany[];
  /** フィルタ後・ページ切り出し前の総件数。0件判定・総ページ数の算出に使う。 */
  totalCount: number;
}

/**
 * フィルタ→補正年収の計算→ソート→ランク付与→ページ切り出し、の順で行う。
 * 要求されたpageが総ページ数を超える場合は最終ページにクランプする（空ページを見せない）。
 */
export function buildRankedCompanies(
  companies: CompaniesData,
  curves: CurvesData,
  state: RankingState
): RankedCompaniesResult {
  const filteredRows = companies.rows.filter(
    (row) => matchesFilters(row, companies.industries, state) && matchesQuery(row[1], state.query)
  );

  const withSalary: Omit<RankedCompany, "rank">[] = filteredRows.map((row) => {
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

  const totalCount = ranked.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(state.page, totalPages);

  return {
    companies: ranked.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    totalCount,
  };
}
