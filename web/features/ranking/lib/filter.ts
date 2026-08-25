import type { AvgAgeBucket, CompanyRow, EmployeeSizeBucket, RankingState, TenureBucket } from "../types";

/**
 * 閾値は実データ検証済み（docs/ranking/ranking-filters/plan.md）。
 * `< / < / それ以上` の3区分で2,961社を過不足なく分割する。
 */
export function classifyEmployeeSize(employees: number): EmployeeSizeBucket {
  if (employees < 300) return "under300";
  if (employees < 1000) return "300to1000";
  return "1000plus";
}

export function classifyTenure(avgTenure: number): TenureBucket {
  if (avgTenure < 13) return "under13";
  if (avgTenure < 17) return "13to17";
  return "17plus";
}

export function classifyAvgAgeBucket(avgAge: number): AvgAgeBucket {
  if (avgAge < 40) return "under40";
  if (avgAge < 43) return "40to43";
  return "43plus";
}

export function matchesFilters(row: CompanyRow, industries: string[], state: RankingState): boolean {
  const [, , tse33Idx, , avgAge, avgTenure, , employees] = row;
  if (state.industry !== null && industries[tse33Idx] !== state.industry) return false;
  if (state.employeeSize !== null && classifyEmployeeSize(employees) !== state.employeeSize) return false;
  if (state.tenure !== null && classifyTenure(avgTenure) !== state.tenure) return false;
  if (state.avgAgeBucket !== null && classifyAvgAgeBucket(avgAge) !== state.avgAgeBucket) return false;
  return true;
}
