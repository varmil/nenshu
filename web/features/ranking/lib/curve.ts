/**
 * 区分線形補間。範囲外は端の値で頭打ちにする。
 * pipeline/salary/curves.py の _interp / pipeline/scripts/lib/curve.ts と同じ挙動にする。
 */
export function interpolate(points: number[], values: number[], x: number): number {
  if (x <= points[0]) return values[0];
  const last = points.length - 1;
  if (x >= points[last]) return values[last];

  let i = 0;
  while (i < last - 1 && points[i + 1] <= x) i++;

  const x0 = points[i];
  const x1 = points[i + 1];
  const y0 = values[i];
  const y1 = values[i + 1];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

/**
 * カーブは `curves.json` に千円単位で入っている（賃金構造基本統計調査の表記のまま）。
 * 会社の平均年間給与は円なので、両者を足し引きする前にここで桁を揃える。
 *
 * 旧式（ADR-0003）はカーブの比しか取らなかったため単位が打ち消し合っていたが、
 * 2点モデル（ADR-0005）はカーブの値を給与そのものと足し引きするので、
 * 揃えないと1,000倍ずれる。
 */
export function curveValuesInYen(values: number[]): number[] {
  return values.map((v) => v * 1000);
}
