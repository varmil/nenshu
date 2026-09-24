import { describe, it, expect } from "vitest";
import { getPaginationRange, pageRange } from "./pagination";
import { PAGE_SIZE } from "../types";

describe("getPaginationRange", () => {
  it("総ページ数が0のときは空配列", () => {
    expect(getPaginationRange(1, 0)).toEqual([]);
  });

  it("総ページ数が1のときは[1]のみ", () => {
    expect(getPaginationRange(1, 1)).toEqual([1]);
  });

  it("ページ数が少ないときは省略記号を出さない", () => {
    expect(getPaginationRange(2, 3)).toEqual([1, 2, 3]);
  });

  // 前後2ページまで並べる（U17・Issue #813。U6 では前後1ページだった）。
  // 2,961社は99ページなので、実際の総ページ数で固定する。
  it("先頭では2ページ先まで並び、末尾側だけ省略記号になる", () => {
    expect(getPaginationRange(1, 99)).toEqual([1, 2, 3, "ellipsis", 99]);
  });

  it("末尾では2ページ前まで並び、先頭側だけ省略記号になる", () => {
    expect(getPaginationRange(99, 99)).toEqual([1, "ellipsis", 97, 98, 99]);
  });

  it("中ほどでは前後2ページずつと、両側の省略記号が並ぶ", () => {
    expect(getPaginationRange(10, 99)).toEqual([1, "ellipsis", 8, 9, 10, 11, 12, "ellipsis", 99]);
  });

  it("先頭と2ページ前が隣り合うときは省略記号を挟まない", () => {
    expect(getPaginationRange(3, 99)).toEqual([1, 2, 3, 4, 5, "ellipsis", 99]);
    expect(getPaginationRange(4, 99)).toEqual([1, 2, 3, 4, 5, 6, "ellipsis", 99]);
  });

  // 隠すのが1ページだけでも省略記号にする。数字にすると 360px の本文幅に
  // 収まらない（docs/ranking/pagination-reach/design.md「幅の予算」）。
  it("隙間が1ページだけでも省略記号にする", () => {
    expect(getPaginationRange(5, 99)).toEqual([1, "ellipsis", 3, 4, 5, 6, 7, "ellipsis", 99]);
    expect(getPaginationRange(95, 99)).toEqual([1, "ellipsis", 93, 94, 95, 96, 97, "ellipsis", 99]);
  });

  it("総ページ数が前後2ページに収まるときは省略記号を出さない", () => {
    expect(getPaginationRange(3, 5)).toEqual([1, 2, 3, 4, 5]);
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
  // 実際に使う刻み（PAGE_SIZE = 30、Issue #103）で固定する。1,867社は63ページ。
  it("1ページ目は 1〜30 社目", () => {
    expect(pageRange(1, 1867, PAGE_SIZE)).toEqual({ from: 1, to: 30, page: 1, totalPages: 63 });
  });

  it("最終ページは端数で止まる", () => {
    expect(pageRange(63, 1867, PAGE_SIZE)).toEqual({
      from: 1861,
      to: 1867,
      page: 63,
      totalPages: 63,
    });
  });

  // 範囲外のページを直接開いても、件数表示だけが空ページを指す状態にしない。
  it("範囲外のページは最終ページに寄せる（buildRankedCompanies と同じ規則）", () => {
    expect(pageRange(999, 1867, PAGE_SIZE).page).toBe(63);
    expect(pageRange(0, 1867, PAGE_SIZE).page).toBe(1);
  });

  it("0件なら 0〜0", () => {
    expect(pageRange(1, 0, PAGE_SIZE)).toEqual({ from: 0, to: 0, page: 1, totalPages: 1 });
  });
});
