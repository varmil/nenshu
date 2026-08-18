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
  statsForAge,
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

function at(id: string, age: TargetAge) {
  return statsForAge(view(id), age);
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
    expect(v.totalCount).toBe(1867);
    expect(v.industryCount).toBe(150);

    const s = statsForAge(v, 35);
    expect(formatManYen(s.estimatedSalary)).toBe("2,178万円");
    expect(s.rankAll).toBe(1);
    expect(s.rankIndustry).toBe(1);
  });

  it("AC-2: キーエンスの偏差値・上位%・平均との差", () => {
    const s = at("6861", 35);
    expect(formatDeviation(s.deviation)).toBe("150.0");
    expect(formatTopPercent(s.topPercent)).toBe("上位0.1%未満");
    expect(formatDiffFromMean(s.diffFromMean)).toBe("＋1,549万円");
    expect(formatManYen(s.populationMean)).toBe("629万円");
  });

  it("AC-2: トヨタ自動車（7203）の35歳", () => {
    const v = view("7203");
    expect(v.name).toBe("トヨタ自動車株式会社");
    expect(v.tse33).toBe("輸送用機器");
    expect(v.industryCount).toBe(71);

    const s = statsForAge(v, 35);
    expect(formatManYen(s.estimatedSalary)).toBe("859万円");
    expect(s.rankAll).toBe(120);
    expect(formatTopPercent(s.topPercent)).toBe("上位6.4%");
    expect(s.rankIndustry).toBe(2);
    expect(formatDeviation(s.deviation)).toBe("64.9");
  });

  it("AC-3: キーエンスの25歳と60歳", () => {
    const s25 = at("6861", 25);
    expect(formatManYen(s25.estimatedSalary)).toBe("788万円");
    expect(formatDeviation(s25.deviation)).toBe("127.3");
    expect(formatDiffFromMean(s25.diffFromMean)).toBe("＋369万円");

    const s60 = at("6861", 60);
    expect(formatManYen(s60.estimatedSalary)).toBe("2,213万円");
  });

  it("AC-4: 25〜60歳の8点がそろっている", () => {
    const v = view("6861");
    expect(v.byAge.map((s) => s.targetAge)).toEqual([25, 30, 35, 40, 45, 50, 55, 60]);
    expect(v.byAge.map((s) => formatManYen(s.estimatedSalary))).toEqual([
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

    const s = statsForAge(v, 35);
    expect(formatManYen(s.estimatedSalary)).toBe("755万円");
    expect(s.rankAll).toBe(280);
    expect(formatTopPercent(s.topPercent)).toBe("上位15.0%");
    expect(s.rankIndustry).toBe(17);
    expect(formatDeviation(s.deviation)).toBe("58.1");
  });

  it("AC-6: 三菱商事（8058）は「本社のみ」", () => {
    const v = view("8058");
    expect(v.name).toBe("三菱商事株式会社");
    expect(v.hasBadge).toBe(true);
    expect(statsForAge(v, 35).rankAll).toBe(3);
  });

  it("AC-7: 存在しないIDと旧形式の書類IDは null", () => {
    expect(buildCompanyView(companies, curves, stats, "s100yfah")).toBeNull();
    expect(buildCompanyView(companies, curves, stats, "存在しない")).toBeNull();
    expect(buildCompanyView(companies, curves, stats, "")).toBeNull();
  });

  it("全1,867社が組み立てられ、順位が1以上・社数以下に収まる", () => {
    for (const row of companies.rows) {
      const v = buildCompanyView(companies, curves, stats, row[0]);
      expect(v).not.toBeNull();
      for (const s of v!.byAge) {
        expect(s.rankAll).toBeGreaterThanOrEqual(1);
        expect(s.rankAll).toBeLessThanOrEqual(v!.totalCount);
        expect(s.rankIndustry).toBeGreaterThanOrEqual(1);
        expect(s.rankIndustry).toBeLessThanOrEqual(v!.industryCount);
      }
    }
  });

  it("statsForAge は8点に無い年齢で例外を投げる", () => {
    expect(() => statsForAge(view("6861"), 33 as TargetAge)).toThrow(/33/);
  });
});
