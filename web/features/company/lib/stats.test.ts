import { describe, it, expect } from "vitest";
import {
  deviationScore,
  formatDeviation,
  formatDiffFromMean,
  formatTopPercent,
  topPercent,
} from "./stats";

describe("deviationScore", () => {
  it("平均に等しければ50", () => {
    expect(deviationScore(600, 600, 100)).toBe(50);
  });

  it("標準偏差1つぶん上なら60", () => {
    expect(deviationScore(700, 600, 100)).toBe(60);
  });

  it("標準偏差1つぶん下なら40", () => {
    expect(deviationScore(500, 600, 100)).toBe(40);
  });

  // 年収の分布は右に強く裾を引くので、これは異常ではなく仕様（glossary参照）。
  it("100を超える値をそのまま返す", () => {
    expect(deviationScore(21783259, 6291889, 1548572)).toBeCloseTo(150.03, 1);
  });

  it("標準偏差が0なら50に倒す（ゼロ割りを起こさない）", () => {
    expect(deviationScore(700, 600, 0)).toBe(50);
  });
});

describe("topPercent", () => {
  it("1位/1,867社は約0.054%", () => {
    expect(topPercent(1, 1867)).toBeCloseTo(0.0536, 3);
  });

  it("最下位は100%", () => {
    expect(topPercent(1867, 1867)).toBe(100);
  });

  it("母集団が0でもゼロ割りしない", () => {
    expect(topPercent(1, 0)).toBe(0);
  });
});

describe("formatTopPercent", () => {
  // 1位は0.054%。「上位0.1%」と丸めると2位以下と区別がつかない。
  it("0.1%未満は「上位0.1%未満」", () => {
    expect(formatTopPercent(topPercent(1, 1867))).toBe("上位0.1%未満");
  });

  it("0.1%以上は小数第1位まで", () => {
    expect(formatTopPercent(topPercent(120, 1867))).toBe("上位6.4%");
    expect(formatTopPercent(topPercent(280, 1867))).toBe("上位15.0%");
  });

  it("ちょうど0.1%は「未満」にしない", () => {
    expect(formatTopPercent(0.1)).toBe("上位0.1%");
  });
});

describe("formatDeviation", () => {
  it("小数第1位まで", () => {
    expect(formatDeviation(58.14)).toBe("58.1");
    expect(formatDeviation(150.03)).toBe("150.0");
  });
});

describe("formatDiffFromMean", () => {
  it("正なら全角プラス", () => {
    expect(formatDiffFromMean(15491370)).toBe("＋1,549万円");
  });

  it("負なら全角マイナスで、絶対値を出す", () => {
    expect(formatDiffFromMean(-2000000)).toBe("−200万円");
  });

  it("0はプラス扱い", () => {
    expect(formatDiffFromMean(0)).toBe("＋0万円");
  });
});
