import { describe, it, expect } from "vitest";
import { activeFilters, CLEAR_ALL_FILTERS } from "./activeFilters";
import { INITIAL_STATE } from "./urlState";
import type { RankingState } from "../types";

const stateFor = (overrides: Partial<RankingState>): RankingState => ({
  ...INITIAL_STATE,
  ...overrides,
});

describe("activeFilters", () => {
  it("初期状態では何も出さない", () => {
    expect(activeFilters(INITIAL_STATE)).toEqual([]);
  });

  it("効いている絞り込みをラベルで返す", () => {
    const filters = activeFilters(
      stateFor({ industry: "海運業", employeeSize: "1000plus", query: "商船" })
    );
    expect(filters.map((f) => f.label)).toEqual(["海運業", "1,000人以上", "「商船」"]);
  });

  /*
   * 表示基準・並び替え・ページは常にどれかの値を持っていて「解除する」という操作が
   * 無い。チップに混ぜると「すべて解除」で何が起きるか読めなくなる。
   */
  it("表示基準・並び替え・ページはチップにしない", () => {
    expect(activeFilters(stateFor({ targetAge: 35, sort: { key: "age", order: "asc" }, page: 3 }))).toEqual([]);
  });

  it("チップの patch を当てるとその絞り込みだけが外れる", () => {
    const state = stateFor({ industry: "海運業", tenure: "17plus" });
    const [industryChip] = activeFilters(state);
    const next = { ...state, ...industryChip.patch };
    expect(next.industry).toBeNull();
    expect(next.tenure).toBe("17plus");
  });

  it("すべて解除しても表示基準と並び替えは残る", () => {
    const state = stateFor({
      targetAge: 35,
      sort: { key: "employees", order: "desc" },
      industry: "海運業",
      query: "商船",
    });
    const next = { ...state, ...CLEAR_ALL_FILTERS };
    expect(activeFilters(next)).toEqual([]);
    expect(next.targetAge).toBe(35);
    expect(next.sort).toEqual({ key: "employees", order: "desc" });
  });
});
