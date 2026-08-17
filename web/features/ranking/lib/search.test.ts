import { describe, it, expect } from "vitest";
import { matchesQuery, normalizeCompanyName } from "./search";
import companiesData from "../../../public/data/companies.json";
import type { CompaniesData } from "../types";

const companies = companiesData as CompaniesData;

describe("matchesQuery", () => {
  it("AC-6: 「商船三井」で「株式会社　商船三井」が引ける（全角スペース入り）", () => {
    expect(matchesQuery("株式会社　商船三井", "商船三井")).toBe(true);
  });

  it("AC-6: 「ｷｰｴﾝｽ」で「株式会社キーエンス」が引ける（半角カナ→全角カナ）", () => {
    expect(matchesQuery("株式会社キーエンス", "ｷｰｴﾝｽ")).toBe(true);
  });

  it("大文字小文字を区別しない", () => {
    expect(matchesQuery("ABC株式会社", "abc")).toBe(true);
  });

  it("全角英数を半角として照合する", () => {
    expect(matchesQuery("ＡＢＣ株式会社", "abc")).toBe(true);
  });

  it("空クエリは常に一致する", () => {
    expect(matchesQuery("株式会社キーエンス", "")).toBe(true);
  });

  it("該当しない語では一致しない", () => {
    expect(matchesQuery("株式会社キーエンス", "存在しない会社名")).toBe(false);
  });
});

describe("normalizeCompanyName", () => {
  it("法人格の表記ゆれ（株式会社・㈱）を同じ結果に正規化する", () => {
    expect(normalizeCompanyName("株式会社ABC")).toBe(normalizeCompanyName("ＡＢＣ㈱"));
  });

  it("有限会社・合同会社も除去する", () => {
    expect(normalizeCompanyName("有限会社サンプル")).toBe("サンプル".toLowerCase());
    expect(normalizeCompanyName("合同会社サンプル")).toBe("サンプル".toLowerCase());
  });

  it("実データ全件を正規化してもエラーにならない（防御的スモークテスト）", () => {
    for (const row of companies.rows) {
      expect(() => normalizeCompanyName(row[1])).not.toThrow();
    }
  });
});
