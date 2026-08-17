import { TARGET_AGES } from "../types";
import type { AvgAgeBucket, EmployeeSizeBucket, RankingState, TargetAge, TenureBucket } from "../types";

export const INITIAL_STATE: RankingState = {
  targetAge: 35,
  industry: null,
  employeeSize: null,
  tenure: null,
  avgAgeBucket: null,
  query: "",
  visibleCount: 100,
};

const EMPLOYEE_SIZE_TO_PARAM: Record<EmployeeSizeBucket, string> = {
  under300: "-300",
  "300to1000": "300-1000",
  "1000plus": "1000-",
};
const TENURE_TO_PARAM: Record<TenureBucket, string> = {
  under13: "-13",
  "13to17": "13-17",
  "17plus": "17-",
};
const AVG_AGE_TO_PARAM: Record<AvgAgeBucket, string> = {
  under40: "-40",
  "40to43": "40-43",
  "43plus": "43-",
};

function invert<K extends string>(map: Record<K, string>): Record<string, K> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k])) as Record<string, K>;
}

const PARAM_TO_EMPLOYEE_SIZE = invert(EMPLOYEE_SIZE_TO_PARAM);
const PARAM_TO_TENURE = invert(TENURE_TO_PARAM);
const PARAM_TO_AVG_AGE = invert(AVG_AGE_TO_PARAM);

/**
 * 常に age → ind → emp → ten → aage → q の順で組み立てる（カノニカル化）。
 * フィルタを適用した順序に関係なく、同じ絞り込みなら常に同じ文字列になる。
 * 初期値と同じ項目はクエリに出さない。
 */
export function buildSearchParams(state: RankingState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.targetAge !== INITIAL_STATE.targetAge) params.set("age", String(state.targetAge));
  if (state.industry !== null) params.set("ind", state.industry);
  if (state.employeeSize !== null) params.set("emp", EMPLOYEE_SIZE_TO_PARAM[state.employeeSize]);
  if (state.tenure !== null) params.set("ten", TENURE_TO_PARAM[state.tenure]);
  if (state.avgAgeBucket !== null) params.set("aage", AVG_AGE_TO_PARAM[state.avgAgeBucket]);
  if (state.query !== "") params.set("q", state.query);
  return params;
}

/**
 * 不正・未知の値は無視する（該当フィールドはINITIAL_STATEの値に倒れる）。
 * エラー画面は出さない。
 */
export function parseSearchParams(params: URLSearchParams): Partial<RankingState> {
  const result: Partial<RankingState> = {};

  const age = params.get("age");
  if (age !== null) {
    const n = Number(age);
    if ((TARGET_AGES as readonly number[]).includes(n)) result.targetAge = n as TargetAge;
  }

  const ind = params.get("ind");
  if (ind !== null) result.industry = ind;

  const emp = params.get("emp");
  if (emp !== null && emp in PARAM_TO_EMPLOYEE_SIZE) result.employeeSize = PARAM_TO_EMPLOYEE_SIZE[emp];

  const ten = params.get("ten");
  if (ten !== null && ten in PARAM_TO_TENURE) result.tenure = PARAM_TO_TENURE[ten];

  const aage = params.get("aage");
  if (aage !== null && aage in PARAM_TO_AVG_AGE) result.avgAgeBucket = PARAM_TO_AVG_AGE[aage];

  const q = params.get("q");
  if (q !== null) result.query = q;

  return result;
}
