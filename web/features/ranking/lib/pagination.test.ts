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

  it("先頭付近では末尾側だけ省略記号になる", () => {
    expect(getPaginationRange(1, 19)).toEqual([1, 2, "ellipsis", 19]);
  });

  it("末尾付近では先頭側だけ省略記号になる", () => {
    expect(getPaginationRange(19, 19)).toEqual([1, "ellipsis", 18, 19]);
  });

  it("中間では両側が省略記号になる", () => {
    expect(getPaginationRange(10, 19)).toEqual([1, "ellipsis", 9, 10, 11, "ellipsis", 19]);
  });

  it("隣接ページとの間が1ページしか空かないときは省略記号を挟まない", () => {
    // currentPage=3, totalPages=5: 先頭側1,2,3・末尾側3,4,5で隙間なし
    expect(getPaginationRange(3, 5)).toEqual([1, 2, 3, 4, 5]);
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
