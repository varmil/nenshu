import { interpolate } from "./curve";

/**
 * 年齢補正した推定年収。式は `docs/adr/0005-two-point-anchor-estimation.md` のとおり。
 *
 *   C(a) = 業種の賃金カーブ(a)
 *   目標年齢 ≤ 平均年齢:
 *     推定年収 = C(22) + (平均年間給与 − C(22)) × (C(目標年齢) − C(22)) ÷ (C(平均年齢) − C(22))
 *   目標年齢 > 平均年齢:
 *     推定年収 = 平均年間給与 × C(目標年齢) ÷ C(平均年齢)
 *
 * 平均年齢より下では、その会社の賃金カーブが
 * 「22歳＝業種平均の22歳水準」と「平均年齢＝実測の平均年間給与」の2点を通ると置き、
 * その間を業種カーブの形で結ぶ。
 *
 * ADR-0003 の旧式（全年齢で `平均年間給与 × C(目標年齢) ÷ C(平均年齢)`）は、
 * 実質「産業平均に対する倍率は何歳でも同じ」と仮定していた。倍率は中央値1.22倍・
 * 最大4.32倍まで開くため、倍率の大きい会社ほど若年側が過大に出た（キーエンスの
 * 25歳が1,642万円）。現実には会社ごとの給与差は若いうちは小さく、年次を重ねて
 * 開いていく。Issue #42 参照。
 *
 * 平均年齢より上は旧式のままにしてある。「初任給は圧縮されている」に相当する
 * 根拠が高年齢側には無く、手を入れると根拠の無いパラメータを置くことになるため。
 * この非対称は残った限界として `/about` に書いている。
 *
 * **`curveValues` は `avgSalary` と同じ単位（円）で渡すこと。** 旧式はカーブの比しか
 * 取らなかったので千円のままでも答えが合ったが、2点モデルはカーブの値を給与と
 * 足し引きするため揃っていないと1,000倍ずれる。`curveValuesInYen` を使う。
 */
export function estimateSalary(
  avgSalary: number,
  avgAge: number,
  curveValues: number[],
  agePoints: number[],
  targetAge: number
): number {
  const curveAtTargetAge = interpolate(agePoints, curveValues, targetAge);
  const curveAtAvgAge = interpolate(agePoints, curveValues, avgAge);

  if (targetAge > avgAge) {
    return Math.round(avgSalary * (curveAtTargetAge / curveAtAvgAge));
  }

  // カーブの起点（22歳）を、その会社の22歳時点の水準の代わりに使う。
  const anchorSalary = curveValues[0];
  const span = curveAtAvgAge - anchorSalary;
  // 平均年齢が起点に近い会社や、平均給与が業種の22歳水準を下回る会社（実データで1社）
  // では2点を結べない。倍率一定の旧式に戻す。
  if (span <= 0 || avgSalary <= anchorSalary) {
    return Math.round(avgSalary * (curveAtTargetAge / curveAtAvgAge));
  }

  return Math.round(
    anchorSalary + ((avgSalary - anchorSalary) * (curveAtTargetAge - anchorSalary)) / span
  );
}
