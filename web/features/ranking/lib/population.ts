import type { PopulationStats, TargetAge } from "../types";

/**
 * `stats.json` から**母集団の平均と標準偏差だけ**を抜く（`PopulationStats` の注記）。
 *
 * 引数は `stats.json` をそのまま渡してよい。余分なフィールド（`rankAll` 等）は
 * ここで落ちるので、クライアントに渡るのは9組の数値だけになる。
 */
export function pickPopulationStats(stats: PopulationStats): PopulationStats {
  return {
    count: stats.count,
    bases: stats.bases,
    population: stats.population,
  };
}

/**
 * 表示基準に対応する母集団を引く。`null` は実測値（ADR-0007）。
 *
 * **母集団は表示基準ごとに別物である。** 実測値は平均719万円・標準偏差200万円、
 * 35歳そろえは629万円・155万円で、同じ金額でも偏差値が変わる（キーエンスは
 * どちらも2,178万円だが 122.9 と 150.0）。
 */
export function populationForBasis(
  stats: PopulationStats,
  targetAge: TargetAge | null
): { mean: number; sd: number } | null {
  const index = stats.bases.indexOf(targetAge);
  if (index === -1) return null;
  return stats.population[index] ?? null;
}
