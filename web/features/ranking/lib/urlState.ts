import { TARGET_AGES } from "../types";
import type {
  AvgAgeBucket,
  EmployeeSizeBucket,
  RankingState,
  SortKey,
  SortOrder,
  SortSelection,
  TargetAge,
  TenureBucket,
} from "../types";
import { SORT_DEFAULT_ORDER } from "./sort";

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
  sort: { key: "salary", order: SORT_DEFAULT_ORDER.salary },
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
/**
 * 軸の名前。**向きは別の語として後ろに足す**（`age-desc`）ので、ここには含めない。
 * `salary` は既定の軸なので、既定の向きならURLに出さない（下の buildSearchParams）。
 */
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
 * `sort` に出す文字列。既定の並び（年収が高い順）なら `null`＝出さない。
 *
 * **既定の向きなら軸の名前だけ、逆向きなら `-asc` / `-desc` を足す**（`age`／`age-desc`）。
 * 向きを必ず書く形（`age-asc`）にもできるが、それだと U15 より前に配ってある
 * `?sort=age` が「正規形ではないURL」になり、同じ並びに2つの綴りが残り続ける。
 */
function sortToParam({ key, order }: SortSelection): string | null {
  const token = SORT_TO_PARAM[key];
  if (order !== SORT_DEFAULT_ORDER[key]) return `${token}-${order}`;
  return key === INITIAL_STATE.sort.key ? null : token;
}

/**
 * 常に age → ind → emp → ten → aage → q → sort → page の順で組み立てる（カノニカル化）。
 * フィルタを適用した順序に関係なく、同じ絞り込みなら常に同じ文字列になる。
 * 初期値と同じ項目はクエリに出さない。
 *
 * **`age` は「年齢そろえ」のときだけ出す。** 35歳を既定として省略していた頃と違い、
 * 年齢そろえなら35歳でも `age=35` を出す——`age` の有無そのものが表示基準を
 * 表しているので、省くと実測値と区別が付かなくなる（ADR-0007）。
 *
 * **並びの向きは `sort` の値に足す。`dir` のようなパラメータを増やさない**（Issue #106）。
 * 軸と向きは片方だけでは意味を成さない1つの選択なので、2つのキーに割ると
 * `?dir=asc` だけが残ったURLという読めない状態が作れてしまう。
 */
export function buildSearchParams(state: RankingState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.targetAge !== null) params.set("age", String(state.targetAge));
  if (state.industry !== null) params.set("ind", state.industry);
  if (state.employeeSize !== null) params.set("emp", EMPLOYEE_SIZE_TO_PARAM[state.employeeSize]);
  if (state.tenure !== null) params.set("ten", TENURE_TO_PARAM[state.tenure]);
  if (state.avgAgeBucket !== null) params.set("aage", AVG_AGE_TO_PARAM[state.avgAgeBucket]);
  if (state.query !== "") params.set("q", state.query);
  const sort = sortToParam(state.sort);
  if (sort !== null) params.set("sort", sort);
  if (state.page !== INITIAL_STATE.page) params.set("page", String(state.page));
  return params;
}

/**
 * state を `/` からの相対URLにする。**全件が届く前の操作を実ナビゲーションに倒す
 * ときの行き先**（E0・ADR-0013。`RankingApp` の `commit`）。
 *
 * **既定の状態は `/` にする。`/?` にしない**——`URLSearchParams` が空のとき
 * `` `/?${search}` `` はクエリ記号だけが残った別のURLになり、canonical
 * （`lib/seo/ranking.ts`）の判定にも sitemap にも無い綴りになる。
 */
export function rankingHref(state: RankingState): string {
  const search = buildSearchParams(state).toString();
  return search === "" ? "/" : `/?${search}`;
}

/**
 * `sort` の値を軸と向きに割る。向きが付いていなければ `null` を返す（＝軸の既定）。
 *
 * 軸のトークン（`salary`・`age`・`emp`）に `-` は含まれないので、末尾だけ見れば足りる。
 * `age-zzz` のような未知の向きは向きが無いものとして扱い、軸だけを採る——
 * `parseSearchParams` の「不正な値は既定に倒す」に合わせてある。
 */
function splitSortParam(value: string): [token: string, order: SortOrder | null] {
  if (value.endsWith("-asc")) return [value.slice(0, -"-asc".length), "asc"];
  if (value.endsWith("-desc")) return [value.slice(0, -"-desc".length), "desc"];
  return [value, null];
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
  if (sort !== null) {
    // `age-desc` は「軸 age・向き desc」。向きの語が無ければその軸の既定の向き。
    const [token, order] = splitSortParam(sort);
    if (token in PARAM_TO_SORT) {
      const key = PARAM_TO_SORT[token];
      result.sort = { key, order: order ?? SORT_DEFAULT_ORDER[key] };
    }
  }

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
