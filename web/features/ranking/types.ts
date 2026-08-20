export type TargetAge = 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60;

export const TARGET_AGES: readonly TargetAge[] = [25, 30, 35, 40, 45, 50, 55, 60];

/** 1ページあたりの表示件数。 */
export const PAGE_SIZE = 100;

export type EmployeeSizeBucket = "under300" | "300to1000" | "1000plus";
export type TenureBucket = "under13" | "13to17" | "17plus";
export type AvgAgeBucket = "under40" | "40to43" | "43plus";

export type CompanyRow = [
  id: string,
  name: string,
  tse33Idx: number,
  curveIdx: number,
  avgAge: number,
  avgTenure: number,
  avgSalary: number,
  employees: number,
  badge: 0 | 1,
];

export interface CompaniesData {
  meta: { version: string; count: number; generatedAt: string };
  industries: string[];
  curveKeys: string[];
  rows: CompanyRow[];
}

export interface CurvesData {
  agePoints: number[];
  curves: Record<string, number[]>;
}

export interface RankingState {
  /**
   * 表示基準。`null` は「実測値」＝有報の平均年間給与そのまま（既定）で、
   * 数値なら「年齢そろえ」＝その年齢に補正した推定年収を出す（ADR-0007）。
   *
   * モードと年齢を別々のフィールドに分けていない。分けると「実測値なのに年齢が
   * 入っている」状態が表現できてしまい、どちらを優先するかの分岐がURL・state・
   * 描画のそれぞれに要る。1つの値にすれば矛盾した状態を型の上で作れない。
   */
  targetAge: TargetAge | null;
  industry: string | null;
  employeeSize: EmployeeSizeBucket | null;
  tenure: TenureBucket | null;
  avgAgeBucket: AvgAgeBucket | null;
  query: string;
  /** 1始まり。 */
  page: number;
}

export interface RankedCompany {
  id: string;
  name: string;
  tse33: string;
  hasBadge: boolean;
  avgAge: number;
  avgTenure: number;
  avgSalary: number;
  employees: number;
  /** 年齢そろえのときの推定年収（円）。実測値のときは `null`（`avgSalary` を出す）。 */
  estimatedSalary: number | null;
  rank: number;
}
