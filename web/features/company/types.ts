import type { TargetAge } from "@/features/ranking/types";

/**
 * 企業詳細ページが使う母集団統計。`pipeline/scripts/build-data.ts` が生成する。
 *
 * 順位は「その年齢時点の推定年収で全1,867社を並べたときの位置」なので、1社ぶんを
 * 出すにも母集団全体の推定が要る。ビルド時に確定させておき、リクエスト時は当該
 * 1社ぶんの計算だけで済ませる（`docs/company/company-page/design.md` 参照）。
 *
 * `rankAll` / `rankIndustry` は `companies.rows` と同じ並びの配列。会社IDをキーに
 * した辞書にしないのは、ページが id から行番号を引く必要が既にあり、その添字を
 * そのまま使えるため。
 */
export interface CompanyStatsData {
  /**
   * 表示基準の並び。**先頭の `null` が「実測値」**で、続いて TARGET_AGES と同じ8点
   * （ADR-0007）。population / rankAll / rankIndustry はすべてこの並びの添字で引く。
   */
  bases: (number | null)[];
  /** 母集団の社数。 */
  count: number;
  /** 円・整数。bases と同じ並び。sd は母標準偏差（n で割る）。 */
  population: { mean: number; sd: number }[];
  /** companies.industries と同じ並びの社数。 */
  industryCounts: number[];
  /** [行][表示基準] の全体順位。同額は同順位。 */
  rankAll: number[][];
  /** [行][表示基準] の業界内順位。 */
  rankIndustry: number[][];
}

/** 1つの表示基準における、その会社の位置。 */
export interface CompanyAgeStats {
  /** `null` は実測値（有報の平均年間給与そのまま）。ADR-0007。 */
  targetAge: TargetAge | null;
  /** その表示基準での金額（円）。実測値なら有報の平均年間給与そのもの。 */
  salary: number;
  rankAll: number;
  rankIndustry: number;
  /** 全体順位 ÷ 母集団の社数 × 100。 */
  topPercent: number;
  /** 50 + 10 ×（金額 − 平均）÷ 標準偏差。分布が右に裾を引くため100を超える。 */
  deviation: number;
  /** 金額 − 母集団の平均（円）。 */
  diffFromMean: number;
  /** 母集団の平均（円）。 */
  populationMean: number;
}

/** 企業詳細ページに渡す1社ぶんのすべて。8年齢ぶんを最初から持たせる。 */
export interface CompanyView {
  id: string;
  name: string;
  tse33: string;
  hasBadge: boolean;
  avgAge: number;
  avgTenure: number;
  avgSalary: number;
  employees: number;
  /** 全体の社数（1,867）。 */
  totalCount: number;
  /** 同じ業種の社数。 */
  industryCount: number;
  /**
   * `stats.json` の `bases` と同じ並びの9件（先頭が実測値、続いて8年齢）。
   * 表示基準スイッチはこれを引くだけ。
   */
  byBasis: CompanyAgeStats[];
}
