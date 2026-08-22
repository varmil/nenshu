import type {
  CompaniesData,
  CurvesData,
  RankedCompany,
  RankingState,
  SortKey,
  SortSelection,
} from "../types";
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
  /**
   * **そのページに出ている金額の最大値**（円）。年収バーはこれを100%として引く
   * （spec.md 1.11）。0件なら 0。
   *
   * ページ切り出しの**後**に採る。ページ・フィルタ・並び替え・表示基準のどれが
   * 変わっても基準が取り直されるのは、この1点に閉じているためである。とくに
   * 表示基準の切替では金額そのものが別の系列に変わるので、片方の基準で両方を
   * 描くと年齢そろえに切り替えたとき棒だけ元の縮尺で残る。
   */
  pageMaxSalary: number;
}

/** 表示に使う金額。実測値なら有報そのまま、年齢そろえなら推定値（ADR-0007）。 */
export function displaySalary(company: Pick<RankedCompany, "avgSalary" | "estimatedSalary">) {
  return company.estimatedSalary ?? company.avgSalary;
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

  /*
   * **絞り込みの前に全1,867社ぶんの金額を出す。** 偏差値の隣に置く「上位◯%」は
   * 母集団の中での位置なので、絞り込んだあとの並びからは出せない（`docs/product/
   * glossary.md`: 偏差値は単独で出さない）。ここで一度だけ全件を計算し、絞り込みは
   * そのあとに掛ける——絞り込みごとに2回計算しないための順序である。
   */
  const targetAge = state.targetAge;
  const withSalary = companies.rows.map((row) => {
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
      row,
      company: {
        id,
        name,
        tse33: companies.industries[tse33Idx],
        hasBadge: badge === 1,
        avgAge,
        avgTenure,
        avgSalary,
        employees,
        estimatedSalary,
      },
    };
  });

  // 全体の並び。ここで振るのが母集団の中での位置（上位◯%の分母は全1,867社）。
  withSalary.sort((a, b) => displaySalary(b.company) - displaySalary(a.company));

  // 順位は絞り込んだあとに1から振り直す（AC-3）。上位◯%はそれとは別に全体で数える。
  const ranked: RankedCompany[] = withSalary
    .map(({ row, company }, index) => ({ row, company, populationRank: index + 1 }))
    .filter(
      ({ row, company }) =>
        matchesFilters(row, companies.industries, state) && matchesQuery(company.name, state.query)
    )
    .map(({ company, populationRank }, index) => ({ ...company, populationRank, rank: index + 1 }));

  const ordered = applySort(ranked, state.sort);

  const totalCount = ordered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(state.page, totalPages);
  const pageCompanies = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return {
    companies: pageCompanies,
    totalCount,
    pageMaxSalary: pageCompanies.reduce((max, c) => Math.max(max, displaySalary(c)), 0),
  };
}

/** 軸ごとの比較。**どれも昇順で書き、向きは呼ぶ側が符号で反転させる。** */
const SORT_COMPARATORS: Record<SortKey, (a: RankedCompany, b: RankedCompany) => number> = {
  salary: (a, b) => displaySalary(a) - displaySalary(b),
  age: (a, b) => a.avgAge - b.avgAge,
  employees: (a, b) => a.employees - b.employees,
};

/**
 * 表示の並び替え（spec.md 1.10）。**`rank` は書き換えない。**
 *
 * `Array.prototype.sort` は安定なので、平均年齢・従業員数が同じ会社どうしは
 * 金額の降順のまま残る。
 *
 * **既定（年収が高い順）だけは並べ替えずに返す。** 渡ってくる配列は母集団の順位を
 * 振るために既に表示基準の金額の降順になっており、同じ並びを作り直す意味がない
 * （Workers Free の CPU 10ms/リクエストに対して、1,867件のソート1回ぶんの節約）。
 */
function applySort(companies: RankedCompany[], { key, order }: SortSelection): RankedCompany[] {
  if (key === "salary" && order === "desc") return companies;
  const compare = SORT_COMPARATORS[key];
  const sign = order === "asc" ? 1 : -1;
  return [...companies].sort((a, b) => sign * compare(a, b));
}
