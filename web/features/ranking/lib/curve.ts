/**
 * 区分線形補間。範囲外は端の値で頭打ちにする。
 * salary35/curves.py の _interp / scripts/lib/curve.ts と同じ挙動にする。
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
