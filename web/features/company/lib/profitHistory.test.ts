import { describe, expect, it } from "vitest";
import type { ProfitHistory } from "../types";
import { buildProfitSummary, formatOku } from "./profitHistory";

describe("formatOku", () => {
  it("億円で出す（万円だと8桁が並んで大きさが読めない）", () => {
    expect(formatOku(635_756_000_000)).toBe("6,358億円");
  });

  it("10億円未満は小数第1位まで（`0億円` だと値が無いのと見分けがつかない）", () => {
    expect(formatOku(50_000_000)).toBe("0.5億円");
    expect(formatOku(910_000_000)).toBe("9.1億円");
  });

  it("赤字は負のまま出す", () => {
    // 符号は**全角のマイナス**（画面の他の増減と揃える）。
    expect(formatOku(-24_000_000_000)).toBe("−240億円");
    expect(formatOku(-50_000_000)).toBe("−0.5億円");
  });
});

const history = (profit: (number | null)[], years?: number[]): ProfitHistory => ({
  years: years ?? [2022, 2023, 2024, 2025, 2026],
  profit,
  income: profit,
  employees: profit,
});

describe("buildProfitSummary", () => {
  it("最初と最後の値の差を万円で言う", () => {
    const text = buildProfitSummary(history([9_850_000, null, null, null, 12_400_000]));
    expect(text).toBe("4年で＋255万円（2022年 985万円 → 2026年 1,240万円）。");
  });

  it("減っていれば − で出す", () => {
    const text = buildProfitSummary(history([12_400_000, null, null, null, 9_850_000]));
    expect(text).toContain("−255万円");
  });

  it("値が2つ揃わなければ文を出さない", () => {
    expect(buildProfitSummary(history([null, null, 9_850_000, null, null]))).toBeNull();
    expect(buildProfitSummary(history([null, null, null, null, null]))).toBeNull();
  });

  it("欠測をまたいでも、値のある最初と最後で数える", () => {
    // 2023 と 2026 しか無い会社。**span は「値のある年の差」**で、10年ではない。
    const text = buildProfitSummary(history([null, 5_000_000, null, null, 6_000_000]));
    expect(text).toContain("3年で");
    expect(text).toContain("2023年 500万円 → 2026年 600万円");
  });

  it("赤字の会社でも文が出る", () => {
    const text = buildProfitSummary(history([-6_540_000, null, null, null, 1_000_000]));
    expect(text).toContain("2022年 −654万円 → ");
  });
});
