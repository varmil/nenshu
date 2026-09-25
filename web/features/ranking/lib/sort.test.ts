import { describe, it, expect } from "vitest";
import { SORT_DEFAULT_ORDER, SORT_DIRECTION_LABEL, nextSortSelection } from "./sort";
import { SORT_KEYS } from "../types";
import type { SortSelection } from "../types";

/**
 * AC-12 の向きの切替（Issue #106）。**押した回数で結果が変わる唯一の規則**なので、
 * 3軸ぶんの往復をここで固定する。ブラウザでの見え方（チップの表記・URL・行の並びが
 * 揃って変わること）は `e2e/ranking-refresh.spec.ts` にある。
 *
 * 3軸とも既定が降順（大きい順）であることは `urlState.test.ts` の「軸だけの URL は
 * 3軸とも降順」が URL の側から固定している。
 */
describe("nextSortSelection", () => {
  /*
   * 前の軸の向きを引き継がない。従業員数を押した読者が見たいのは大きい会社であって、
   * 直前に年収を低い順で見ていたかどうかとは関係がない（spec.md 1.10）。
   * だから移る元は既定の向きと逆向きの両方で見る。
   */
  it.each<[SortSelection, SortSelection["key"]]>([
    [{ key: "salary", order: "desc" }, "age"],
    [{ key: "salary", order: "desc" }, "employees"],
    [{ key: "salary", order: "asc" }, "age"],
    [{ key: "age", order: "asc" }, "employees"],
  ])("%o から別の軸（%s）へ移ると、その軸の既定の向きから始まる", (from, axis) => {
    expect(nextSortSelection(from, axis)).toEqual({ key: axis, order: SORT_DEFAULT_ORDER[axis] });
  });

  it.each(SORT_KEYS)("同じ軸（%s）をもう一度押すと向きだけ反転し、2回で元に戻る", (key) => {
    const start: SortSelection = { key, order: SORT_DEFAULT_ORDER[key] };
    const flipped = nextSortSelection(start, key);
    expect(flipped).toEqual({ key, order: start.order === "desc" ? "asc" : "desc" });
    expect(nextSortSelection(flipped, key)).toEqual(start);
  });
});

describe("向きの表記", () => {
  // 見えている文字は `aria-label`（`${軸} ${向き}`）の部分文字列でなければならない
  // （WCAG 2.5.3）。空文字だと `${軸} ` になって崩れるので、6通りとも埋まっていること。
  // 既定の向きの言い方（高い順・多い順）は E2E がチップの読み上げ名で引いている。
  it("3軸×2方向のすべてに言い方がある", () => {
    for (const key of SORT_KEYS) {
      expect(SORT_DIRECTION_LABEL[key].asc).toBeTruthy();
      expect(SORT_DIRECTION_LABEL[key].desc).toBeTruthy();
      expect(SORT_DIRECTION_LABEL[key].asc).not.toBe(SORT_DIRECTION_LABEL[key].desc);
    }
  });
});
