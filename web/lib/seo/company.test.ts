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

describe("companyPageMeta", () => {
  it("実測値では有報そのままの金額を出し、推定の語を出さない（AC-9）", () => {
    const meta = companyPageMeta(keyence, null);
    expect(meta.title).toBe("株式会社キーエンスの平均年収 | 有価証券報告書は2,178万円");
    expect(meta.description).toContain("平均年間給与は2,178万円");
    expect(meta.title).not.toContain("推定");
    expect(meta.description).not.toContain("推定");
  });

  it("年齢そろえでは年齢とその年齢の金額が入る", () => {
    const at25 = companyPageMeta(keyence, 25);
    expect(at25.title).toBe("株式会社キーエンスの年収 | 25歳時点の推定は788万円");
    expect(at25.description).toContain("25歳時点の推定年収は788万円");
    expect(at25.description).toContain("推定値です");
  });

  /**
   * U16 が直しているのはここ。**表示基準ごとにタイトルが違う**からこそ、
   * 切り替えたときに更新しないと画面の金額と食い違う（親 Issue #130）。
   */
  it("表示基準ごとにタイトルが変わる", () => {
    const titles = new Set(
      [null, 25, 30, 40, 60].map((age) => companyPageMeta(keyence, age as null).title)
    );
    expect(titles.size).toBe(5);
  });

  it("canonical は表示基準に依らず素の `/company/[id]`（ADR-0006）", () => {
    // `?age=N` を付けると1,867社×9基準の16,803 URL を申告することになる。
    for (const age of [null, 25, 35, 60] as const) {
      expect(companyPageMeta(keyence, age).canonical).toBe("/company/6861");
    }
  });

  it("順位は全体と業界内の両方を description に出す", () => {
    const meta = companyPageMeta(keyence, null);
    expect(meta.description).toContain("全1,867社中1位");
    expect(meta.description).toContain("電気機器");
  });

  it("`companyMetadata` は `companyPageMeta` を包むだけ", () => {
    // 文言が2か所に分かれていないことをここで固定する（U16 の要）。
    expect(companyMetadata(keyence, 35)).toEqual(toMetadata(companyPageMeta(keyence, 35)));
  });
});
