import { describe, expect, it } from "vitest";
import { buildQueryLocation } from "./queryBroadcast";

describe("buildQueryLocation", () => {
  it("検索を始めるときだけ履歴に1件積む", () => {
    expect(buildQueryLocation("", "ト")).toEqual({ search: "q=%E3%83%88", mode: "push" });
  });

  /**
   * 打つそばから絞り込むので、1文字ごとに push すると「トヨタ」で3件積まれる
   * （戻るボタンが3回ぶん潰れる。Issue #108）。2文字目以降は同じ1件を書き換える。
   */
  it("打ち替えは履歴を増やさない", () => {
    expect(buildQueryLocation("?q=%E3%83%88", "トヨ").mode).toBe("replace");
    expect(buildQueryLocation("?q=%E3%83%88%E3%83%A8", "トヨタ")).toEqual({
      search: "q=%E3%83%88%E3%83%A8%E3%82%BF",
      mode: "replace",
    });
  });

  it("消し切るのも境目なので1件積む（戻ると直前の検索語に戻れる）", () => {
    expect(buildQueryLocation("?q=%E3%83%88%E3%83%A8%E3%82%BF", "")).toEqual({
      search: "",
      mode: "push",
    });
  });

  it("他の絞り込みは残し、ページ番号だけ1に戻す", () => {
    const { search } = buildQueryLocation("?age=35&ind=%E6%B5%B7%E9%81%8B%E6%A5%AD&page=3", "商船");
    const params = new URLSearchParams(search);
    expect(params.get("age")).toBe("35");
    expect(params.get("ind")).toBe("海運業");
    expect(params.get("page")).toBeNull();
    expect(params.get("q")).toBe("商船");
  });
});
