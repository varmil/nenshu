import { describe, expect, it } from "vitest";
import { buildSummaryView, SUMMARY_SOURCE } from "./summary";

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

// 文言そのものは画面で見ている（`e2e/company-summary.spec.ts` の AC-22）。
describe("SUMMARY_SOURCE", () => {
  /**
   * **決算期を含めない**（S3・Issue #134・`docs/site-chrome/spec.md` 5.1）。
   * 企業詳細の決算期は「年収に関するQ&A」の説明と要約の節の説明の2か所（C16）で、入れると
   * 3回目になる。C7 の時点では「有価証券報告書の実測値（2026年3月期）」の見出しと重なり、
   * `e2e/data-period.spec.ts` が捕まえた。
   */
  it("決算期を含めない（1画面に1回の規則）", () => {
    expect(SUMMARY_SOURCE).not.toMatch(/\d+年\d+月期/);
  });
});
