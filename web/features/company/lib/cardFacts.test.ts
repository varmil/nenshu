import { describe, it, expect } from "vitest";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import statsData from "../../../public/data/stats.json";
import type { CompaniesData, CurvesData, TargetAge } from "@/features/ranking/types";
import type { CompanyStatsData } from "../types";
import { buildCardFacts, buildCardLead, type CardFact } from "./cardFacts";
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
  // 在籍年数は入れない（「年収に関するQ&A」の平均勤続年数とレーダーの定着の軸にある）。
  // 偏差値も入れない（右の位置バーの見出しの隣にある。#831）。
  // ラベルを並びごと固定しているので、足せばここで落ちる。
  it("1段目は平均年齢・従業員数、2段目は業界内順位・全体順位", () => {
    const { profile, standing } = factsOf("6861", null);
    expect(profile.map((f) => f.label)).toEqual(["平均年齢", "従業員数（単体）"]);
    expect(standing.map((f) => f.label)).toEqual(["業界内順位", "全体順位"]);
  });

  it("キーエンス（6861）の実測値", () => {
    const { profile, standing } = factsOf("6861", null);
    expect(profile.map(shown)).toEqual(["35.0歳", "3,306人"]);
    expect(standing.map(shown)).toEqual(["1位 /193社", "3位 /2,961社"]);
  });

  // 表示基準で変わるのは2段目だけ。1段目は有報の値そのもの。
  it("年齢そろえ（35歳）では2段目だけが変わる", () => {
    const raw = factsOf("6861", null);
    const aligned = factsOf("6861", 35);
    expect(aligned.profile).toEqual(raw.profile);
    expect(aligned.standing.map(shown)).toEqual(["1位 /193社", "2位 /2,961社"]);
  });

  // 母数は値より小さく添えるので、値と分けて持つ。
  it("順位だけが母数を持つ", () => {
    const { profile, standing } = factsOf("6861", null);
    expect(profile.every((f) => f.total === undefined)).toBe(true);
    expect(standing.map((f) => f.total)).toEqual(["/193社", "/2,961社"]);
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
    expect(leadOf("7267")).toBe(
      "本田技研工業株式会社の最新の有価証券報告書に基づく平均年収は 約933万円（平均年齢43.9歳）です。"
    );
    expect(leadOf("6861")).toBe(
      "株式会社キーエンスの最新の有価証券報告書に基づく平均年収は 約2,178万円（平均年齢35.0歳）です。"
    );
  });

  // 年齢そろえのときも同じ文を出す。「推定」は見出しが持つ（Issue #128）。
  it("推定の語も全体平均との差も入れない", () => {
    const lead = leadOf("6861");
    expect(lead).not.toContain("推定");
    expect(lead).not.toContain("全体平均");
  });
});
