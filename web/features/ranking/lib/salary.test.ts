import { describe, it, expect } from "vitest";
import { estimateSalary } from "./salary";
import { curveValuesInYen, interpolate } from "./curve";
import { companies, curves, pickCompany, rowOf } from "@/testing/realData";
import { TARGET_AGES } from "../types";
import type { CompanyRow } from "../types";

/** 会社1社ぶんの引数をまとめて作る。カーブは円に揃える（ADR-0005）。 */
function argsOf(row: CompanyRow) {
  const [, , , curveIdx, avgAge, , avgSalary] = row;
  return {
    avgSalary,
    avgAge,
    curveValues: curveValuesInYen(curves.curves[companies.curveKeys[curveIdx]]),
    agePoints: curves.agePoints,
  };
}

const argsFor = (id: string) => argsOf(rowOf(id));

function estimateOf(row: CompanyRow, targetAge: number) {
  const { avgSalary, avgAge, curveValues, agePoints } = argsOf(row);
  return estimateSalary(avgSalary, avgAge, curveValues, agePoints, targetAge);
}

const estimate = (id: string, targetAge: number) => estimateOf(rowOf(id), targetAge);

describe("estimateSalary", () => {
  /*
   * Issue #42（spec.md AC-2）。旧式（ADR-0003）は「産業平均に対する倍率は何歳でも同じ」と
   * 置いていたので、産業平均を大きく上回る会社ほど若い側が過大に出た（キーエンスの25歳で
   * 起きていた）。2点モデルでは、平均年間給与が平均年齢の産業平均を上回る会社の若い側は、
   * 倍率一定で引き直した値より必ず低くなる。
   */
  it("産業平均を上回る会社では、平均年齢より若い側の推定が倍率一定（旧式）より低い（Issue #42）", () => {
    /** 旧式（倍率一定）で引き直した値。 */
    const ratioEstimate = (row: CompanyRow, age: number) => {
      const { avgSalary, avgAge, curveValues, agePoints } = argsOf(row);
      const curveAt = (a: number) => interpolate(agePoints, curveValues, a);
      return Math.round(avgSalary * (curveAt(age) / curveAt(avgAge)));
    };
    /** 平均年間給与が、平均年齢の産業平均の何倍か。 */
    const premiumOf = (row: CompanyRow) => {
      const { avgSalary, avgAge, curveValues, agePoints } = argsOf(row);
      return avgSalary / interpolate(agePoints, curveValues, avgAge);
    };

    // 全社で、若い側（カーブが22歳の水準より上・平均年齢の水準より下の区間）は旧式を超えない。
    let checked = 0;
    for (const row of companies.rows) {
      if (premiumOf(row) <= 1) continue;
      const { avgAge, curveValues, agePoints } = argsOf(row);
      const curveAt = (a: number) => interpolate(agePoints, curveValues, a);
      for (const age of TARGET_AGES) {
        if (age >= avgAge || curveAt(age) <= curveValues[0] || curveAt(age) >= curveAt(avgAge)) {
          continue;
        }
        checked++;
        expect(estimateOf(row, age)).toBeLessThanOrEqual(ratioEstimate(row, age));
      }
    }
    expect(checked).toBeGreaterThan(0);

    // 産業平均を大きく上回る会社の25歳では、旧式よりはっきり低い（等しいだけでは通さない）。
    const id = pickCompany(
      "平均年間給与が平均年齢の産業平均の1.5倍以上で、平均年齢が35歳以上の会社",
      (row) => row[4] >= 35 && premiumOf(row) >= 1.5
    );
    expect(estimate(id, 25)).toBeLessThan(ratioEstimate(rowOf(id), 25));
  });

  // 平均年齢ちょうどの目標年齢では補正が掛からない（平均年齢がちょうど35.0歳の会社は、
  // 35歳そろえでも金額が実測値と同じになる）。
  it("平均年齢=目標年齢のとき、推定年収は平均年間給与と一致する", () => {
    const { avgSalary, avgAge } = argsFor("6861");
    expect(estimate("6861", avgAge)).toBe(avgSalary);
  });

  it("22歳では業種カーブの22歳の値になる（2点モデルの若い側のアンカー）", () => {
    const { curveValues } = argsFor("6861");
    expect(estimate("6861", 22)).toBe(Math.round(curveValues[0]));
  });

  it("平均年齢より上は倍率一定のまま（ADR-0003の式を残している）", () => {
    // 代表年齢ちょうどの値だけを使い、補間を挟まずに確かめる
    const agePoints = [22, 27, 32];
    const curveValues = [3_000_000, 5_000_000, 6_000_000];
    // 平均年齢27歳・平均給与1,000万円の会社を32歳へ引き直す
    const estimated = estimateSalary(10_000_000, 27, curveValues, agePoints, 32);
    expect(estimated).toBe(Math.round(10_000_000 * (6_000_000 / 5_000_000)));
  });

  it("平均年齢より下は2点モデル（アンカーと平均年齢を結んだ直線上）になる", () => {
    const agePoints = [22, 27, 32];
    const curveValues = [3_000_000, 5_000_000, 6_000_000];
    // 平均年齢32歳・平均給与1,000万円。27歳はアンカー(22歳)と平均年齢のちょうど
    // (5,000,000 − 3,000,000) / (6,000,000 − 3,000,000) = 2/3 の位置にある。
    const estimated = estimateSalary(10_000_000, 32, curveValues, agePoints, 27);
    expect(estimated).toBe(Math.round(3_000_000 + (10_000_000 - 3_000_000) * (2 / 3)));
  });

  // 「年齢が上がれば必ず増える」ではない。産業カーブ自体が下がる区間を持つため
  // （金融業・保険業は47歳→57歳、鉱業は42歳→47歳で下がる）、推定もそこでは下がる。
  // 旧式でも同じ挙動で、モデルの変更で入った性質ではない。
  // 保証されるのは「カーブの値が上がれば推定も上がる」こと。ここを固定する。
  it("推定はカーブの値に対して単調に増加する（全社・8段の全組み合わせ）", () => {
    for (const row of companies.rows) {
      const curveValues = curveValuesInYen(curves.curves[companies.curveKeys[row[3]]]);
      const points = TARGET_AGES.map((age) => ({
        curve: interpolate(curves.agePoints, curveValues, age),
        estimate: estimateSalary(row[6], row[4], curveValues, curves.agePoints, age),
      })).filter((_, i) => TARGET_AGES[i] <= row[4]);

      for (const a of points) {
        for (const b of points) {
          if (a.curve < b.curve) expect(a.estimate).toBeLessThanOrEqual(b.estimate);
        }
      }
    }
  });

  it("平均給与が業種の22歳水準を下回る会社では倍率一定にフォールバックする", () => {
    const agePoints = [22, 27, 32];
    const curveValues = [4_000_000, 5_000_000, 6_000_000];
    // 平均年齢32歳で平均給与300万円。22歳のアンカー400万円を下回る。
    const estimated = estimateSalary(3_000_000, 32, curveValues, agePoints, 27);
    expect(estimated).toBe(Math.round(3_000_000 * (5_000_000 / 6_000_000)));
  });

  it("全社・8段のどこでも0円以下や NaN にならない", () => {
    for (const row of companies.rows) {
      const curveValues = curveValuesInYen(curves.curves[companies.curveKeys[row[3]]]);
      for (const age of TARGET_AGES) {
        const value = estimateSalary(row[6], row[4], curveValues, curves.agePoints, age);
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
  });
});
