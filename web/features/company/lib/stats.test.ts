import { describe, it, expect } from "vitest";
import statsData from "../../../public/data/stats.json";
import type { CompanyStatsData } from "../types";
import {
  binOf,
  deviationScore,
  estimateRange,
  formatBinLabel,
  formatBinTick,
  formatDeviation,
  formatDiffFromMean,
  niceTicks,
  positionPercent,
} from "./stats";

describe("deviationScore", () => {
  it("平均なら50、標準偏差1つぶん上下なら60・40", () => {
    expect(deviationScore(600, 600, 100)).toBe(50);
    expect(deviationScore(700, 600, 100)).toBe(60);
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

/*
 * 分布（AC-13）。**`stats.json` そのもの**（9ビン・合計が社数・中位・基準ごとに階級が違う）は
 * 作る側の `pipeline/scripts/build-data.test.ts` が全基準で見ている。ここは読む側の関数だけ。
 */
describe("分布（AC-13）", () => {
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
    const { low, high } = estimateRange(10_000_000);
    expect(low).toBe(8_000_000);
    expect(high).toBe(12_000_000);
  });
});

describe("niceTicks", () => {
  it("丸い刻みを返す（788万〜2,699万の描画範囲）", () => {
    // SalaryCurveChart が渡すのは帯を含む範囲。C2 では 422 / 1,430 / 2,439 / 3,448
    // というデータ由来の端数が並んでいた。
    const ticks = niceTicks(4_220_000, 34_480_000);
    expect(ticks).toEqual([10_000_000, 20_000_000, 30_000_000]);
  });

  it("刻みは 1・2・2.5・5 ×10ⁿ のどれかで、目盛はすべて範囲の内側にある", () => {
    for (const [low, high] of [
      [0, 100],
      [1_000, 9_300],
      [2_400_000, 8_100_000],
      [4_000_000, 4_800_000],
    ]) {
      const ticks = niceTicks(low, high);
      const step = ticks[1] - ticks[0];
      const magnitude = 10 ** Math.floor(Math.log10(step));
      // 浮動小数の誤差があるので、係数は近似で照合する。
      const factor = step / magnitude;
      expect([1, 2, 2.5, 5].some((candidate) => Math.abs(factor - candidate) < 1e-9)).toBe(true);
      for (const tick of ticks) {
        expect(tick).toBeGreaterThanOrEqual(low);
        expect(tick).toBeLessThanOrEqual(high);
      }
    }
  });

  it("幅が0以下なら空を返す（全点が同額でも落ちない）", () => {
    expect(niceTicks(5, 5)).toEqual([]);
    expect(niceTicks(9, 3)).toEqual([]);
  });
});

describe("formatBinTick", () => {
  const distribution = { median: 0, min: 5_000_000, width: 1_000_000, counts: new Array(9).fill(0) };

  it("先頭は上限、末尾は下限＋、中間は下限だけを返す", () => {
    expect(formatBinTick(distribution, 0)).toBe("〜600");
    expect(formatBinTick(distribution, 1)).toBe("600");
    expect(formatBinTick(distribution, 8)).toBe("1,300+");
  });

  // 9つ並べたときに折り返さないことが目的なので、長さを固定しておく。
  it("どのラベルも7文字以内に収まる", () => {
    for (let i = 0; i < 9; i++) {
      expect(formatBinTick(distribution, i).length).toBeLessThanOrEqual(7);
    }
  });
});
