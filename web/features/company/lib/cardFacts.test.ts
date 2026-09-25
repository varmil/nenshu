import { describe, it, expect } from "vitest";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import statsData from "../../../public/data/stats.json";
import type { CompaniesData, CurvesData, TargetAge } from "@/features/ranking/types";
import type { CompanyStatsData } from "../types";
import { buildCardFacts, type CardFact } from "./cardFacts";
import { statsForBasis } from "./stats";
import { buildCompanyView } from "./view";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;
const stats = statsData as CompanyStatsData;

function factsOf(id: string, age: TargetAge | null) {
  const view = buildCompanyView(companies, curves, stats, id);
  if (view === null) throw new Error(`${id} が見つからない`);
  return buildCardFacts(view, statsForBasis(view, age));
}

/** 画面で読める1行（`dd` の textContent と同じ形）。 */
const shown = (fact: CardFact) => (fact.total ? `${fact.value} ${fact.total}` : fact.value);

/** `docs/company/spec.md` 1.4・AC-32（C14・#818）。 */
describe("buildCardFacts", () => {
  it("1段目は平均年齢・従業員数、2段目は全体順位・業界内順位・年収偏差値", () => {
    const { profile, standing } = factsOf("6861", null);
    expect(profile.map((f) => f.label)).toEqual(["平均年齢", "従業員数（単体）"]);
    expect(standing.map((f) => f.label)).toEqual(["全体順位", "業界内順位", "年収偏差値"]);
  });

  // 在籍年数は「有価証券報告書の実測値」の節とレーダーの定着の軸にある。
  it("在籍年数を入れない", () => {
    const { profile, standing } = factsOf("6861", null);
    const labels = [...profile, ...standing].map((f) => f.label);
    expect(labels.some((label) => label.includes("在籍"))).toBe(false);
  });

  it("キーエンス（6861）の実測値", () => {
    const { profile, standing } = factsOf("6861", null);
    expect(profile.map(shown)).toEqual(["35.0歳", "3,306人"]);
    expect(standing.map(shown)).toEqual(["3位 /2,961社", "1位 /193社", "124.8"]);
  });

  // 表示基準で変わるのは2段目だけ。1段目は有報の値そのもの。
  it("年齢そろえ（35歳）では2段目だけが変わる", () => {
    const raw = factsOf("6861", null);
    const aligned = factsOf("6861", 35);
    expect(aligned.profile).toEqual(raw.profile);
    expect(aligned.standing.map(shown)).toEqual(["2位 /2,961社", "1位 /193社", "149.5"]);
  });

  // 母数は値より小さく添えるので、値と分けて持つ。偏差値には母数が無い。
  it("順位だけが母数を持つ", () => {
    const { profile, standing } = factsOf("6861", null);
    expect(profile.every((f) => f.total === undefined)).toBe(true);
    expect(standing.map((f) => f.total)).toEqual(["/2,961社", "/193社", undefined]);
  });
});
