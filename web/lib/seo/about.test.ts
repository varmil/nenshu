import { describe, expect, it } from "vitest";
import type { CompaniesData } from "@/features/ranking/types";
import { fiscalPeriodLabel } from "@/lib/data/period";
import companiesData from "../../public/data/companies.json";
import { aboutPageMeta } from "./about";

const meta = (companiesData as CompaniesData).meta;

describe("aboutPageMeta", () => {
  it("タイトルはブランドを後ろに置き、決算期も社数も入れない。自己canonical", () => {
    // spec 1.4。決算期・社数を入れるのは `/` のタイトルだけ。ここに置くと、限られた
    // 文字数を「計算方法」より弱い情報に使うことになる。canonical は ADR-0006 の表。
    const { title, canonical } = aboutPageMeta(meta);
    expect(title).toBe("計算方法 | OpenReport");
    expect(canonical).toBe("/about");
  });

  it("description に有価証券報告書と決算期の幅が入る（AC-18）", () => {
    const { description } = aboutPageMeta(meta);
    expect(description).toContain("有価証券報告書");
    // 文言を書き写さない。決算期の書き方（幅で出すか1つ出すか）は E1 が
    // `lib/data/period.ts` で決めているので、そこから引いたものと突き合わせる。
    expect(description).toContain(fiscalPeriodLabel(meta));
  });
});
