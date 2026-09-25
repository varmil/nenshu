import { describe, it, expect } from "vitest";
import { interpolate } from "./curve";

/*
 * **代表年齢の範囲外で頭打ちになる境界はここが固定している**（pipeline 側の同じ検査は
 * これを前提に外した）。消すときはどこかに移すこと。
 */
describe("interpolate", () => {
  const points = [22, 27, 32, 37, 42, 47, 52, 57, 62, 67];
  const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

  it.each([
    // 範囲外は下端・上端の値で頭打ちになる
    [18, 100],
    [22, 100],
    [67, 1000],
    [70, 1000],
    // 代表年齢そのものでは対応する値を返す
    [42, 500],
  ])("%d歳では %d", (age, expected) => {
    expect(interpolate(points, values, age)).toBe(expected);
  });

  it("代表年齢のちょうど中間で線形補間する", () => {
    expect(interpolate(points, values, 29.5)).toBeCloseTo(250, 5);
  });
});
