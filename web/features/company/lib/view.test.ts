import { describe, it, expect } from "vitest";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import statsData from "../../../public/data/stats.json";
import type { CompaniesData, CurvesData, TargetAge } from "@/features/ranking/types";
import type { CompanyStatsData } from "../types";
import { formatManYen } from "@/features/ranking/lib/format";
import {
  formatDeviation,
  formatDiffFromMean,
  formatTopPercent,
  statsForBasis,
} from "./stats";
import { buildCompanyView } from "./view";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;
const stats = statsData as CompanyStatsData;

function view(id: string) {
  const v = buildCompanyView(companies, curves, stats, id);
  if (v === null) throw new Error(`${id} が見つからない`);
  return v;
}

function at(id: string, age: TargetAge | null) {
  return statsForBasis(view(id), age);
}

/** `docs/company/spec.md` AC-1〜AC-6 の数値をそのまま固定する。 */
describe("buildCompanyView", () => {
  it("AC-1: キーエンス（6861）の35歳", () => {
    const v = view("6861");
    expect(v.name).toBe("株式会社キーエンス");
    expect(v.tse33).toBe("電気機器");
    expect(v.hasBadge).toBe(false);
    expect(v.avgSalary).toBe(21783259);
    expect(v.avgAge).toBe(35);
    expect(v.avgTenure).toBe(11.3);
    expect(v.employees).toBe(3306);
    expect(v.totalCount).toBe(2961);
    expect(v.industryCount).toBe(193);

    const s = statsForBasis(v, 35);
    expect(formatManYen(s.salary)).toBe("2,178万円");
    expect(s.rankAll).toBe(2);
    expect(s.rankIndustry).toBe(1);
  });

  it("AC-2: キーエンスの偏差値・上位%・平均との差", () => {
    const s = at("6861", 35);
    expect(formatDeviation(s.deviation)).toBe("149.5");
    expect(formatTopPercent(s.topPercent)).toBe("上位0.1%未満");
    expect(formatDiffFromMean(s.diffFromMean)).toBe("＋1,562万円");
    expect(formatManYen(s.populationMean)).toBe("616万円");
  });

  it("AC-2: トヨタ自動車（7203）の35歳", () => {
    const v = view("7203");
    expect(v.name).toBe("トヨタ自動車株式会社");
    expect(v.tse33).toBe("輸送用機器");
    expect(v.industryCount).toBe(79);

    const s = statsForBasis(v, 35);
    expect(formatManYen(s.salary)).toBe("859万円");
    expect(s.rankAll).toBe(169);
    expect(formatTopPercent(s.topPercent)).toBe("上位5.7%");
    expect(s.rankIndustry).toBe(2);
    expect(formatDeviation(s.deviation)).toBe("65.5");
  });

  it("AC-3: キーエンスの25歳と60歳", () => {
    const s25 = at("6861", 25);
    expect(formatManYen(s25.salary)).toBe("788万円");
    expect(formatDeviation(s25.deviation)).toBe("125.7");
    expect(formatDiffFromMean(s25.diffFromMean)).toBe("＋373万円");

    const s60 = at("6861", 60);
    expect(formatManYen(s60.salary)).toBe("2,213万円");
  });

  it("AC-4: 実測値＋25〜60歳の9点がそろっている", () => {
    const v = view("6861");
    // 先頭が実測値（ADR-0007）。続いて8年齢。
    expect(v.byBasis.map((s) => s.targetAge)).toEqual([null, 25, 30, 35, 40, 45, 50, 55, 60]);
    expect(v.byBasis.slice(1).map((s) => formatManYen(s.salary))).toEqual([
      "788万円",
      "1,487万円",
      "2,178万円",
      "2,365万円",
      "2,493万円",
      "2,620万円",
      "2,699万円",
      // 60歳で下がるのは業種カーブ自体が62歳・67歳に向けて落ちるため（既知の性質）。
      "2,213万円",
    ]);
  });

  it("AC-5: みずほ銀行（E03532・非上場でIDはEDINETコード）の35歳", () => {
    const v = view("E03532");
    expect(v.name).toBe("株式会社みずほ銀行");
    expect(v.tse33).toBe("銀行業");
    expect(v.industryCount).toBe(82);

    const s = statsForBasis(v, 35);
    expect(formatManYen(s.salary)).toBe("755万円");
    expect(s.rankAll).toBe(383);
    expect(formatTopPercent(s.topPercent)).toBe("上位12.9%");
    expect(s.rankIndustry).toBe(17);
    expect(formatDeviation(s.deviation)).toBe("58.9");
  });

  it("AC-6: 三菱商事（8058）は「本社のみ」", () => {
    const v = view("8058");
    expect(v.name).toBe("三菱商事株式会社");
    expect(v.hasBadge).toBe(true);
    expect(statsForBasis(v, 35).rankAll).toBe(5);
  });

  it("AC-7: 存在しないIDと旧形式の書類IDは null", () => {
    expect(buildCompanyView(companies, curves, stats, "s100yfah")).toBeNull();
    expect(buildCompanyView(companies, curves, stats, "存在しない")).toBeNull();
    expect(buildCompanyView(companies, curves, stats, "")).toBeNull();
  });

  // **全社を回すことに意味がある**（どの会社でも組み立てが壊れない）ので、
  // サンプリングにはしない。**E2 で母集団が1.59倍になり既定の5秒を超えた**ので
  // タイムアウトを明示してある（実測6.5秒。近傍10社の算出が9基準ぶん走る）。
  it("全2,961社が組み立てられ、順位が1以上・社数以下に収まる", () => {
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

  // ADR-0007 で既定になった表示基準。有報の平均年間給与そのままで、順位も偏差値も
  // 実測値の分布に対して出す（年齢そろえのそれとは別の値になる）。
  it("実測値（targetAge=null）は有報の平均年間給与そのままで、順位も実測値の分布で出す", () => {
    const v = view("6861");
    const raw = statsForBasis(v, null);
    expect(raw.salary).toBe(v.avgSalary);
    expect(formatManYen(raw.salary)).toBe("2,178万円");
    expect(raw.rankAll).toBe(3);
    expect(raw.rankIndustry).toBe(1);

    // 実測値の母集団は年齢そろえ（35歳）のそれと別物。
    const at35 = statsForBasis(v, 35);
    expect(raw.populationMean).not.toBe(at35.populationMean);
    expect(formatManYen(raw.populationMean)).toBe("693万円");
  });

  it("平均年齢が高い会社は実測値と35歳そろえで順位が入れ替わる", () => {
    // 三菱商事は平均42.3歳。実測値では上位だが、35歳にそろえると下がる。
    const v = view("8058");
    const raw = statsForBasis(v, null);
    const at35 = statsForBasis(v, 35);
    expect(raw.salary).toBeGreaterThan(at35.salary);
    expect(raw.rankAll).toBeLessThan(at35.rankAll);
  });
});
