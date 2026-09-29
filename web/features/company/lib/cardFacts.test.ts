import { describe, it, expect } from "vitest";
import type { TargetAge } from "@/features/ranking/types";
import { formatDecimal1, formatInt, formatManYen } from "@/features/ranking/lib/format";
import {
  companies,
  curves,
  industryOf,
  pickCompany,
  rowIndexOf,
  rowOf,
  stats,
} from "@/testing/realData";
import { buildCardFacts, buildCardLead, buildHeadingRank, type CardFact } from "./cardFacts";
import { statsForBasis } from "./stats";
import { buildCompanyView } from "./view";

function factsOf(id: string, age: TargetAge | null) {
  const view = buildCompanyView(companies, curves, stats, id);
  if (view === null) throw new Error(`${id} が見つからない`);
  return buildCardFacts(view, statsForBasis(view, age));
}

/** 画面で読める1行（`dd` の textContent と同じ形）。 */
const shown = (fact: CardFact) => (fact.total ? `${fact.value} ${fact.total}` : fact.value);

/** `stats.json` のその会社の順位（`age` の表示基準の列）。 */
function ranksOf(id: string, age: TargetAge | null) {
  const basis = stats.bases.indexOf(age);
  return {
    all: stats.rankAll[rowIndexOf(id)][basis],
    industry: stats.rankIndustry[rowIndexOf(id)][basis],
  };
}

/** 2段目の母数（業界内・全体の順）。社数は `companies.json` の行から数える。 */
function totalsOf(id: string) {
  const industry = companies.rows.filter((row) => row[2] === rowOf(id)[2]).length;
  return [`/${formatInt(industry)}社`, `/${formatInt(companies.rows.length)}社`];
}

/** `docs/company/spec.md` 1.4・AC-32（C14・#818）。 */
describe("buildCardFacts", () => {
  // 在籍年数は入れない（「年収に関するQ&A」の平均勤続年数とレーダーの定着の軸にある）。
  // 偏差値も入れない（右の位置バーの見出しの隣にある。#831）。
  // ラベルを並びごと固定しているので、足せばここで落ちる。
  it("1段目は平均年齢・従業員数、2段目は業界内順位・全体順位", () => {
    const { profile, standing } = factsOf("6861", null);
    expect(profile.map((f) => f.label)).toEqual(["平均年齢", "従業員数（単体）"]);
    expect(standing.map((f) => f.label)).toEqual(["業界内順位", "全体順位"]);
  });

  it("キーエンス（6861）の実測値", () => {
    const [, , , , avgAge, , , employees] = rowOf("6861");
    const rank = ranksOf("6861", null);
    const [industryTotal, allTotal] = totalsOf("6861");
    const { profile, standing } = factsOf("6861", null);
    expect(profile.map(shown)).toEqual([
      `${formatDecimal1(avgAge)}歳`,
      `${formatInt(employees)}人`,
    ]);
    expect(standing.map(shown)).toEqual([
      `${formatInt(rank.industry)}位 ${industryTotal}`,
      `${formatInt(rank.all)}位 ${allTotal}`,
    ]);
  });

  // 表示基準で変わるのは2段目だけ。1段目は有報の値そのもの。
  it("年齢そろえ（35歳）では2段目だけが変わる", () => {
    const raw = factsOf("6861", null);
    const aligned = factsOf("6861", 35);
    const rank = ranksOf("6861", 35);
    const [industryTotal, allTotal] = totalsOf("6861");
    expect(aligned.profile).toEqual(raw.profile);
    expect(aligned.standing.map(shown)).toEqual([
      `${formatInt(rank.industry)}位 ${industryTotal}`,
      `${formatInt(rank.all)}位 ${allTotal}`,
    ]);
  });

  // 母数は値より小さく添えるので、値と分けて持つ。
  it("順位だけが母数を持つ", () => {
    const { profile, standing } = factsOf("6861", null);
    expect(profile.every((f) => f.total === undefined)).toBe(true);
    expect(standing.map((f) => f.total)).toEqual(totalsOf("6861"));
  });
});

/** `docs/company/spec.md` 1.4・AC-32。金額の直下の1文。 */
describe("buildCardLead", () => {
  function leadOf(id: string) {
    const view = buildCompanyView(companies, curves, stats, id);
    if (view === null) throw new Error(`${id} が見つからない`);
    return buildCardLead(view);
  }

  it("有報の平均年収と平均年齢を1文で言い直す", () => {
    for (const id of ["7267", "6861"]) {
      const [, name, , , avgAge, , avgSalary] = rowOf(id);
      expect(leadOf(id)).toBe(
        `${name}の最新の有価証券報告書に基づく平均年収は 約${formatManYen(avgSalary)}（平均年齢${formatDecimal1(avgAge)}歳）です。`
      );
    }
  });

  // 年齢そろえのときも同じ文を出す。「推定」は見出しが持つ（Issue #128）。
  it("推定の語も全体平均との差も入れない", () => {
    const lead = leadOf("6861");
    expect(lead).not.toContain("推定");
    expect(lead).not.toContain("全体平均");
  });
});

/** `docs/company/spec.md` 1.4。h1 直下の1行。 */
describe("buildHeadingRank", () => {
  function headingOf(id: string, age: TargetAge | null) {
    const view = buildCompanyView(companies, curves, stats, id);
    if (view === null) throw new Error(`${id} が見つからない`);
    return buildHeadingRank(view, statsForBasis(view, age));
  }

  const expected = (id: string, age: TargetAge | null) =>
    `${industryOf(id)} ・業界${formatInt(ranksOf(id, age).industry)}位`;

  // 全体順位と母数は置かない。両方ともカードの2段目にある。
  it("業種と業界内順位だけを出す", () => {
    expect(headingOf("6861", null)).toBe(expected("6861", null));
    expect(headingOf("9432", null)).toBe(expected("9432", null));
  });

  it("業界内順位は表示基準で変わる", () => {
    const raw = stats.bases.indexOf(null);
    const at35 = stats.bases.indexOf(35);
    const id = pickCompany(
      "実測値と35歳そろえで業界内順位が違う会社",
      (_, i) => stats.rankIndustry[i][raw] !== stats.rankIndustry[i][at35]
    );
    expect(headingOf(id, 35)).toBe(expected(id, 35));
    expect(headingOf(id, 35)).not.toBe(headingOf(id, null));
  });
});
