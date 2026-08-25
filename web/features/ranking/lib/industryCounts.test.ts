import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { industryCounts } from "./industryCounts";
import type { CompaniesData, CompanyRow } from "../types";

const companies: CompaniesData = JSON.parse(
  readFileSync(new URL("../../../public/data/companies.json", import.meta.url), "utf-8")
);

const row = (tse33Idx: number): CompanyRow => ["id", "名前", tse33Idx, 0, 40, 10, 6_000_000, 100, 0, 0];

describe("industryCounts", () => {
  it("`industries` と同じ並びで、同じ長さの配列を返す", () => {
    const counts = industryCounts(companies);
    expect(counts).toHaveLength(companies.industries.length);
  });

  it("合計が掲載社数と一致する", () => {
    const counts = industryCounts(companies);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(companies.rows.length);
  });

  it("海運業は9社", () => {
    const counts = industryCounts(companies);
    expect(counts[companies.industries.indexOf("海運業")]).toBe(9);
  });

  // 業種のインデックスが範囲外の行が混ざってもページを壊さない（データ側の事故に備える）。
  it("範囲外のインデックスは数えない", () => {
    const counts = industryCounts({
      ...companies,
      industries: ["A", "B"],
      rows: [row(0), row(0), row(1), row(9)],
    });
    expect(counts).toEqual([2, 1]);
  });
});
