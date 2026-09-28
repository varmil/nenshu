import { describe, expect, it } from "vitest";
import { companyBreadcrumb } from "./breadcrumb";
import { buildRankingLinks } from "./rankingLinks";

describe("buildRankingLinks（C20・AC-37）", () => {
  const view = { tse33: "電気機器", industryCount: 193, totalCount: 2961 };
  const links = buildRankingLinks(view, { rankIndustry: 6, rankAll: 84 });

  it("業種・全体の順に2本並べ、それぞれに母数つきの順位を添える", () => {
    expect(links.map((l) => [l.label, l.note])).toEqual([
      ["電気機器の平均年収ランキング", "この会社は193社中6位"],
      ["全業種の平均年収ランキング", "この会社は2,961社中84位"],
    ]);
  });

  it("行き先はパンくずの業種・ランキングと同じ文字列になる（ADR-0006）", () => {
    const crumbs = companyBreadcrumb({
      id: "6758",
      name: "ソニーグループ株式会社",
      tse33: "電気機器",
    });
    expect(links.map((l) => l.path)).toEqual([crumbs[1].path, crumbs[0].path]);
  });
});
