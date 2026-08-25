import { describe, it, expect } from "vitest";
import { buildAboutFacts } from "./aboutFacts";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import type { CompaniesData, CurvesData } from "../types";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;
const facts = buildAboutFacts(companies, curves);

describe("buildAboutFacts", () => {
  it("掲載社数・バッジ社数・業種数・カーブ数が実データと一致する", () => {
    expect(facts.companyCount).toBe(2961);
    expect(facts.badgeCount).toBe(244);
    expect(facts.industryCount).toBe(33);
    expect(facts.curveCount).toBe(17);
  });

  it("代表年齢は22歳から67歳までの5歳刻み10点", () => {
    expect(facts.agePoints).toEqual([22, 27, 32, 37, 42, 47, 52, 57, 62, 67]);
  });

  it("持株会社の実例（みずほFG）には「本社のみ」バッジが付く", () => {
    const { holdingExample: e } = facts;
    expect(e.name).toBe("株式会社みずほフィナンシャルグループ");
    expect(e.avgSalary).toBe(11665000);
    expect(e.avgAge).toBe(42.5);
    expect(e.employees).toBe(2867);
    expect(e.hasBadge).toBe(true);
  });

  it("事業会社の実例（みずほ銀行）にはバッジが付かず、単体従業員数が桁違いに多い", () => {
    const { operatingExample: e } = facts;
    expect(e.name).toBe("株式会社みずほ銀行");
    expect(e.avgSalary).toBe(8701000);
    expect(e.avgAge).toBe(40.7);
    expect(e.employees).toBe(23356);
    expect(e.hasBadge).toBe(false);
  });

  it("持株会社のほうが平均年間給与は高いが、単体従業員数は事業会社より大幅に少ない", () => {
    // 「本社のみ」バッジが何を意味するかの実例として成立していること
    expect(facts.holdingExample.avgSalary).toBeGreaterThan(facts.operatingExample.avgSalary);
    expect(facts.holdingExample.employees).toBeLessThan(facts.operatingExample.employees);
  });

  it("実例の会社がデータから消えたら throw する（本文が静かに壊れるのを防ぐ）", () => {
    const without = {
      ...companies,
      rows: companies.rows.filter((r) => r[1] !== "株式会社みずほ銀行"),
    };
    expect(() => buildAboutFacts(without, curves)).toThrow("株式会社みずほ銀行");
  });
});

describe("buildAboutFacts の式の実例", () => {
  const e = facts.formulaExample;

  it("実例は事業会社側（みずほ銀行）で、目標年齢35歳", () => {
    expect(e.company.name).toBe("株式会社みずほ銀行");
    expect(e.targetAge).toBe(35);
    expect(e.curveKey).toBe("金融業・保険業");
  });

  it("2点モデルのアンカーは22歳で、カーブの起点の値を円で持つ", () => {
    expect(e.anchorAge).toBe(22);
    expect(e.curveAtAnchorAge).toBe(curves.curves["金融業・保険業"][0] * 1000);
  });

  it("本文に書いた式をそのまま計算すると推定年収に一致する", () => {
    const recomputed =
      e.curveAtAnchorAge +
      ((e.company.avgSalary - e.curveAtAnchorAge) * (e.curveAtTargetAge - e.curveAtAnchorAge)) /
        (e.curveAtAvgAge - e.curveAtAnchorAge);
    expect(e.estimatedSalary).toBe(Math.round(recomputed));
  });

  it("平均年齢40.7歳を35歳へ引き直すので平均年間給与より低く、推定は755万円", () => {
    expect(e.estimatedSalary).toBeLessThan(e.company.avgSalary);
    expect(Math.round(e.estimatedSalary / 10000)).toBe(755);
  });

  it("本文に小数第1位まで出した値で計算しても、表示している推定年収と同じ万円になる", () => {
    // 万円に丸めた値どうしで引き算すると1万円ずれる。桁を1つ増やせば合う（U7で踏んだ）。
    const man1 = (yen: number) => Number((yen / 10000).toFixed(1));
    const a = man1(e.curveAtAnchorAge);
    const byHand =
      a + ((man1(e.company.avgSalary) - a) * (man1(e.curveAtTargetAge) - a)) / (man1(e.curveAtAvgAge) - a);
    expect(Math.round(byHand)).toBe(Math.round(e.estimatedSalary / 10000));
  });

  it("rank.ts の estimateSalary と同じ値になる（表と食い違わせない）", async () => {
    const { estimateSalary } = await import("./salary");
    const { curveValuesInYen } = await import("./curve");
    const row = companies.rows.find((r) => r[1] === "株式会社みずほ銀行")!;
    const curveValues = curveValuesInYen(curves.curves[companies.curveKeys[row[3]]]);
    expect(e.estimatedSalary).toBe(
      estimateSalary(row[6], row[4], curveValues, curves.agePoints, 35)
    );
  });
});

describe("buildAboutFacts のモデルの偏り（限界の節で使う数値）", () => {
  const b = facts.modelBias;

  it("産業平均に対する倍率の分布が実データと一致する", () => {
    expect(b.premiumMedian).toBeCloseTo(1.19, 2);
    expect(b.premiumP90).toBeCloseTo(1.63, 2);
    expect(b.premiumMax).toBeCloseTo(5.47, 2);
    expect(b.premiumMaxCompanyName).toBe("Ｍ＆Ａキャピタルパートナーズ株式会社");
  });

  it("掲載企業の平均年齢の中央値は41.4歳", () => {
    expect(b.avgAgeMedian).toBe(41.4);
  });

  it("外挿距離は両端（25歳・60歳）で最大、平均年齢に最も近い40歳で最小になる", () => {
    const byAge = new Map(b.meanExtrapolationByAge.map((x) => [x.age, x.distance]));
    expect(byAge.get(25)).toBeCloseTo(16.0, 1);
    expect(byAge.get(40)).toBeCloseTo(3.3, 1);
    expect(byAge.get(60)).toBeCloseTo(19.0, 1);
    // 平均年齢の中央値41.4歳に最も近い40歳が最小になる（=最も外挿が短い）
    const min = Math.min(...b.meanExtrapolationByAge.map((x) => x.distance));
    expect(byAge.get(40)).toBe(min);
    // 両端が最大
    expect(byAge.get(60)).toBe(Math.max(...b.meanExtrapolationByAge.map((x) => x.distance)));
  });

  it("上位50社は最年少・最年長の目標年齢で36社が重なる", () => {
    expect(b.youngestTargetAge).toBe(25);
    expect(b.oldestTargetAge).toBe(60);
    expect(b.top50Overlap).toBe(36);
  });

  it("同業種内で目標年齢により順序が入れ替わるのは2.4%（旧式では0%だった）", () => {
    expect(b.sameIndustrySwapPercent).toBeCloseTo(2.4, 1);
  });

  it("倍率一定が残る60歳側の最大値を数値で持つ（Ｍ＆Ａキャピタルパートナーズ2,386万円）", () => {
    expect(b.oldestMaxCompanyName).toBe("Ｍ＆Ａキャピタルパートナーズ株式会社");
    expect(Math.round(b.oldestMaxEstimate / 10000)).toBe(2386);
  });
});

// ADR-0007 で表示基準が2つになった。計算方法ページはその差を数値で示すので、
// ここでハードコードでないこと（実データと一致すること）を固定する。
describe("表示基準の節に使う数値", () => {
  it("平均年齢の範囲を実データから出す", () => {
    const ages = companies.rows.map((row) => row[4]);
    expect(facts.coverage.minAvgAge).toBe(Math.min(...ages));
    expect(facts.coverage.maxAvgAge).toBe(Math.max(...ages));
    expect(facts.coverage.minAvgAge).toBeCloseTo(27.0, 1);
    expect(facts.coverage.maxAvgAge).toBeCloseTo(60.6, 1);
  });

  it("実測値の母集団平均は有報の平均年間給与の単純平均", () => {
    const values = companies.rows.map((row) => row[6]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(facts.population.rawMean).toBe(Math.round(mean));
    expect(Math.round(facts.population.rawMean / 10000)).toBe(693);
  });

  it("35歳そろえの母集団平均は実測値の平均と異なる", () => {
    expect(Math.round(facts.population.age35Mean / 10000)).toBe(616);
    expect(facts.population.age35Mean).not.toBe(facts.population.rawMean);
  });
});
