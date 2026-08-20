import { describe, it, expect } from "vitest";
import {
  buildSearchParams,
  parseSearchParams,
  searchParamsRecordToURLSearchParams,
  INITIAL_STATE,
} from "./urlState";
import type { RankingState } from "../types";

function stateFor(overrides: Partial<RankingState>): RankingState {
  return { ...INITIAL_STATE, ...overrides };
}

describe("parseSearchParams", () => {
  it("AC-7: age=45&ind=銀行業 から targetAge=45, industry=銀行業 を復元する", () => {
    const parsed = parseSearchParams(new URLSearchParams("age=45&ind=銀行業"));
    expect(parsed.targetAge).toBe(45);
    expect(parsed.industry).toBe("銀行業");
  });

  // ADR-0007: `age` の有無そのものが表示基準を表す。
  it("ageが無いURLは実測値（targetAge=null）になる", () => {
    expect(INITIAL_STATE.targetAge).toBeNull();
    const parsed = parseSearchParams(new URLSearchParams("ind=銀行業"));
    expect(parsed.targetAge).toBeUndefined();
    expect({ ...INITIAL_STATE, ...parsed }.targetAge).toBeNull();
  });

  it("age=35 は「年齢そろえの35歳」として復元される（実測値ではない）", () => {
    const parsed = parseSearchParams(new URLSearchParams("age=35"));
    expect(parsed.targetAge).toBe(35);
  });

  it("不正なageは無視され実測値に倒れる（TARGET_AGESに無い値）", () => {
    expect({ ...INITIAL_STATE, ...parseSearchParams(new URLSearchParams("age=33")) }.targetAge).toBeNull();
    expect({ ...INITIAL_STATE, ...parseSearchParams(new URLSearchParams("age=abc")) }.targetAge).toBeNull();
    const parsed = parseSearchParams(new URLSearchParams("age=999"));
    expect(parsed.targetAge).toBeUndefined();
  });

  it("不正なemp/ten/aageは無視する（未知のパターン）", () => {
    const parsed = parseSearchParams(new URLSearchParams("emp=abc&ten=xyz&aage=?"));
    expect(parsed.employeeSize).toBeUndefined();
    expect(parsed.tenure).toBeUndefined();
    expect(parsed.avgAgeBucket).toBeUndefined();
  });

  it("バケット系の範囲表記を正しく復元する", () => {
    const parsed = parseSearchParams(new URLSearchParams("emp=1000-&ten=-13&aage=40-43"));
    expect(parsed.employeeSize).toBe("1000plus");
    expect(parsed.tenure).toBe("under13");
    expect(parsed.avgAgeBucket).toBe("40to43");
  });

  it("qはそのまま復元する", () => {
    const parsed = parseSearchParams(new URLSearchParams("q=商船"));
    expect(parsed.query).toBe("商船");
  });

  it("空のパラメータからは何も復元しない", () => {
    expect(parseSearchParams(new URLSearchParams(""))).toEqual({});
  });

  it("pageを正しい整数として復元する", () => {
    expect(parseSearchParams(new URLSearchParams("page=2")).page).toBe(2);
  });

  it("不正なpage（0・負数・非数値）は無視する", () => {
    expect(parseSearchParams(new URLSearchParams("page=0")).page).toBeUndefined();
    expect(parseSearchParams(new URLSearchParams("page=-1")).page).toBeUndefined();
    expect(parseSearchParams(new URLSearchParams("page=abc")).page).toBeUndefined();
    expect(parseSearchParams(new URLSearchParams("page=1.5")).page).toBeUndefined();
  });
});

describe("buildSearchParams", () => {
  it("初期値と同じ項目はクエリに出さない", () => {
    expect(buildSearchParams(INITIAL_STATE).toString()).toBe("");
  });

  // ADR-0007: 35歳を既定として省いていた頃と違い、年齢そろえなら35歳でも出す。
  // 省くと実測値のURLと区別が付かなくなる。
  it("年齢そろえの35歳は age=35 を出す", () => {
    expect(buildSearchParams(stateFor({ targetAge: 35 })).toString()).toBe("age=35");
  });

  it("実測値（targetAge=null）は age を出さない", () => {
    expect(buildSearchParams(stateFor({ targetAge: null })).has("age")).toBe(false);
    expect(buildSearchParams(stateFor({ targetAge: null, industry: "銀行業" })).toString()).toBe(
      "ind=%E9%8A%80%E8%A1%8C%E6%A5%AD"
    );
  });

  it("実測値と年齢そろえ35歳が別のURLになる", () => {
    expect(buildSearchParams(stateFor({ targetAge: null })).toString()).not.toBe(
      buildSearchParams(stateFor({ targetAge: 35 })).toString()
    );
  });

  it("バケット系フィルタを範囲表記でエンコードする", () => {
    const params = buildSearchParams(
      stateFor({ employeeSize: "1000plus", tenure: "under13", avgAgeBucket: "40to43" })
    );
    expect(params.get("emp")).toBe("1000-");
    expect(params.get("ten")).toBe("-13");
    expect(params.get("aage")).toBe("40-43");
  });

  it("page=1（既定値）はクエリに出さない", () => {
    expect(buildSearchParams(stateFor({ page: 1 })).has("page")).toBe(false);
  });

  it("pageが1以外なら末尾に出す", () => {
    const params = buildSearchParams(stateFor({ industry: "銀行業", page: 2 }));
    expect(params.toString()).toBe("ind=%E9%8A%80%E8%A1%8C%E6%A5%AD&page=2");
  });

  it("往復変換が一致する（build→parse→buildが同じ文字列になる）", () => {
    const state = stateFor({
      targetAge: 45,
      industry: "銀行業",
      employeeSize: "300to1000",
      tenure: "17plus",
      avgAgeBucket: "43plus",
      query: "商船",
      page: 3,
    });
    const first = buildSearchParams(state).toString();
    const parsed = parseSearchParams(new URLSearchParams(first));
    const second = buildSearchParams({ ...INITIAL_STATE, ...parsed }).toString();
    expect(second).toBe(first);
  });

  it("実測値でも往復変換が一致する", () => {
    const state = stateFor({ targetAge: null, industry: "銀行業", query: "商船", page: 2 });
    const first = buildSearchParams(state).toString();
    const parsed = parseSearchParams(new URLSearchParams(first));
    const restored = { ...INITIAL_STATE, ...parsed };
    expect(restored.targetAge).toBeNull();
    expect(buildSearchParams(restored).toString()).toBe(first);
  });

  it("並び順はフィルタを適用した順序に関係なく常に同じになる（カノニカル化）", () => {
    const a = stateFor({ industry: "銀行業", employeeSize: "1000plus", query: "三井" });
    // 同じ内容を異なる順序のオブジェクトリテラルで組み立てても、buildSearchParamsの出力順は固定。
    const b: RankingState = {
      ...INITIAL_STATE,
      query: "三井",
      employeeSize: "1000plus",
      industry: "銀行業",
    };
    expect(buildSearchParams(a).toString()).toBe(buildSearchParams(b).toString());
    expect(buildSearchParams(a).toString()).toBe("ind=%E9%8A%80%E8%A1%8C%E6%A5%AD&emp=1000-&q=%E4%B8%89%E4%BA%95");
  });
});

describe("searchParamsRecordToURLSearchParams", () => {
  it("プレーンオブジェクトをURLSearchParamsに変換する", () => {
    const params = searchParamsRecordToURLSearchParams({ age: "45", ind: "銀行業" });
    expect(params.get("age")).toBe("45");
    expect(params.get("ind")).toBe("銀行業");
  });

  it("値が配列の場合は最初の要素を使う", () => {
    const params = searchParamsRecordToURLSearchParams({ age: ["45", "50"] });
    expect(params.get("age")).toBe("45");
  });

  it("値がundefinedのキーは無視する", () => {
    const params = searchParamsRecordToURLSearchParams({ age: undefined, ind: "銀行業" });
    expect(params.has("age")).toBe(false);
    expect(params.get("ind")).toBe("銀行業");
  });

  it("空オブジェクトからは空のURLSearchParamsになる", () => {
    expect(searchParamsRecordToURLSearchParams({}).toString()).toBe("");
  });
});
