import { describe, it, expect } from "vitest";
import statsData from "../../../public/data/stats.json";
import type { CompanyStatsData } from "../types";
import {
  ESTIMATE_RANGE_RATIO,
  binOf,
  deviationScore,
  estimateRange,
  formatBinLabel,
  formatDeviation,
  formatDiffFromMean,
  formatTopPercent,
  positionPercent,
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


const stats = statsData as CompanyStatsData;

describe("分布（AC-13）", () => {
  it("表示基準ごとに階級が違う", () => {
    const raw = stats.distribution[0];
    const at25 = stats.distribution[stats.bases.indexOf(25)];
    // 25歳そろえは 249〜788万円に収まるので、実測値と同じ幅では9ビンが埋まらない。
    expect(at25.width).toBeLessThan(raw.width);
  });

  it("どの表示基準でも9ビンで、合計が母集団の社数になる", () => {
    for (const d of stats.distribution) {
      expect(d.counts).toHaveLength(9);
      expect(d.counts.reduce((a, b) => a + b, 0)).toBe(stats.count);
    }
  });

  it("実測値の中位は690万円", () => {
    expect(Math.round(stats.distribution[0].median / 10000)).toBe(690);
  });

  it("binOf は両端で外側を吸収する", () => {
    const d = stats.distribution[0];
    expect(binOf(d, d.min - 1_000_000)).toBe(0);
    expect(binOf(d, d.min + d.width * 100)).toBe(8);
    expect(binOf(d, d.min + d.width * 3.5)).toBe(3);
  });

  it("ビンのラベルは両端が「未満」「以上」になる", () => {
    const d = stats.distribution[0];
    expect(formatBinLabel(d, 0)).toMatch(/万円未満$/);
    expect(formatBinLabel(d, 8)).toMatch(/万円以上$/);
    expect(formatBinLabel(d, 4)).toMatch(/万円$/);
    expect(formatBinLabel(d, 4)).toContain("〜");
  });
});

describe("positionPercent", () => {
  // 金額ではなく順位から出す。上位1社の外れ値で帯の9割が空くのを避ける。
  it("1位は100%、最下位は0%", () => {
    expect(positionPercent(1, 1867)).toBe(100);
    expect(positionPercent(1867, 1867)).toBe(0);
  });

  it("母集団が1社以下なら0に倒す（ゼロ割りを起こさない）", () => {
    expect(positionPercent(1, 1)).toBe(0);
  });
});

describe("estimateRange（AC-14）", () => {
  it("±20%", () => {
    expect(ESTIMATE_RANGE_RATIO).toBe(0.2);
    const { low, high } = estimateRange(10_000_000);
    expect(low).toBe(8_000_000);
    expect(high).toBe(12_000_000);
  });
});
