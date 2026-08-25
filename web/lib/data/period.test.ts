import { describe, it, expect } from "vitest";
import type { CompaniesData, CompaniesMeta, CompanyRow } from "@/features/ranking/types";
import { fiscalPeriodLabel, companyFiscalPeriodLabel, filingWindowLabel } from "./period";

const meta = (
  from: string,
  to = from,
  filingWindow = { from: "2025-08-25", to: "2026-08-25" }
): CompaniesMeta => ({
  version: "2026-06",
  count: 2961,
  fiscalPeriodRange: { from, to },
  filingWindow,
  excluded: { minEmployees: 100, byEmployees: 1047 },
  generatedAt: "2026-08-25T00:00:00.000Z",
});

const row = (periodIdx: number): CompanyRow => [
  "6861",
  "株式会社キーエンス",
  0,
  0,
  35,
  11.3,
  21_783_259,
  3306,
  0,
  periodIdx,
];

const companies = (periods: string[]): CompaniesData => ({
  meta: meta(periods[0], periods[periods.length - 1]),
  industries: [],
  curveKeys: [],
  periods,
  rows: [],
});

describe("fiscalPeriodLabel", () => {
  it("全社が同じ決算期なら1つだけ出す", () => {
    expect(fiscalPeriodLabel(meta("2026-03"))).toBe("2026年3月期");
  });

  // 現状のデータ（3月期1,865社・4月期2社）。**同じ年なら後ろの年を省く。**
  it("同じ年の幅は後ろの年を省く", () => {
    expect(fiscalPeriodLabel(meta("2026-03", "2026-04"))).toBe("2026年3月期〜4月期");
  });

  // 拡大後のデータ（ADR-0011）。**年が違えば省かない**——省くと「2025年5月期」と
  // 読めてしまう。
  it("年をまたぐ幅は年を省かない", () => {
    expect(fiscalPeriodLabel(meta("2025-03", "2026-05"))).toBe("2025年3月期〜2026年5月期");
  });

  it("月の先頭の0を落とす", () => {
    expect(fiscalPeriodLabel(meta("2026-01", "2026-09"))).toBe("2026年1月期〜9月期");
  });

  it("形が違えば落とす", () => {
    expect(() => fiscalPeriodLabel(meta("2026-3"))).toThrow(/YYYY-MM/);
    expect(() => fiscalPeriodLabel(meta(""))).toThrow(/YYYY-MM/);
  });
});

describe("companyFiscalPeriodLabel", () => {
  // **企業詳細は1社ぶんなので幅ではなく実際の決算期を出す**（E1）。
  it("その会社の決算期を出す", () => {
    const data = companies(["2026-03", "2026-04"]);
    expect(companyFiscalPeriodLabel(data, row(0))).toBe("2026年3月期");
    expect(companyFiscalPeriodLabel(data, row(1))).toBe("2026年4月期");
  });

  it("添字が範囲外なら落とす", () => {
    expect(() => companyFiscalPeriodLabel(companies(["2026-03"]), row(5))).toThrow(/添字/);
  });
});

describe("filingWindowLabel", () => {
  // **窓はデータから引く**（E2・ADR-0011）。回した日から遡って12か月なので、
  // 日付を直書きすると作り直すたびに嘘になる。決算期とは別物——あちらは会社ごとの
  // 期末、こちらは提出日の範囲。
  it("提出の窓を出す", () => {
    expect(filingWindowLabel(meta("2025-03", "2026-05"))).toBe("2025年8月25日〜2026年8月25日");
  });

  it("月日の先頭の0を落とす", () => {
    const window = { from: "2025-01-05", to: "2026-01-05" };
    expect(filingWindowLabel(meta("2025-03", "2026-05", window))).toBe(
      "2025年1月5日〜2026年1月5日"
    );
  });

  it("形が違えば落とす", () => {
    const window = { from: "2025-8-25", to: "2026-08-25" };
    expect(() => filingWindowLabel(meta("2025-03", "2026-05", window))).toThrow(/YYYY-MM-DD/);
  });
});
