export type TargetAge = 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60;

export const TARGET_AGES: readonly TargetAge[] = [25, 30, 35, 40, 45, 50, 55, 60];

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
  targetAge: TargetAge;
  industry: string | null;
  employeeSize: EmployeeSizeBucket | null;
  tenure: TenureBucket | null;
  avgAgeBucket: AvgAgeBucket | null;
  query: string;
  visibleCount: number;
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
  estimatedSalary: number;
  rank: number;
}
