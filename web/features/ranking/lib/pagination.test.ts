import { describe, it, expect } from "vitest";
import { getPaginationRange, pageRange } from "./pagination";
import { PAGE_SIZE } from "../types";

/*
 * 前後2ページまで並べる（U17・Issue #813。U6 では前後1ページだった）。
 * 2,961社は99ページなので、実際の総ページ数で固定する。E2E は10ページ目の描画と
 * 360px での幅だけを見ている（`e2e/ranking-pagination.spec.ts`）。
 */
describe("getPaginationRange", () => {
  it.each<[string, number, number, (number | "ellipsis")[]]>([
    ["総ページ数が0のときは空", 1, 0, []],
    ["総ページ数が1のときは1のみ", 1, 1, [1]],
    ["ページ数が少ないときは省略記号を出さない", 2, 3, [1, 2, 3]],
    ["総ページ数が前後2ページに収まるときは省略記号を出さない", 3, 5, [1, 2, 3, 4, 5]],
    ["先頭では2ページ先まで並び、末尾側だけ省略記号", 1, 99, [1, 2, 3, "ellipsis", 99]],
    ["末尾では2ページ前まで並び、先頭側だけ省略記号", 99, 99, [1, "ellipsis", 97, 98, 99]],
    ["中ほどでは前後2ページずつと両側の省略記号", 10, 99, [1, "ellipsis", 8, 9, 10, 11, 12, "ellipsis", 99]],
    // 先頭と2ページ前が隣り合うときは省略記号を挟まない
    ["3ページ目", 3, 99, [1, 2, 3, 4, 5, "ellipsis", 99]],
    ["4ページ目", 4, 99, [1, 2, 3, 4, 5, 6, "ellipsis", 99]],
    // 隠すのが1ページだけでも省略記号にする。数字にすると 360px の本文幅に
    // 収まらない（docs/ranking/pagination-reach/design.md「幅の予算」）。
    ["5ページ目（隠すのは2だけ）", 5, 99, [1, "ellipsis", 3, 4, 5, 6, 7, "ellipsis", 99]],
    ["95ページ目（隠すのは98だけ）", 95, 99, [1, "ellipsis", 93, 94, 95, 96, 97, "ellipsis", 99]],
  ])("%s", (_, page, total, expected) => {
    expect(getPaginationRange(page, total)).toEqual(expected);
  });

  it("並ぶ項目は最大9つ（数字7つ・省略記号2つ）", () => {
    for (let page = 1; page <= 99; page++) {
      const items = getPaginationRange(page, 99);
      expect(items.length).toBeLessThanOrEqual(9);
      expect(items.filter((item) => item === "ellipsis").length).toBeLessThanOrEqual(2);
    }
  });
});

describe("pageRange", () => {
  // 実際に使う刻み（PAGE_SIZE = 30、Issue #103）と母集団（2,961社＝99ページ）で固定する。
  it("1ページ目は 1〜30 社目", () => {
    expect(pageRange(1, 2961, PAGE_SIZE)).toEqual({ from: 1, to: 30, page: 1, totalPages: 99 });
  });

  it("最終ページは端数で止まる", () => {
    expect(pageRange(99, 2961, PAGE_SIZE)).toEqual({
      from: 2941,
      to: 2961,
      page: 99,
      totalPages: 99,
    });
  });

  // 範囲外のページを直接開いても、件数表示だけが空ページを指す状態にしない。
  it("範囲外のページは最終ページに寄せる（buildRankedCompanies と同じ規則）", () => {
    expect(pageRange(999, 2961, PAGE_SIZE).page).toBe(99);
    expect(pageRange(0, 2961, PAGE_SIZE).page).toBe(1);
  });

  it("0件なら 0〜0", () => {
    expect(pageRange(1, 0, PAGE_SIZE)).toEqual({ from: 0, to: 0, page: 1, totalPages: 1 });
  });
});
