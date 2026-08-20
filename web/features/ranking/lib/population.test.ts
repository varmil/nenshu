import { describe, it, expect } from "vitest";
import { pickPopulationStats, populationForBasis } from "./population";
import statsData from "../../../public/data/stats.json";
import type { PopulationStats } from "../types";

const stats = statsData as PopulationStats;

describe("pickPopulationStats", () => {
  /*
   * ランキングページのHTMLには1,867社ぶんの行が既に載っている（gzip 66KB・Issue #22）。
   * stats.json 全体（rankAll / rankIndustry を含む）を渡すと予算を大きく超えるので、
   * 抜いた結果に余分なフィールドが残っていないことをここで固定する。
   */
  it("母集団の統計だけを取り出す（順位表を持ち出さない）", () => {
    const picked = pickPopulationStats(stats);
    expect(Object.keys(picked).sort()).toEqual(["bases", "count", "population"]);
    expect(picked.count).toBe(1867);
    expect(picked.bases).toHaveLength(9);
    expect(picked.population).toHaveLength(9);
  });

  it("JSON にしたときの大きさが 1KB 未満", () => {
    const bytes = new TextEncoder().encode(JSON.stringify(pickPopulationStats(stats))).length;
    expect(bytes).toBeLessThan(1024);
  });
});

describe("populationForBasis", () => {
  it("実測値（null）が先頭の列", () => {
    expect(stats.bases[0]).toBeNull();
    const raw = populationForBasis(stats, null)!;
    expect(Math.round(raw.mean / 10000)).toBe(719);
    expect(Math.round(raw.sd / 10000)).toBe(200);
  });

  /*
   * 母集団は表示基準ごとに別物。キーエンスは平均年齢がちょうど35.0歳なので
   * 金額はどちらも2,178万円だが、偏差値は122.9と150.0で違う（CLAUDE.md）。
   */
  it("35歳そろえは実測値と別の母集団", () => {
    const at35 = populationForBasis(stats, 35)!;
    expect(Math.round(at35.mean / 10000)).toBe(629);
    expect(Math.round(at35.sd / 10000)).toBe(155);
  });

  it("bases に無い値なら null", () => {
    expect(populationForBasis({ ...stats, bases: [25] }, 35)).toBeNull();
  });
});
