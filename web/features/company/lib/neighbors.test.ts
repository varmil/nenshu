import { describe, it, expect } from "vitest";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import type { CompaniesData, CurvesData } from "@/features/ranking/types";
import { findNeighbors, NEIGHBOR_COUNT } from "./neighbors";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;

const industryOf = (id: string) =>
  companies.industries[companies.rows.find((r) => r[0] === id)![2]];

describe("findNeighbors（AC-12）", () => {
  it("同じ業種の5社を返し、自分自身は含めない", () => {
    const neighbors = findNeighbors(companies, curves, "6861", null);
    expect(neighbors).toHaveLength(NEIGHBOR_COUNT);
    expect(neighbors.map((n) => n.id)).not.toContain("6861");
    for (const n of neighbors) expect(industryOf(n.id)).toBe("電気機器");
  });

  it("金額の降順で並ぶ（近さの順ではない）", () => {
    const neighbors = findNeighbors(companies, curves, "6861", null);
    for (let i = 1; i < neighbors.length; i++) {
      expect(neighbors[i].salary).toBeLessThanOrEqual(neighbors[i - 1].salary);
    }
  });

  /*
   * 近さで選んでいることの確認。キーエンスは電気機器の1位なので、選ばれるのは
   * その業種の上位5社になる。順位で切っているのではなく金額の距離で選んでいるが、
   * 1位の隣は結果的に2〜6位になる。
   */
  it("金額が近い順に選ばれる", () => {
    const target = companies.rows.find((r) => r[0] === "6861")![6];
    const neighbors = findNeighbors(companies, curves, "6861", null);
    const industryIdx = companies.rows.find((r) => r[0] === "6861")![2];
    const others = companies.rows
      .filter((r) => r[2] === industryIdx && r[0] !== "6861")
      .map((r) => Math.abs(r[6] - target))
      .sort((a, b) => a - b);
    const picked = neighbors.map((n) => Math.abs(n.salary - target)).sort((a, b) => a - b);
    expect(picked).toEqual(others.slice(0, NEIGHBOR_COUNT));
  });

  it("表示基準を変えると選ばれる5社が変わりうる", () => {
    const raw = findNeighbors(companies, curves, "6861", null).map((n) => n.id);
    const at35 = findNeighbors(companies, curves, "6861", 35).map((n) => n.id);
    expect(at35).not.toEqual(raw);
  });

  // 鉱業は2社しかない。無理に5社出さない。
  it("業種の社数が足りなければその数だけ返す", () => {
    const mining = companies.industries.indexOf("鉱業");
    const id = companies.rows.find((r) => r[2] === mining)![0];
    expect(findNeighbors(companies, curves, id, null)).toHaveLength(1);
  });

  it("存在しないIDなら空配列", () => {
    expect(findNeighbors(companies, curves, "存在しない", null)).toEqual([]);
  });
});
