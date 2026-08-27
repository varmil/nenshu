import { describe, expect, it } from "vitest";
import { buildSummaryView, summarySourceLabel } from "./summary";

describe("buildSummaryView", () => {
  it("説明文があれば本文を返す", () => {
    const view = buildSummaryView(
      "電子応用機器の開発、製造及び販売を主な事業とする。商品の開発から販売までを自社で担い、製造とソフトウェア開発は子会社が分担する。"
    );
    expect(view?.text).toContain("電子応用機器");
  });

  /**
   * **空の器を出さないことの本体**（AC-21）。C6 が落とした177社はここを通る。
   * 3つとも `null` にするのは、CSV の空文字・欠けた行・空白だけの値が
   * どれも「説明文が無い」ことを指すため。
   */
  it.each([
    ["空文字", ""],
    ["空白だけ", "  \n "],
    ["null", null],
    ["undefined", undefined],
  ])("説明文が%sなら null を返す（節ごと出さない）", (_label, summary) => {
    expect(buildSummaryView(summary)).toBeNull();
  });

  it("前後の空白は落とす", () => {
    expect(buildSummaryView("  事業を営む。  ")?.text).toBe("事業を営む。");
  });
});

describe("summarySourceLabel", () => {
  /**
   * **決算期を直書きしない**（AC-22・`docs/site-chrome/spec.md` AC-20）。
   * 会社ごとに違うので、渡された値がそのまま出ることを固定する。
   */
  it("決算期は引数の値がそのまま出る", () => {
    expect(summarySourceLabel("2026年3月期")).toBe(
      "有価証券報告書「事業の内容」（2026年3月期）をもとに要約"
    );
    expect(summarySourceLabel("2026年4月期")).toContain("2026年4月期");
    expect(summarySourceLabel("2025年12月期")).toContain("2025年12月期");
  });
});
