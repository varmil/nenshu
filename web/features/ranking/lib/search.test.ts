import { describe, it, expect } from "vitest";
import { matchesQuery, normalizeCompanyName } from "./search";
import companiesData from "../../../public/data/companies.json";
import type { CompaniesData } from "../types";

const companies = companiesData as CompaniesData;

describe("matchesQuery", () => {
  it.each([
    // AC-6（全角スペース入りの社名）
    ["株式会社　商船三井", "商船三井", true],
    // AC-6（半角カナ→全角カナ）
    ["株式会社キーエンス", "ｷｰｴﾝｽ", true],
    // 大文字小文字を区別しない
    ["ABC株式会社", "abc", true],
    // 全角英数を半角として照合する
    ["ＡＢＣ株式会社", "abc", true],
    // 空クエリは常に一致する
    ["株式会社キーエンス", "", true],
    ["株式会社キーエンス", "存在しない会社名", false],
  ])("「%s」を「%s」で引くと %s", (name, query, expected) => {
    expect(matchesQuery(name, query)).toBe(expected);
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
