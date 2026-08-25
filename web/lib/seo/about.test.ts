import { describe, expect, it } from "vitest";
import type { CompaniesData } from "@/features/ranking/types";
import { fiscalPeriodLabel } from "@/lib/data/period";
import companiesData from "../../public/data/companies.json";
import { aboutPageMeta } from "./about";

const meta = (companiesData as CompaniesData).meta;

describe("aboutPageMeta", () => {
  it("タイトルはブランドを後ろに置く（spec 1.4）", () => {
    expect(aboutPageMeta(meta).title).toBe("計算方法 | OpenReport");
  });

  it("description に有価証券報告書と決算期の幅が入る（AC-18）", () => {
    const { description } = aboutPageMeta(meta);
    expect(description).toContain("有価証券報告書");
    // 文言を書き写さない。決算期の書き方（幅で出すか1つ出すか）は E1 が
    // `lib/data/period.ts` で決めているので、そこから引いたものと突き合わせる。
    expect(description).toContain(fiscalPeriodLabel(meta));
  });

  it("タイトルには決算期も社数も直書きしない（spec 1.4）", () => {
    // 入れるのは `/` のタイトルだけ。ここに置くと、限られた文字数を
    // 「計算方法」より弱い情報に使うことになる。
    expect(aboutPageMeta(meta).title).not.toContain("2026");
  });

  it("自己canonical（ADR-0006）", () => {
    expect(aboutPageMeta(meta).canonical).toBe("/about");
  });
});
