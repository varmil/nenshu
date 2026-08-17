import { describe, it, expect } from "vitest";
import { buildSearchParams, parseSearchParams, INITIAL_STATE } from "./urlState";
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

  it("不正なageは無視する（TARGET_AGESに無い値）", () => {
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
});

describe("buildSearchParams", () => {
  it("初期値と同じ項目はクエリに出さない", () => {
    expect(buildSearchParams(INITIAL_STATE).toString()).toBe("");
  });

  it("バケット系フィルタを範囲表記でエンコードする", () => {
    const params = buildSearchParams(
      stateFor({ employeeSize: "1000plus", tenure: "under13", avgAgeBucket: "40to43" })
    );
    expect(params.get("emp")).toBe("1000-");
    expect(params.get("ten")).toBe("-13");
    expect(params.get("aage")).toBe("40-43");
  });

  it("往復変換が一致する（build→parse→buildが同じ文字列になる）", () => {
    const state = stateFor({
      targetAge: 45,
      industry: "銀行業",
      employeeSize: "300to1000",
      tenure: "17plus",
      avgAgeBucket: "43plus",
      query: "商船",
    });
    const first = buildSearchParams(state).toString();
    const parsed = parseSearchParams(new URLSearchParams(first));
    const second = buildSearchParams({ ...INITIAL_STATE, ...parsed }).toString();
    expect(second).toBe(first);
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
