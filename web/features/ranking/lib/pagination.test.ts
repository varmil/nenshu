import { describe, it, expect } from "vitest";
import { getPaginationRange } from "./pagination";

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
