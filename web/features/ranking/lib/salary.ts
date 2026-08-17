import { interpolate } from "./curve";

/**
 * 推定年収(目標年齢) = 平均年間給与 × カーブ(目標年齢) ÷ カーブ(平均年齢)
 * docs/adr/0003-age-conversion-client-side.md の式のとおり。
 */
export function estimateSalary(
  avgSalary: number,
  avgAge: number,
  curveValues: number[],
  agePoints: number[],
  targetAge: number
): number {
  const factor =
    interpolate(agePoints, curveValues, targetAge) / interpolate(agePoints, curveValues, avgAge);
  return Math.round(avgSalary * factor);
}
