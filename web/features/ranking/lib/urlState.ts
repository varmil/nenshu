import { TARGET_AGES } from "../types";
import type {
  AvgAgeBucket,
  EmployeeSizeBucket,
  RankingState,
  SortKey,
  TargetAge,
  TenureBucket,
} from "../types";

/** 「年齢そろえ」に切り替えたときに選ばれる年齢。 */
export const DEFAULT_TARGET_AGE: TargetAge = 35;

export const INITIAL_STATE: RankingState = {
  // 既定は実測値（ADR-0007）。`age` が無いURLはこのモードになる。
  targetAge: null,
  industry: null,
  employeeSize: null,
  tenure: null,
  avgAgeBucket: null,
  query: "",
  sort: "salary",
  page: 1,
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
/** `salary` は既定なのでURLに出さない（下の buildSearchParams を参照）。 */
const SORT_TO_PARAM: Record<SortKey, string> = {
  salary: "salary",
  age: "age",
  employees: "emp",
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
const PARAM_TO_SORT = invert(SORT_TO_PARAM);

/**
 * 常に age → ind → emp → ten → aage → q → sort → page の順で組み立てる（カノニカル化）。
 * フィルタを適用した順序に関係なく、同じ絞り込みなら常に同じ文字列になる。
 * 初期値と同じ項目はクエリに出さない。
 *
 * **`age` は「年齢そろえ」のときだけ出す。** 35歳を既定として省略していた頃と違い、
 * 年齢そろえなら35歳でも `age=35` を出す——`age` の有無そのものが表示基準を
 * 表しているので、省くと実測値と区別が付かなくなる（ADR-0007）。
 */
export function buildSearchParams(state: RankingState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.targetAge !== null) params.set("age", String(state.targetAge));
  if (state.industry !== null) params.set("ind", state.industry);
  if (state.employeeSize !== null) params.set("emp", EMPLOYEE_SIZE_TO_PARAM[state.employeeSize]);
  if (state.tenure !== null) params.set("ten", TENURE_TO_PARAM[state.tenure]);
  if (state.avgAgeBucket !== null) params.set("aage", AVG_AGE_TO_PARAM[state.avgAgeBucket]);
  if (state.query !== "") params.set("q", state.query);
  if (state.sort !== INITIAL_STATE.sort) params.set("sort", SORT_TO_PARAM[state.sort]);
  if (state.page !== INITIAL_STATE.page) params.set("page", String(state.page));
  return params;
}

/**
 * 不正・未知の値は無視する（該当フィールドはINITIAL_STATEの値に倒れる）。
 * エラー画面は出さない。
 *
 * `age` が無い・`age=abc`・`age=33` のようにTARGET_AGESに無い値のURLは、いずれも
 * `targetAge` が未設定のまま INITIAL_STATE の `null` ＝ 実測値になる（ADR-0007）。
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

  const sort = params.get("sort");
  if (sort !== null && sort in PARAM_TO_SORT) result.sort = PARAM_TO_SORT[sort];

  const page = params.get("page");
  if (page !== null) {
    const n = Number(page);
    if (Number.isInteger(n) && n >= 1) result.page = n;
  }

  return result;
}

/**
 * Next.jsのServer Componentに渡る`searchParams`（URLSearchParamsではなくプレーンオブジェクト。
 * 同じキーが複数あれば配列になる）を`parseSearchParams`に渡せる`URLSearchParams`に変換する。
 * 同じキーが重複している場合は最初の値を採用する。
 */
export function searchParamsRecordToURLSearchParams(
  record: Record<string, string | string[] | undefined>
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params;
}
