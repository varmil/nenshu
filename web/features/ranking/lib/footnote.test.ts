import { describe, expect, it } from "vitest";
import { rankingFootnote } from "./footnote";

describe("rankingFootnote", () => {
  it("帯の基準・縦線の意味・偏差値が100を超えうることを書く（spec 1.11・1.12）", () => {
    expect(rankingFootnote(6_930_000)).toBe(
      "帯はこのページの1位を100%とした長さで、縦線は全体平均（693万円）です。" +
        "偏差値は、平均から大きく離れた高年収の会社があるため100を超えることがあります。"
    );
  });

  /*
   * 表示基準を引数に取らない——実測値でも年齢そろえでも同じ文になる。「推定」の語を
   * 持たないので、実測値の画面に推定の体裁を被せない（AC-9）。年齢そろえで推定である
   * ことを示すのは並べ方の帯のヒント。
   */
  it("「推定」の語を含まない", () => {
    expect(rankingFootnote(6_930_000)).not.toContain("推定");
    expect(rankingFootnote(null)).not.toContain("推定");
  });

  it("母集団の統計が無いときは、描かれない縦線と偏差値に触れない", () => {
    expect(rankingFootnote(null)).toBe("帯はこのページの1位を100%とした長さです。");
  });
});
