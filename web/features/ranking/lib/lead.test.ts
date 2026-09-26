import { describe, expect, it } from "vitest";
import { INITIAL_STATE, parseSearchParams } from "./urlState";
import { rankingLead } from "./lead";

const COUNTS: Record<string, number> = { 銀行業: 82, 海運業: 9 };

const facts = {
  fiscalPeriod: "2025年3月期〜2026年5月期",
  total: 2961,
  minEmployees: 100,
  industries: Object.keys(COUNTS),
  industryCount: (industry: string) => COUNTS[industry] ?? 0,
};

const lead = (query: string) =>
  rankingLead({ ...INITIAL_STATE, ...parseSearchParams(new URLSearchParams(query)) }, facts);

describe("rankingLead", () => {
  it("社数は見出しと同じ範囲を数える。業種で絞っていれば業種の社数", () => {
    expect(lead("")).toBe(
      "2025年3月期〜2026年5月期の有価証券報告書の平均年間給与（単体）で比べた2,961社。従業員100人以上が対象。"
    );
    expect(lead("ind=銀行業")).toBe(
      "2025年3月期〜2026年5月期の有価証券報告書の平均年間給与（単体）で比べた銀行業の82社。従業員100人以上が対象。"
    );
    expect(lead("age=35&ind=海運業")).toBe(
      "2025年3月期〜2026年5月期の平均年間給与を業種の賃金カーブで35歳時点に補正した海運業の9社。従業員100人以上が対象。"
    );
  });

  // 業種の社数は母集団の内訳。ほかの絞り込みが効いていても数え直さない
  // （`/` の掲載社数が絞り込みで変わらないのと同じ）。
  it("業種以外の絞り込みでは社数が変わらない", () => {
    expect(lead("ind=銀行業&emp=1000-&q=みずほ")).toBe(lead("ind=銀行業"));
    expect(lead("emp=1000-")).toBe(lead(""));
  });

  // 見出しと同じく、33業種に無い `ind` を名乗らない。
  it("33業種に無い値は無視して掲載社数を出す", () => {
    expect(lead("ind=存在しない業種")).toBe(lead(""));
  });
});
