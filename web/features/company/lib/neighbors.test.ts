import { describe, it, expect } from "vitest";
import { companies, curves, industryOf, pickCompany, rowOf } from "@/testing/realData";
import { findNeighbors, NEIGHBOR_COUNT } from "./neighbors";

/** その業種の社数（自分を含む）。 */
const industrySize = (industryIdx: number) =>
  companies.rows.filter((row) => row[2] === industryIdx).length;

/** 自分を除いても同業が `NEIGHBOR_COUNT` 社以上ある会社。近い会社がちょうどその数そろう。 */
const crowded = () =>
  pickCompany("自分を除いて同業が10社以上ある会社", (row) => industrySize(row[2]) > NEIGHBOR_COUNT);

describe("findNeighbors（AC-12）", () => {
  it("同じ業種の10社を返し、自分自身は含めない", () => {
    const id = crowded();
    const neighbors = findNeighbors(companies, curves, id, null);
    expect(neighbors).toHaveLength(NEIGHBOR_COUNT);
    expect(neighbors.map((n) => n.id)).not.toContain(id);
    for (const n of neighbors) expect(industryOf(n.id)).toBe(industryOf(id));
  });

  it("金額の降順で並ぶ（近さの順ではない）", () => {
    const neighbors = findNeighbors(companies, curves, crowded(), null);
    for (let i = 1; i < neighbors.length; i++) {
      expect(neighbors[i].salary).toBeLessThanOrEqual(neighbors[i - 1].salary);
    }
  });

  /*
   * 近さで選んでいることの確認。順位で切っているのではなく金額の距離で選んでいる
   * （業種の1位の会社なら、結果的に2〜11位になる）。
   */
  it("金額が近い順に選ばれる", () => {
    const id = crowded();
    const [, , industryIdx, , , , target] = rowOf(id);
    const neighbors = findNeighbors(companies, curves, id, null);
    const others = companies.rows
      .filter((r) => r[2] === industryIdx && r[0] !== id)
      .map((r) => Math.abs(r[6] - target))
      .sort((a, b) => a - b);
    const picked = neighbors.map((n) => Math.abs(n.salary - target)).sort((a, b) => a - b);
    expect(picked).toEqual(others.slice(0, NEIGHBOR_COUNT));
  });

  /*
   * どの会社で入れ替わるかは金額しだいなので、名指しせずデータから選ぶ。入れ替わる会社が
   * 1社も無くなれば `pickCompany` が落ちる。
   */
  it("表示基準を変えると選ばれる10社が変わりうる", () => {
    const ids = (id: string, age: 35 | null) =>
      findNeighbors(companies, curves, id, age).map((n) => n.id);
    const id = pickCompany(
      "実測値と35歳そろえで近い10社が入れ替わる会社",
      (row) => ids(row[0], null).join() !== ids(row[0], 35).join()
    );
    expect(ids(id, 35)).not.toEqual(ids(id, null));
  });

  /*
   * 10社に増やしたことで「足りない業種」が鉱業だけではなくなった（Issue #195）。
   * どの業種が足りないかは母集団で入れ替わるので、名指しせずデータから選び、社数も
   * `rows` から数えて比べる。
   */
  it("10社に満たない業種では自分を除いた全社を返す", () => {
    const id = pickCompany(
      "自分を除くと同業が10社に満たない会社",
      (row) => industrySize(row[2]) <= NEIGHBOR_COUNT
    );
    expect(findNeighbors(companies, curves, id, null)).toHaveLength(industrySize(rowOf(id)[2]) - 1);
  });

  it("存在しないIDなら空配列", () => {
    expect(findNeighbors(companies, curves, "存在しない", null)).toEqual([]);
  });
});
