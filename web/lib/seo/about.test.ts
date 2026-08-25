import { describe, expect, it } from "vitest";
import type { CompaniesData } from "@/features/ranking/types";
import companiesData from "../../public/data/companies.json";
import { aboutPageMeta } from "./about";

const meta = (companiesData as CompaniesData).meta;

describe("aboutPageMeta", () => {
  it("タイトルはブランドを後ろに置く（spec 1.4）", () => {
    expect(aboutPageMeta(meta).title).toBe("計算方法 | OpenReport");
  });

  it("description に有価証券報告書と決算期が入る（AC-18）", () => {
    const { description } = aboutPageMeta(meta);
    expect(description).toContain("有価証券報告書");
    expect(description).toContain("2026年3月期");
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
