import { describe, it, expect } from "vitest";
import type { TargetAge } from "@/features/ranking/types";
import { curveValuesInYen } from "@/features/ranking/lib/curve";
import { estimateSalary } from "@/features/ranking/lib/salary";
import {
  companies,
  curves,
  industryOf,
  pickCompany,
  rowIndexOf,
  rowOf,
  stats,
} from "@/testing/realData";
import { statsForBasis } from "./stats";
import { buildCompanyView } from "./view";

function view(id: string) {
  const v = buildCompanyView(companies, curves, stats, id);
  if (v === null) throw new Error(`${id} が見つからない`);
  return v;
}

function at(id: string, age: TargetAge | null) {
  return statsForBasis(view(id), age);
}

/**
 * その表示基準での全社の金額（`companies.rows` の並び）。順位と偏差値の期待値はここから
 * 数え直す——`stats.json` の値を書き写さず、同じ金額の並びから出す。
 */
const salariesCache = new Map<TargetAge | null, number[]>();
function salariesAt(age: TargetAge | null): number[] {
  let salaries = salariesCache.get(age);
  if (salaries === undefined) {
    salaries = companies.rows.map((row) =>
      age === null
        ? row[6]
        : estimateSalary(
            row[6],
            row[4],
            curveValuesInYen(curves.curves[companies.curveKeys[row[3]]]),
            curves.agePoints,
            age
          )
    );
    salariesCache.set(age, salaries);
  }
  return salaries;
}

/**
 * その表示基準での金額・全体順位・業界内順位が母集団と合っていること。順位は
 * 「自分より金額が高い会社の数 ＋ 1」（同額は同順位）。
 */
function expectPosition(id: string, age: TargetAge | null) {
  const s = at(id, age);
  const salaries = salariesAt(age);
  const industry = rowOf(id)[2];
  expect(s.salary).toBe(salaries[rowIndexOf(id)]);
  expect(s.rankAll).toBe(1 + salaries.filter((x) => x > s.salary).length);
  expect(s.rankIndustry).toBe(
    1 + salaries.filter((x, i) => companies.rows[i][2] === industry && x > s.salary).length
  );
}

/** 偏差値 = 50 + 10 ×（金額 − 平均）÷ 標準偏差。母集団はその表示基準の全社（母標準偏差）。 */
function expectedDeviation(age: TargetAge | null, salary: number) {
  const salaries = salariesAt(age);
  const mean = salaries.reduce((a, b) => a + b, 0) / salaries.length;
  const sd = Math.sqrt(salaries.reduce((s, x) => s + (x - mean) ** 2, 0) / salaries.length);
  return 50 + (10 * (salary - mean)) / sd;
}

/**
 * `docs/company/spec.md` AC-1〜AC-6 を、値ではなく母集団との関係で見る。金額は同じ表示基準の
 * 全社の並びから、順位は自分より金額が高い会社の数から、偏差値は全社の平均と標準偏差から
 * 数え直して突き合わせる。**データが毎日動いても、この関係は崩れない**（`docs/refresh/spec.md`）。
 *
 * 上位◯%は画面に出さない（2026-08-20・運営者の判断）ので見ない。
 */
describe("buildCompanyView", () => {
  it("AC-1: キーエンス（6861）の行の値と35歳の位置", () => {
    const [, name, industryIdx, , avgAge, avgTenure, avgSalary, employees, badge] = rowOf("6861");
    const v = view("6861");
    expect(v.name).toBe(name);
    expect(v.tse33).toBe(industryOf("6861"));
    expect(v.hasBadge).toBe(badge === 1);
    expect(v.avgSalary).toBe(avgSalary);
    expect(v.avgAge).toBe(avgAge);
    expect(v.avgTenure).toBe(avgTenure);
    expect(v.employees).toBe(employees);
    expect(v.totalCount).toBe(companies.rows.length);
    expect(v.industryCount).toBe(companies.rows.filter((row) => row[2] === industryIdx).length);
    expectPosition("6861", 35);
  });

  it("AC-2: 偏差値は 50 + 10 ×（金額 − 平均）÷ 標準偏差（9つの表示基準すべて）", () => {
    for (const s of view("6861").byBasis) {
      // `stats.json` の平均と標準偏差は円に丸めてあるので、小数第3位まで見る。
      expect(s.deviation).toBeCloseTo(expectedDeviation(s.targetAge, s.salary), 3);
    }
  });

  /*
   * 業界内順位が1の会社だけを見ていると、業界内順位を数えずに1を返しても通る。実測値と
   * 年齢そろえで母集団が別なので、同じ会社でも両方の表示基準で数え直す。
   */
  it("AC-2: 業界の1位でない会社の35歳と実測値", () => {
    const raw = stats.bases.indexOf(null);
    const at35 = stats.bases.indexOf(35);
    const id = pickCompany(
      "実測値でも35歳そろえでも業界の1位でない会社",
      (_, i) => stats.rankIndustry[i][raw] > 1 && stats.rankIndustry[i][at35] > 1
    );
    expectPosition(id, 35);
    expectPosition(id, null);
  });

  it("AC-4: 実測値＋25〜60歳の9点がそろっている", () => {
    const v = view("6861");
    // 先頭が実測値（ADR-0007）。続いて8年齢。
    expect(v.byBasis.map((s) => s.targetAge)).toEqual([null, 25, 30, 35, 40, 45, 50, 55, 60]);
    expect(v.byBasis.map((s) => s.salary)).toEqual(
      v.byBasis.map((s) => salariesAt(s.targetAge)[rowIndexOf("6861")])
    );
  });

  it("AC-5: IDがEDINETコードの会社（非上場）も組み立てられる", () => {
    const id = pickCompany("IDがEDINETコードの会社", (row) => /^E\d{5}$/.test(row[0]));
    const v = view(id);
    expect(v.id).toBe(id);
    expect(v.name).toBe(rowOf(id)[1]);
    expect(v.tse33).toBe(industryOf(id));
    expectPosition(id, 35);
  });

  it("AC-6: 単体が連結の10%未満の会社は「本社のみ」", () => {
    const id = pickCompany("単体が連結の10%未満の会社", (row) => row[8] === 1);
    expect(view(id).hasBadge).toBe(true);
  });

  it("AC-7: 存在しないIDと旧形式の書類IDは null", () => {
    expect(buildCompanyView(companies, curves, stats, "s100yfah")).toBeNull();
    expect(buildCompanyView(companies, curves, stats, "存在しない")).toBeNull();
    expect(buildCompanyView(companies, curves, stats, "")).toBeNull();
  });

  // **全社を回すことに意味がある**（どの会社でも組み立てが壊れない）ので、
  // サンプリングにはしない。**E2 で母集団が1.59倍になり既定の5秒を超えた**ので
  // タイムアウトを明示してある（実測6.5秒。近傍10社の算出が9基準ぶん走る）。
  it("全社が組み立てられ、順位が1以上・社数以下に収まる", () => {
    for (const row of companies.rows) {
      const v = buildCompanyView(companies, curves, stats, row[0]);
      expect(v).not.toBeNull();
      for (const s of v!.byBasis) {
        expect(s.rankAll).toBeGreaterThanOrEqual(1);
        expect(s.rankAll).toBeLessThanOrEqual(v!.totalCount);
        expect(s.rankIndustry).toBeGreaterThanOrEqual(1);
        expect(s.rankIndustry).toBeLessThanOrEqual(v!.industryCount);
      }
    }
  }, 60_000);

  it("statsForBasis は8点に無い年齢で例外を投げる", () => {
    expect(() => statsForBasis(view("6861"), 33 as TargetAge)).toThrow(/33/);
  });

  /*
   * ADR-0007 で既定になった表示基準。有報の平均年間給与そのままで、順位も偏差値も
   * 実測値の分布に対して出す（年齢そろえのそれとは別の値になる）。平均年齢がちょうど
   * 35.0歳の会社は35歳そろえでも金額が同じなので、偏差値の違いがそのまま母集団の違いになる。
   */
  it("実測値（targetAge=null）は有報の平均年間給与そのままで、順位も実測値の分布で出す", () => {
    const id = pickCompany("平均年齢がちょうど35.0歳の会社", (row) => row[4] === 35);
    const v = view(id);
    const raw = statsForBasis(v, null);
    expect(raw.salary).toBe(v.avgSalary);
    expectPosition(id, null);

    const at35 = statsForBasis(v, 35);
    expect(at35.salary).toBe(raw.salary);
    expect(raw.deviation).toBeCloseTo(expectedDeviation(null, raw.salary), 3);
    expect(at35.deviation).toBeCloseTo(expectedDeviation(35, at35.salary), 3);
  });

  /*
   * 35歳にそろえると金額が下がり、実測値の上位から順位を落とす会社がある。どの会社がそう
   * なるかは母集団しだいなので、名指しせずデータから選ぶ。
   */
  it("平均年齢が高い会社は実測値と35歳そろえで順位が入れ替わる", () => {
    const raw = stats.bases.indexOf(null);
    const at35 = stats.bases.indexOf(35);
    const id = pickCompany(
      "平均年齢が35歳より高く、35歳にそろえると順位が下がる会社",
      (row, i) => row[4] > 35 && stats.rankAll[i][raw] < stats.rankAll[i][at35]
    );
    const v = view(id);
    expect(statsForBasis(v, null).salary).toBeGreaterThan(statsForBasis(v, 35).salary);
    expect(statsForBasis(v, null).rankAll).toBeLessThan(statsForBasis(v, 35).rankAll);
  });
});
