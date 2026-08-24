import { describe, it, expect } from "vitest";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import type { CompaniesData, CurvesData } from "@/features/ranking/types";
import { estimateSalary } from "@/features/ranking/lib/salary";
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

/*
 * isolate ごとの索引に置き換えた（R0・`docs/runtime/spec.md` AC-7・Issue #165）。
 * `findNeighbors` は1リクエストで9回（表示基準のぶん）呼ばれるので、そのたびに
 * `companies.rows`（1,867行）を `find` と `filter` で走査すると、延べ 33,606行を
 * 数え直すことになる。
 *
 * **索引にして戻り値が1件でも変われば別の会社を「水準が近い会社」として出す。**
 * 素直に全表を走査する実装と突き合わせて固定する。
 */
describe("索引に置き換えても結果が変わらない", () => {
  const naive = (id: string, targetAge: 25 | 35 | 60 | null) => {
    const self = companies.rows.find((row) => row[0] === id)!;
    const salaryOf = (row: (typeof companies.rows)[number]) => {
      if (targetAge === null) return row[6];
      const key = companies.curveKeys[row[3]];
      const values = curves.curves[key].map((v) => v * 1000);
      const points = curves.agePoints;
      // 円に直したカーブで、view と同じ推定式を使う
      return estimateSalary(row[6], row[4], values, points, targetAge);
    };
    const selfSalary = salaryOf(self);
    const industry = companies.rows
      .filter((row) => row[2] === self[2])
      .map((row) => ({ id: row[0], salary: salaryOf(row) }))
      .sort((a, b) => b.salary - a.salary);
    let previousSalary = Number.NaN;
    let previousRank = 0;
    const ranked = industry.map((company, index) => {
      const industryRank = company.salary === previousSalary ? previousRank : index + 1;
      previousSalary = company.salary;
      previousRank = industryRank;
      return { ...company, industryRank };
    });
    return ranked
      .filter((company) => company.id !== id)
      .sort((a, b) => Math.abs(a.salary - selfSalary) - Math.abs(b.salary - selfSalary))
      .slice(0, NEIGHBOR_COUNT)
      .sort((a, b) => b.salary - a.salary)
      .map((c) => [c.id, c.salary, c.industryRank]);
  };

  // 業種の大きさが端（情報・通信業173社／鉱業2社）の会社と、EDINETコードの会社
  const ids = ["6861", "9432", "4686", "1662", "1515", "E11701"];
  for (const id of ids) {
    for (const age of [null, 25, 35, 60] as const) {
      it(`${id} / ${age ?? "実測値"} で同じ5社・同じ金額・同じ業界内順位を返す`, () => {
        const got = findNeighbors(companies, curves, id, age).map((n) => [
          n.id,
          n.salary,
          n.industryRank,
        ]);
        expect(got).toEqual(naive(id, age));
      });
    }
  }

  it("同じ引数で2回呼んでも同じ結果（索引を持ち回しても汚れない）", () => {
    const first = findNeighbors(companies, curves, "6861", 35);
    const second = findNeighbors(companies, curves, "6861", 35);
    expect(second).toEqual(first);
  });
});
