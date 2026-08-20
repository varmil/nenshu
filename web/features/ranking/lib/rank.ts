import type { CompaniesData, CurvesData, RankedCompany, RankingState } from "../types";
import { PAGE_SIZE } from "../types";
import { matchesFilters } from "./filter";
import { curveValuesInYen } from "./curve";
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
 *
 * **`state.targetAge` が `null`（実測値）なら補正を一切行わない**（ADR-0007）。
 * `estimatedSalary` は `null` のままで、並べ替えも表示も有報の `avgSalary` を使う。
 */
export function buildRankedCompanies(
  companies: CompaniesData,
  curves: CurvesData,
  state: RankingState
): RankedCompaniesResult {
  const filteredRows = companies.rows.filter(
    (row) => matchesFilters(row, companies.industries, state) && matchesQuery(row[1], state.query)
  );

  // 円に直したカーブは産業大分類ごとに1本しかないので、1,867行ぶん作り直さず使い回す。
  const curvesInYen = new Map<string, number[]>();
  const curveValuesFor = (curveKey: string) => {
    let values = curvesInYen.get(curveKey);
    if (values === undefined) {
      values = curveValuesInYen(curves.curves[curveKey]);
      curvesInYen.set(curveKey, values);
    }
    return values;
  };

  const targetAge = state.targetAge;
  const withSalary: Omit<RankedCompany, "rank">[] = filteredRows.map((row) => {
    const [id, name, tse33Idx, curveIdx, avgAge, avgTenure, avgSalary, employees, badge] = row;
    const estimatedSalary =
      targetAge === null
        ? null
        : estimateSalary(
            avgSalary,
            avgAge,
            curveValuesFor(companies.curveKeys[curveIdx]),
            curves.agePoints,
            targetAge
          );

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

  const sorted = withSalary.sort(
    (a, b) => (b.estimatedSalary ?? b.avgSalary) - (a.estimatedSalary ?? a.avgSalary)
  );

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
