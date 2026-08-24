import type { CompaniesData, CurvesData, TargetAge } from "@/features/ranking/types";
import { curveValuesInYen } from "@/features/ranking/lib/curve";
import { estimateSalary } from "@/features/ranking/lib/salary";

export interface NeighborCompany {
  id: string;
  name: string;
  salary: number;
  hasBadge: boolean;
  /** 同じ業種の中での順位（同額は同順位）。C3 でカードの各行に添える。 */
  industryRank: number;
  /** 有報の平均年齢。表示基準では変わらない実測値。 */
  avgAge: number;
}

/** 出す社数（`docs/company/spec.md` 1.12）。 */
export const NEIGHBOR_COUNT = 5;

/**
 * 同じ業種で、その表示基準の金額が近い会社（spec 1.12）。
 *
 * **リクエスト時に算出する。** ビルド時に持つと 1,867社 × 9基準 × 5社 の表になり、
 * `stats.json` が数倍になる。1業種は最大173社（情報・通信業）なので、当該1社ぶんの
 * 計算に足しても Workers Free の CPU 制約に収まる（`docs/company/company-page/design.md`）。
 *
 * **自分自身は含めない。** 表示基準を切り替えると金額の系列ごと変わるので、
 * 選ばれる5社も変わる。
 *
 * 同じ業種に5社に満たない会社しかなければ、その社数だけ返す（鉱業は2社）。
 */
export function findNeighbors(
  companies: CompaniesData,
  curves: CurvesData,
  id: string,
  targetAge: TargetAge | null,
  limit: number = NEIGHBOR_COUNT
): NeighborCompany[] {
  const self = companies.rows.find((row) => row[0] === id);
  if (self === undefined) return [];
  const industryIdx = self[2];

  const curvesInYen = new Map<string, number[]>();
  const salaryOf = (row: (typeof companies.rows)[number]) => {
    if (targetAge === null) return row[6];
    const key = companies.curveKeys[row[3]];
    let values = curvesInYen.get(key);
    if (values === undefined) {
      values = curveValuesInYen(curves.curves[key]);
      curvesInYen.set(key, values);
    }
    return estimateSalary(row[6], row[4], values, curves.agePoints, targetAge);
  };

  const selfSalary = salaryOf(self);

  /*
   * **業界内順位は同じ業種を一度並べて出す。** 自分を除いた5社にだけ順位を振ると、
   * 除いたぶん詰まって本来の順位とずれる（自分より上の会社が1つ繰り上がる）。
   * 1業種は最大173社なので、並べ直しても当該1社ぶんの計算に埋もれる。
   */
  const industry = companies.rows
    .filter((row) => row[2] === industryIdx)
    .map((row) => ({
      id: row[0],
      name: row[1],
      salary: salaryOf(row),
      hasBadge: row[8] === 1,
      avgAge: row[4],
    }))
    .sort((a, b) => b.salary - a.salary);

  let previousSalary = Number.NaN;
  let previousRank = 0;
  const ranked = industry.map((company, index) => {
    // 同額は同順位。次は飛ばす（1,2,2,4）——ランキングの `rank.ts` と同じ扱い。
    const industryRank = company.salary === previousSalary ? previousRank : index + 1;
    previousSalary = company.salary;
    previousRank = industryRank;
    return { ...company, industryRank };
  });

  return ranked
    .filter((company) => company.id !== id)
    .sort((a, b) => Math.abs(a.salary - selfSalary) - Math.abs(b.salary - selfSalary))
    .slice(0, limit)
    // 並べるときは金額の降順にする。近さで並べると上下に交互に跳ねて読みにくい。
    .sort((a, b) => b.salary - a.salary);
}
