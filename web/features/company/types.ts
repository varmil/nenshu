import type { TargetAge } from "@/features/ranking/types";
import type { NeighborCompany } from "./lib/neighbors";

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
  /** bases と同じ並びの分布（C2）。中位と9ビンのヒストグラム。 */
  distribution: DistributionData[];
  /** companies.industries と同じ並びの社数。 */
  industryCounts: number[];
  /** [行][表示基準] の全体順位。同額は同順位。 */
  rankAll: number[][];
  /** [行][表示基準] の業界内順位。 */
  rankIndustry: number[][];
}

/**
 * 1つの表示基準における母集団の分布（`docs/company/spec.md` 1.13）。
 *
 * **階級は表示基準ごとに違う。** 25歳そろえは 249〜788万円、実測値は
 * 332〜2,178万円で、同じ区切りを当てると片方は9ビンのうち7つが空になる。
 * 生成の規則は `pipeline/scripts/build-data.ts` の `buildDistribution`。
 */
export interface DistributionData {
  /** 中位（円）。実在する会社の金額をそのまま採っている。 */
  median: number;
  /** 先頭ビンの下限（円）。**これ未満はすべて先頭ビンに入る。** */
  min: number;
  /** 階級幅（円）。 */
  width: number;
  /** 9ビンの社数。**末尾ビンは `min + width×8` 以上をすべて含む。** */
  counts: number[];
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
  /** 母集団の中位（円）。位置バーの印に使う。 */
  populationMedian: number;
  /** その表示基準の母集団の分布。ヒストグラムに使う。 */
  distribution: DistributionData;
  /** その会社が入るビンの添字（0〜8）。 */
  bin: number;
  /**
   * 同じ業種で金額が近い会社（spec 1.12）。**表示基準ごとに別の5社**になる。
   *
   * サーバーで9基準ぶんまとめて出しておく。クライアントで出すには
   * `companies.json` 全件が要り、「送るのは当該1社ぶんだけ」（spec 2.）を壊す。
   */
  neighbors: NeighborCompany[];
}

/**
 * 平均年収の10年推移（timeseries 施策・T1）。
 *
 * **表示基準と独立。** 年齢そろえを選んでも過去の有報の数字は変わらないので、
 * `byBasis` の中ではなくここに置く（`docs/timeseries/spec.md` 2.2）。
 * その年の有報が無ければ `null`。内挿しない。
 */
export interface SalaryHistory {
  years: number[];
  values: (number | null)[];
}

/**
 * 稼ぐ力の10年推移（performance 施策・P2・Issue #168）。
 *
 * **表示基準と独立。** 年齢そろえを選んでも過去の経常利益は変わらないので、
 * `SalaryHistory` と同じく `byBasis` の外に置く。
 *
 * 3本とも `years` と同じ長さ。**その年の値が無ければ `null`。内挿しない。**
 * `profit` だけが `null` の年がありうる——経常利益は1書類に5期ぶん入っているが、
 * **従業員数はその年の書類の当期からしか取れない**ため。
 */
export interface ProfitHistory {
  years: number[];
  /** 一人当たり経常利益（円）。 */
  profit: (number | null)[];
  /** 経常利益（円）。**赤字は負のまま。** */
  income: (number | null)[];
  /** 連結の従業員数（人）。連結が無い年は単体で代用してある。 */
  employees: (number | null)[];
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
