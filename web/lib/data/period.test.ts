import { describe, expect, it } from "vitest";
import type { CompaniesMeta } from "@/features/ranking/types";
import { fiscalPeriodLabel, filingWindowLabel } from "./period";

const meta = (fiscalPeriod: string): CompaniesMeta => ({
  version: "2026-06",
  count: 1867,
  fiscalPeriod,
  generatedAt: "2026-08-20T06:22:46.573Z",
});

describe("データの時点（S3・spec 5.）", () => {
  it("決算期は `{年}年{月}期`", () => {
    expect(fiscalPeriodLabel(meta("2026-03"))).toBe("2026年3月期");
  });

  it("月の先頭の0を落とす（`2026年03月期` にしない）", () => {
    expect(fiscalPeriodLabel(meta("2026-09"))).toBe("2026年9月期");
    expect(fiscalPeriodLabel(meta("2027-12"))).toBe("2027年12月期");
  });

  it("提出の窓は決算期の年から引く（日付は年で動かないので定数）", () => {
    expect(filingWindowLabel(meta("2026-03"))).toBe("2026年6月1日〜7月10日");
  });

  // 決算期は全ページの title・description・本文に出る。壊れた値を黙って
  // `NaN年NaN月期` として公開するより、ビルドで止まるほうがよい。
  it("形の違う値は落とす", () => {
    expect(() => fiscalPeriodLabel(meta("2026-3"))).toThrow(/YYYY-MM/);
    expect(() => fiscalPeriodLabel(meta(""))).toThrow(/YYYY-MM/);
  });
});
