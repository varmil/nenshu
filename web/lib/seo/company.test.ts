import { describe, expect, it } from "vitest";
import { buildCompanyView } from "@/features/company/lib/view";
import { formatInt, formatManYen } from "@/features/ranking/lib/format";
import { companyFiscalPeriodLabel } from "@/lib/data/period";
import { companies, curves, industryOf, rowIndexOf, rowOf, stats } from "@/testing/realData";
import { companyPageMeta } from "./company";

const keyence = buildCompanyView(companies, curves, stats, "6861")!;

/** 決算期は `lib/data/period.ts` が作る文字列。ページと同じくその会社の値を渡す。 */
const PERIOD = companyFiscalPeriodLabel(companies, rowOf("6861"));

describe("companyPageMeta", () => {
  it("有報そのままの金額を出し、推定の語を出さない（AC-9）", () => {
    const [, name, , , , , avgSalary] = rowOf("6861");
    const meta = companyPageMeta(keyence, PERIOD);
    expect(meta.title).toBe(`${name}の平均年収 | 有価証券報告書は${formatManYen(avgSalary)}`);
    expect(meta.description).toContain(`平均年間給与は${formatManYen(avgSalary)}`);
    expect(meta.description).not.toContain("推定");
  });

  /**
   * **表示基準を引数に取らない**（R1・ADR-0012）。`?age=` を無くしたので、
   * 1つのURLに対してメタデータは1つしか存在しない（型がそれを保証する）。
   */
  it("canonical は素の `/company/[id]`（ADR-0006）", () => {
    // 配ってしまった `?age=N` のリンクの寄せ先として、canonical は変わらず必要。
    expect(companyPageMeta(keyence, PERIOD).canonical).toBe("/company/6861");
  });

  // 順位は実測値の列（`stats.json` の表示基準の先頭）。社数は `companies.json` の行から数える。
  it("順位は全体と業界内の両方を description に出す", () => {
    const row = rowIndexOf("6861");
    const raw = stats.bases.indexOf(null);
    const industryCount = companies.rows.filter((r) => r[2] === rowOf("6861")[2]).length;
    const meta = companyPageMeta(keyence, PERIOD);
    expect(meta.description).toContain(
      `全${formatInt(companies.rows.length)}社中${stats.rankAll[row][raw]}位`
    );
    expect(meta.description).toContain(
      `${industryOf("6861")}${industryCount}社中${stats.rankIndustry[row][raw]}位`
    );
  });
});
