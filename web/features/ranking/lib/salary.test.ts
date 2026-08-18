import { describe, it, expect } from "vitest";
import { estimateSalary } from "./salary";
import { curveValuesInYen, interpolate } from "./curve";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import { TARGET_AGES } from "../types";
import type { CompaniesData, CurvesData } from "../types";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;

function findRow(id: string) {
  const row = companies.rows.find((r) => r[0] === id);
  if (!row) throw new Error(`row not found: ${id}`);
  return row;
}

/** 会社1社ぶんの引数をまとめて作る。カーブは円に揃える（ADR-0005）。 */
function argsFor(id: string) {
  const [, , , curveIdx, avgAge, , avgSalary] = findRow(id);
  return {
    avgSalary,
    avgAge,
    curveValues: curveValuesInYen(curves.curves[companies.curveKeys[curveIdx]]),
    agePoints: curves.agePoints,
  };
}

function estimate(id: string, targetAge: number) {
  const { avgSalary, avgAge, curveValues, agePoints } = argsFor(id);
  return estimateSalary(avgSalary, avgAge, curveValues, agePoints, targetAge);
}

describe("estimateSalary", () => {
  // AC-1: 1位に「株式会社キーエンス」が推定年収2,178万円で表示される（35歳時点）
  it("キーエンスの35歳時点の推定年収が2,178万円（spec.md AC-1）", () => {
    expect(Math.round(estimate("6861", 35) / 10000)).toBe(2178);
  });

  // AC-2: 年齢スイッチで25歳を選ぶとキーエンスの推定年収が788万円に変わる。
  // 旧式（ADR-0003）では1,642万円で、これが Issue #42 の症状そのものだった。
  it("キーエンスの25歳時点の推定年収が788万円（spec.md AC-2）", () => {
    expect(Math.round(estimate("6861", 25) / 10000)).toBe(788);
  });

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
  it("推定はカーブの値に対して単調に増加する（全1,867社・8段の全組み合わせ）", () => {
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

  it("全1,867社・8段のどこでも0円以下や NaN にならない", () => {
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
