import { describe, it, expect } from "vitest";
import { estimateSalary } from "./salary";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import type { CompaniesData, CurvesData } from "../types";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;

function findRow(id: string) {
  const row = companies.rows.find((r) => r[0] === id);
  if (!row) throw new Error(`row not found: ${id}`);
  return row;
}

describe("estimateSalary", () => {
  // AC-1: 1位に「株式会社キーエンス」が推定年収2,178万円で表示される（35歳時点）
  it("キーエンスの35歳時点の推定年収が2,178万円（spec.md AC-1）", () => {
    const [, , , curveIdx, avgAge, , avgSalary] = findRow("6861");
    const curveKey = companies.curveKeys[curveIdx];
    const estimated = estimateSalary(avgSalary, avgAge, curves.curves[curveKey], curves.agePoints, 35);
    expect(Math.round(estimated / 10000)).toBe(2178);
  });

  // AC-2: 年齢スイッチで25歳を選ぶとキーエンスの推定年収が1,642万円に変わる
  it("キーエンスの25歳時点の推定年収が1,642万円（spec.md AC-2）", () => {
    const [, , , curveIdx, avgAge, , avgSalary] = findRow("6861");
    const curveKey = companies.curveKeys[curveIdx];
    const estimated = estimateSalary(avgSalary, avgAge, curves.curves[curveKey], curves.agePoints, 25);
    expect(Math.round(estimated / 10000)).toBe(1642);
  });

  it("平均年齢=目標年齢のとき、推定年収は平均年間給与と一致する（倍率1）", () => {
    const [, , , curveIdx, avgAge, , avgSalary] = findRow("6861");
    const curveKey = companies.curveKeys[curveIdx];
    const estimated = estimateSalary(avgSalary, avgAge, curves.curves[curveKey], curves.agePoints, avgAge);
    expect(estimated).toBe(avgSalary);
  });
});
