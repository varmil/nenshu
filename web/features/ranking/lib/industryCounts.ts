import type { CompaniesData } from "../types";

/**
 * 業種ごとの社数（U13、アートボード 5a の業種チップ）。
 *
 * **ビルド時ではなくここで数える。** `companies.json` に持たせると 33 件ぶんの
 * 数値が全ページの初期HTMLに載る一方、ここで数えるのは 2,961 回のインクリメント
 * だけで、`buildRankedCompanies` が同じ配列に対してやっている仕事より軽い。
 *
 * 並びは `companies.industries` の順（＝データの順）のまま返す。社数の降順に
 * 並べ替えない——**チップの位置が固定されている**ほうが、何度も来る読者にとっては
 * 探しやすい。
 */
export function industryCounts(companies: CompaniesData): number[] {
  const counts = new Array<number>(companies.industries.length).fill(0);
  for (const row of companies.rows) {
    const index = row[2];
    if (index >= 0 && index < counts.length) counts[index] += 1;
  }
  return counts;
}
