import { describe, it, expect } from "vitest";
import { buildAboutFacts, type CompanyExample } from "./aboutFacts";
import { buildRankedCompanies } from "./rank";
import { curveValuesInYen, interpolate } from "./curve";
import { estimateSalary } from "./salary";
import { formatManYen1 } from "./format";
import { companies, curves, stats, rowOf } from "@/testing/realData";
import { deviationScore, formatDeviation } from "@/features/company/lib/stats";
import { TARGET_AGES } from "../types";
import type { CompanyRow, RankedCompany, TargetAge } from "../types";

const facts = buildAboutFacts(companies, curves);

/*
 * 本文の実例は `aboutFacts.ts` が ID で引く2社（みずほFG・みずほ銀行）。ID は一度振ったら
 * 変わらない（ADR-0017）ので、名指しは「居る」ことだけを前提にしている。
 */
const HOLDING_ID = "8411";
const OPERATING_ID = "E03532";

/** 行から、本文の実例が持つはずの値を組み立てる。 */
function exampleOf(row: CompanyRow): CompanyExample {
  return {
    name: row[1],
    avgSalary: row[6],
    avgAge: row[4],
    employees: row[7],
    hasBadge: row[8] === 1,
  };
}

function rowNamed(name: string): CompanyRow {
  const row = companies.rows.find((r) => r[1] === name);
  if (row === undefined) throw new Error(`${name} が companies.json に居ない`);
  return row;
}

/**
 * `q` が `values` の下から `p` の位置の値であること（`aboutFacts.ts` の分位点は
 * 並べた配列の `floor(n × p)` 番目）。**値を書き写さずに、分布のその位置にあることを見る。**
 */
function expectQuantile(values: number[], q: number, p: number) {
  expect(values).toContain(q);
  expect(values.filter((v) => v < q).length / values.length).toBeLessThanOrEqual(p);
  expect(values.filter((v) => v <= q).length / values.length).toBeGreaterThan(p);
}

describe("buildAboutFacts", () => {
  it("掲載社数・バッジ社数・業種数・カーブ数をデータから数える", () => {
    expect(facts.companyCount).toBe(companies.rows.length);
    expect(facts.badgeCount).toBe(companies.rows.filter((row) => row[8] === 1).length);
    expect(facts.industryCount).toBe(new Set(companies.rows.map((row) => row[2])).size);
    expect(facts.curveCount).toBe(Object.keys(curves.curves).length);
  });

  // 賃金構造基本統計調査の年齢階級の代表値で、pipeline の定数（`build-data.ts` の
  // `AGE_POINTS`）。有報の毎日の更新では動かない（`docs/refresh/spec.md` 1.18）。
  it("代表年齢は22歳から67歳までの5歳刻み10点", () => {
    expect(facts.agePoints).toEqual([22, 27, 32, 37, 42, 47, 52, 57, 62, 67]);
  });

  it("持株会社の実例（みずほFG）は行の値をそのまま持ち、単体従業員数が連結の10%未満の側に入る", () => {
    expect(facts.holdingExample).toEqual(exampleOf(rowOf(HOLDING_ID)));
    // 本文は「10%未満の会社が◯社あります」の直後にこの実例を並べている。外れたら
    // `aboutFacts.ts` の実例を選び直す。
    expect(facts.holdingExample.hasBadge).toBe(true);
  });

  it("事業会社の実例（みずほ銀行）は行の値をそのまま持ち、10%未満の側に入らない", () => {
    expect(facts.operatingExample).toEqual(exampleOf(rowOf(OPERATING_ID)));
    expect(facts.operatingExample.hasBadge).toBe(false);
  });

  it("持株会社のほうが平均年間給与は高いが、単体従業員数は事業会社より大幅に少ない", () => {
    // 単体の数字がグループ全体を代表しないことの実例として成立していること。本文は
    // 「持株会社の本体は平均年間給与が高く出る」と書いているので、崩れたら実例を選び直す。
    expect(facts.holdingExample.avgSalary).toBeGreaterThan(facts.operatingExample.avgSalary);
    expect(facts.holdingExample.employees).toBeLessThan(facts.operatingExample.employees);
  });

  it("実例の会社がデータから消えたら throw する（本文が静かに壊れるのを防ぐ）", () => {
    const without = {
      ...companies,
      rows: companies.rows.filter((r) => r[0] !== OPERATING_ID),
    };
    expect(() => buildAboutFacts(without, curves)).toThrow(OPERATING_ID);
  });
});

describe("buildAboutFacts の式の実例", () => {
  const e = facts.formulaExample;

  it("実例は事業会社側（みずほ銀行）で、目標年齢35歳、カーブはその会社の産業大分類", () => {
    expect(e.company).toEqual(facts.operatingExample);
    expect(e.targetAge).toBe(35);
    expect(e.curveKey).toBe(companies.curveKeys[rowOf(OPERATING_ID)[3]]);
  });

  it("2点モデルのアンカーは22歳で、カーブの起点の値を円で持つ", () => {
    expect(e.anchorAge).toBe(22);
    expect(e.curveAtAnchorAge).toBe(curves.curves[e.curveKey][0] * 1000);
  });

  it("本文に書いた式をそのまま計算すると推定年収に一致する", () => {
    const recomputed =
      e.curveAtAnchorAge +
      ((e.company.avgSalary - e.curveAtAnchorAge) * (e.curveAtTargetAge - e.curveAtAnchorAge)) /
        (e.curveAtAvgAge - e.curveAtAnchorAge);
    expect(e.estimatedSalary).toBe(Math.round(recomputed));
  });

  it("目標年齢のカーブが平均年齢のカーブより低ければ、推定は平均年間給与より低い（引き直す向き）", () => {
    expect(e.estimatedSalary < e.company.avgSalary).toBe(e.curveAtTargetAge < e.curveAtAvgAge);
  });

  it("本文に小数第1位まで出した値で計算しても、表示している推定年収と同じ万円になる", () => {
    // 万円に丸めた値どうしで引き算すると1万円ずれる。桁を1つ増やせば合う（U7で踏んだ）。
    // 本文が出している文字列（`formatManYen1`）から読み戻して電卓を叩く。
    const man1 = (yen: number) => Number(formatManYen1(yen).replace("万円", ""));
    const a = man1(e.curveAtAnchorAge);
    const byHand =
      a +
      ((man1(e.company.avgSalary) - a) * (man1(e.curveAtTargetAge) - a)) /
        (man1(e.curveAtAvgAge) - a);
    expect(Math.round(byHand)).toBe(Math.round(e.estimatedSalary / 10000));
  });

  it("rank.ts の estimateSalary と同じ値になる（表と食い違わせない）", () => {
    const row = rowOf(OPERATING_ID);
    const curveValues = curveValuesInYen(curves.curves[companies.curveKeys[row[3]]]);
    expect(e.estimatedSalary).toBe(
      estimateSalary(row[6], row[4], curveValues, curves.agePoints, 35)
    );
  });
});

describe("buildAboutFacts のモデルの偏り（限界の節で使う数値）", () => {
  const b = facts.modelBias;

  /** その会社の平均年間給与が、同じ産業・同じ年齢の平均の何倍か。 */
  const premiumOf = (row: CompanyRow) =>
    row[6] /
    interpolate(
      curves.agePoints,
      curveValuesInYen(curves.curves[companies.curveKeys[row[3]]]),
      row[4]
    );

  /** ランキング（rank.ts）の上位 n 社。1ページぶんしか返さないのでページを継ぎ足す。 */
  const topOf = (targetAge: TargetAge, n: number) => {
    const acc: RankedCompany[] = [];
    for (let page = 1; acc.length < n; page++) {
      const { companies: ranked } = buildRankedCompanies(companies, curves, {
        targetAge,
        industry: null,
        employeeSize: null,
        tenure: null,
        avgAgeBucket: null,
        query: "",
        sort: { key: "salary", order: "desc" },
        page,
      });
      acc.push(...ranked);
    }
    return acc.slice(0, n);
  };

  it("産業平均に対する倍率の中央値・上位10%・最大は、全社の倍率の分布のその位置にある", () => {
    const premiums = companies.rows.map(premiumOf);
    expectQuantile(premiums, b.premiumMedian, 0.5);
    expectQuantile(premiums, b.premiumP90, 0.9);
    expect(b.premiumMax).toBe(Math.max(...premiums));
    expect(premiumOf(rowNamed(b.premiumMaxCompanyName))).toBe(b.premiumMax);
  });

  it("掲載企業の平均年齢の中央値は、全社の平均年齢の分布の真ん中にある", () => {
    expectQuantile(
      companies.rows.map((row) => row[4]),
      b.avgAgeMedian,
      0.5
    );
  });

  it("外挿距離は平均年齢からの距離の平均で、両端（25歳・60歳）のどちらかで最大、40歳で最小になる", () => {
    const byAge = new Map(b.meanExtrapolationByAge.map((x) => [x.age, x.distance]));
    expect([...byAge.keys()]).toEqual(TARGET_AGES);
    for (const age of TARGET_AGES) {
      const mean =
        companies.rows.reduce((sum, row) => sum + Math.abs(age - row[4]), 0) /
        companies.rows.length;
      expect(byAge.get(age)).toBe(mean);
    }
    const distances = [...byAge.values()];
    // 距離の平均は目標年齢について下に凸なので、最大はどちらかの端に来る。
    expect(Math.max(byAge.get(25)!, byAge.get(60)!)).toBe(Math.max(...distances));
    // 本文（`AboutPage`）が「40歳が最も近く」と名指ししている。崩れたら本文を直す。
    expect(byAge.get(40)).toBe(Math.min(...distances));
  });

  it("上位50社の重なりは、ランキングの最年少・最年長の目標年齢の上位50社を突き合わせた社数", () => {
    expect(b.youngestTargetAge).toBe(TARGET_AGES[0]);
    expect(b.oldestTargetAge).toBe(TARGET_AGES[TARGET_AGES.length - 1]);
    const youngest = new Set(topOf(b.youngestTargetAge as TargetAge, 50).map((c) => c.id));
    const oldest = topOf(b.oldestTargetAge as TargetAge, 50);
    expect(b.top50Overlap).toBe(oldest.filter((c) => youngest.has(c.id)).length);
  });

  it("同業種内で目標年齢により順序が入れ替わる組がある（2点モデル。旧式では0%だった）", () => {
    expect(b.sameIndustrySwapPercent).toBeGreaterThan(0);
    expect(b.sameIndustrySwapPercent).toBeLessThan(100);
  });

  it("倍率一定が残る60歳側の最大値は、60歳そろえのランキングの1位の推定年収", () => {
    const [top] = topOf(b.oldestTargetAge as TargetAge, 1);
    expect(b.oldestMaxCompanyName).toBe(top.name);
    expect(b.oldestMaxEstimate).toBe(top.estimatedSalary);
  });
});

// ADR-0007 で表示基準が2つになった。計算方法ページはその差を数値で示すので、
// ここでハードコードでないこと（実データと一致すること）を固定する。
describe("表示基準の節に使う数値", () => {
  it("平均年齢の範囲を実データから出す", () => {
    const ages = companies.rows.map((row) => row[4]);
    expect(facts.coverage.minAvgAge).toBe(Math.min(...ages));
    expect(facts.coverage.maxAvgAge).toBe(Math.max(...ages));
  });

  it("実測値の母集団平均は有報の平均年間給与の単純平均で、ランキング（stats.json）と同じ", () => {
    const values = companies.rows.map((row) => row[6]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(facts.population.rawMean).toBe(Math.round(mean));
    expect(facts.population.rawMean).toBe(stats.population[stats.bases.indexOf(null)].mean);
  });

  /*
   * 偏差値が100を超えうることの実例。以前は本文に35歳そろえの偏差値を直書きしていて、
   * 母集団を広げた（E2）後も古い値のままだった。ランキングの1行目と
   * 同じ値になることを `stats.json`（ランキングが偏差値に使う平均・標準偏差）で確かめる。
   */
  it("実測値の1位の偏差値は、ランキングが stats.json から出す値と一致し、100を超える", () => {
    // 100を超えることは本文（`AboutPage`）の前提。「100を超えることがあります」の実例に
    // 1位を挙げているので、崩れたら本文を直す。
    const top = companies.rows.reduce((best, row) => (row[6] > best[6] ? row : best));
    const [raw] = stats.population;
    expect(facts.population.rawTop.name).toBe(top[1]);
    expect(formatDeviation(facts.population.rawTop.deviation)).toBe(
      formatDeviation(deviationScore(top[6], raw.mean, raw.sd))
    );
    expect(facts.population.rawTop.deviation).toBeGreaterThan(100);
  });

  it("35歳そろえの母集団平均はランキング（stats.json）の35歳の列と同じで、実測値の平均と異なる", () => {
    expect(facts.population.age35Mean).toBe(stats.population[stats.bases.indexOf(35)].mean);
    expect(facts.population.age35Mean).not.toBe(facts.population.rawMean);
  });
});
