import { describe, it, expect } from "vitest";
import { SORT_DEFAULT_ORDER, SORT_DIRECTION_LABEL, nextSortSelection } from "./sort";
import { SORT_KEYS } from "../types";
import type { SortSelection } from "../types";

/**
 * AC-12 の向きの切替（Issue #106）。**押した回数で結果が変わる唯一の規則**なので、
 * 3軸ぶんの往復をここで固定する。ブラウザでの見え方は
 * `e2e/ranking-refresh.spec.ts` にある。
 */
describe("nextSortSelection", () => {
  const salaryDesc: SortSelection = { key: "salary", order: "desc" };

  it("別の軸を押すと、その軸の既定の向きから始まる", () => {
    expect(nextSortSelection(salaryDesc, "age")).toEqual({ key: "age", order: "desc" });
    expect(nextSortSelection(salaryDesc, "employees")).toEqual({
      key: "employees",
      order: "desc",
    });
  });

  it("同じ軸をもう一度押すと向きだけ反転する", () => {
    expect(nextSortSelection(salaryDesc, "salary")).toEqual({ key: "salary", order: "asc" });
    expect(nextSortSelection({ key: "age", order: "desc" }, "age")).toEqual({
      key: "age",
      order: "asc",
    });
  });

  // 3軸とも既定は降順（大きい順）。1つの軸だけ向きが違うと、押したときに何が起きるかを
  // 軸ごとに覚えることになる（U15 の直後に揃えた）。
  it("どの軸も既定は降順（大きい順）", () => {
    for (const key of SORT_KEYS) {
      expect(SORT_DEFAULT_ORDER[key]).toBe("desc");
    }
  });

  it("2回押すと元に戻る（3軸とも）", () => {
    for (const key of SORT_KEYS) {
      const start: SortSelection = { key, order: SORT_DEFAULT_ORDER[key] };
      expect(nextSortSelection(nextSortSelection(start, key), key)).toEqual(start);
    }
  });

  /*
   * 前の軸の向きを引き継がない。従業員数を押した読者が見たいのは大きい会社であって、
   * 直前に年収を低い順で見ていたかどうかとは関係がない（spec.md 1.10）。
   */
  it("逆向きの軸から別の軸へ移っても、向きは引き継がれない", () => {
    const ageAsc: SortSelection = { key: "age", order: "asc" };
    expect(nextSortSelection(ageAsc, "employees")).toEqual({ key: "employees", order: "desc" });
    expect(nextSortSelection({ key: "salary", order: "asc" }, "age")).toEqual({
      key: "age",
      order: "desc",
    });
  });
});

describe("向きの表記", () => {
  // 見えている文字は `aria-label`（`${軸} ${向き}`）の部分文字列でなければならない
  // （WCAG 2.5.3）。空文字だと `${軸} ` になって崩れるので、6通りとも埋まっていること。
  it("3軸×2方向のすべてに言い方がある", () => {
    for (const key of SORT_KEYS) {
      expect(SORT_DIRECTION_LABEL[key].asc).toBeTruthy();
      expect(SORT_DIRECTION_LABEL[key].desc).toBeTruthy();
      expect(SORT_DIRECTION_LABEL[key].asc).not.toBe(SORT_DIRECTION_LABEL[key].desc);
    }
  });

  // 既定はどれも「大きいほうから」。言い方だけが軸ごとに違う。
  it("既定の向きの言い方", () => {
    expect(SORT_DIRECTION_LABEL.salary[SORT_DEFAULT_ORDER.salary]).toBe("高い順");
    expect(SORT_DIRECTION_LABEL.age[SORT_DEFAULT_ORDER.age]).toBe("高い順");
    expect(SORT_DIRECTION_LABEL.employees[SORT_DEFAULT_ORDER.employees]).toBe("多い順");
  });
});
