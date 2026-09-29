import { describe, it, expect } from "vitest";
import { pickPopulationStats, populationForBasis } from "./population";
import { curveValuesInYen } from "./curve";
import { estimateSalary } from "./salary";
import { companies, curves, stats } from "@/testing/realData";

/**
 * 母集団の平均と標準偏差を、`companies.json` の行から数え直す。手順は
 * `pipeline/scripts/build-data.ts` の `buildStats` と同じ（平均は円に丸め、標準偏差は
 * 丸める前の平均から n で割って取る）。
 */
function populationOf(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;
  return { mean: Math.round(mean), sd: Math.round(Math.sqrt(variance)) };
}

describe("pickPopulationStats", () => {
  /*
   * `/` の島に渡す props は HTML の属性に直列化される（ADR-0014）。stats.json 全体
   * （rankAll / rankIndustry を含む。社数×9 の配列2本）を渡すと初回 HTML の予算を
   * 大きく超えるので、抜いた結果に余分なフィールドが残っていないことをここで固定する。
   */
  it("母集団の統計だけを取り出す（順位表を持ち出さない）", () => {
    const picked = pickPopulationStats(stats);
    expect(Object.keys(picked).sort()).toEqual(["bases", "count", "population"]);
    expect(picked.count).toBe(companies.rows.length);
    expect(picked.bases).toHaveLength(9);
    expect(picked.population).toHaveLength(9);
  });

  it("JSON にしたときの大きさが 1KB 未満", () => {
    const bytes = new TextEncoder().encode(JSON.stringify(pickPopulationStats(stats))).length;
    expect(bytes).toBeLessThan(1024);
  });
});

describe("populationForBasis", () => {
  it("実測値（null）が先頭の列で、有報の平均年間給与の母集団", () => {
    expect(stats.bases[0]).toBeNull();
    expect(populationForBasis(stats, null)).toEqual(
      populationOf(companies.rows.map((row) => row[6]))
    );
  });

  /*
   * 母集団は表示基準ごとに別物。平均年齢がちょうど35.0歳の会社は金額が実測値と
   * 35歳そろえで同じでも、偏差値は基準ごとに違う。
   */
  it("35歳そろえは35歳時点の推定年収の母集団で、実測値と別物", () => {
    const at35 = populationForBasis(stats, 35);
    expect(at35).toEqual(
      populationOf(
        companies.rows.map((row) =>
          estimateSalary(
            row[6],
            row[4],
            curveValuesInYen(curves.curves[companies.curveKeys[row[3]]]),
            curves.agePoints,
            35
          )
        )
      )
    );
    expect(at35).not.toEqual(populationForBasis(stats, null));
  });

  it("bases に無い値なら null", () => {
    expect(populationForBasis({ ...stats, bases: [25] }, 35)).toBeNull();
  });
});
