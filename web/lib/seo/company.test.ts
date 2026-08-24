import { describe, expect, it } from "vitest";
import companiesData from "../../public/data/companies.json";
import curvesData from "../../public/data/curves.json";
import statsData from "../../public/data/stats.json";
import { buildCompanyView } from "@/features/company/lib/view";
import type { CompanyStatsData } from "@/features/company/types";
import type { CompaniesData, CurvesData } from "@/features/ranking/types";
import { companyMetadata, companyPageMeta } from "./company";
import { toMetadata } from "./pageMeta";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;
const stats = statsData as CompanyStatsData;

/** キーエンス（6861）。平均年齢がちょうど35.0歳なので35歳そろえでも金額は同じ。 */
const keyence = buildCompanyView(companies, curves, stats, "6861")!;

/** 決算期は `lib/data/period.ts` が作る文字列。ここは受け取るだけなので固定値でよい。 */
const PERIOD = "2026年3月期";

describe("companyPageMeta", () => {
  it("有報そのままの金額を出し、推定の語を出さない（AC-9）", () => {
    const meta = companyPageMeta(keyence, PERIOD);
    expect(meta.title).toBe("株式会社キーエンスの平均年収 | 有価証券報告書は2,178万円");
    expect(meta.description).toContain("平均年間給与は2,178万円");
    expect(meta.title).not.toContain("推定");
    expect(meta.description).not.toContain("推定");
  });

  /**
   * **表示基準を引数に取らない**（R1・ADR-0012）。`?age=` を無くしたので、
   * 1つのURLに対してメタデータは1つしか存在しない。U16 が企業詳細で直していた
   * 食い違い（親 Issue #130）は起きようが無くなった。
   */
  it("同じ会社なら常に同じメタデータを返す（表示基準で変わらない）", () => {
    expect(companyPageMeta(keyence, PERIOD)).toEqual(companyPageMeta(keyence, PERIOD));
  });

  it("canonical は素の `/company/[id]`（ADR-0006）", () => {
    // 配ってしまった `?age=N` のリンクの寄せ先として、canonical は変わらず必要。
    expect(companyPageMeta(keyence, PERIOD).canonical).toBe("/company/6861");
  });

  it("順位は全体と業界内の両方を description に出す", () => {
    const meta = companyPageMeta(keyence, PERIOD);
    expect(meta.description).toContain("全1,867社中1位");
    expect(meta.description).toContain("電気機器");
  });

  it("`companyMetadata` は `companyPageMeta` を包むだけ", () => {
    // 文言が2か所に分かれていないことをここで固定する（U16 の要）。
    expect(companyMetadata(keyence, PERIOD)).toEqual(toMetadata(companyPageMeta(keyence, PERIOD)));
  });
});
