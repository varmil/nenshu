import { describe, expect, it } from "vitest";
import type { PerformanceHistoryRow } from "./csv";
import { isProfitBasisMismatched, latestRowsByCode } from "./profitBasis";

const row = (
  edinetCode: string,
  year: number,
  basis: "consolidated" | "nonconsolidated"
): PerformanceHistoryRow => ({
  edinetCode,
  year,
  ordinaryIncome: 1_000,
  basis,
  employeesConsolidated: null,
  employeesNonConsolidated: null,
});

describe("latestRowsByCode", () => {
  it("会社ごとに年がいちばん新しい行を返す（並びに依らない）", () => {
    const latest = latestRowsByCode([
      row("E1", 2024, "consolidated"),
      row("E1", 2026, "nonconsolidated"),
      row("E1", 2025, "consolidated"),
      row("E2", 2025, "consolidated"),
    ]);
    expect(latest.get("E1")?.year).toBe(2026);
    expect(latest.get("E2")?.year).toBe(2025);
    expect(latest.size).toBe(2);
  });
});

describe("isProfitBasisMismatched", () => {
  it("最新年の経常利益が単体だけで、連結の従業員数がある会社は出さない", () => {
    expect(isProfitBasisMismatched(row("E1", 2026, "nonconsolidated"), 73_677)).toBe(true);
  });

  it("連結の従業員数が無い会社は単体がグループ全体なので出す", () => {
    expect(isProfitBasisMismatched(row("E1", 2026, "nonconsolidated"), null)).toBe(false);
  });

  it("最新年の経常利益が連結なら、連結の従業員数があっても出す", () => {
    expect(isProfitBasisMismatched(row("E1", 2026, "consolidated"), 73_677)).toBe(false);
  });

  it("判定は最新年で行う——旧年だけ単体（連結決算を後から作り始めた会社）は出す", () => {
    const latest = latestRowsByCode([
      row("E1", 2022, "nonconsolidated"),
      row("E1", 2023, "nonconsolidated"),
      row("E1", 2024, "consolidated"),
      row("E1", 2025, "consolidated"),
      row("E1", 2026, "consolidated"),
    ]);
    expect(isProfitBasisMismatched(latest.get("E1"), 1_000)).toBe(false);
  });

  it("旧年が連結でも最新年が単体なら出さない（IFRS への移行）", () => {
    const latest = latestRowsByCode([
      row("E1", 2022, "consolidated"),
      row("E1", 2023, "consolidated"),
      row("E1", 2024, "nonconsolidated"),
      row("E1", 2025, "nonconsolidated"),
      row("E1", 2026, "nonconsolidated"),
    ]);
    expect(isProfitBasisMismatched(latest.get("E1"), 1_000)).toBe(true);
  });

  it("逆向き（連結の経常利益 ÷ 単体の従業員数）も出さない", () => {
    expect(isProfitBasisMismatched(row("E1", 2025, "consolidated"), null)).toBe(true);
  });

  it("経常利益の履歴が無い会社は対象にしない（履歴が無いことは別の理由で値が出ない）", () => {
    expect(isProfitBasisMismatched(undefined, 1_000)).toBe(false);
  });
});
