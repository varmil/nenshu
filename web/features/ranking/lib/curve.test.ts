import { describe, it, expect } from "vitest";
import { interpolate } from "./curve";

describe("interpolate", () => {
  const points = [22, 27, 32, 37, 42, 47, 52, 57, 62, 67];
  const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

  it("範囲外は下端の値で頭打ちになる", () => {
    expect(interpolate(points, values, 18)).toBe(100);
    expect(interpolate(points, values, 22)).toBe(100);
  });

  it("範囲外は上端の値で頭打ちになる", () => {
    expect(interpolate(points, values, 67)).toBe(1000);
    expect(interpolate(points, values, 70)).toBe(1000);
  });

  it("代表年齢のちょうど中間で線形補間する", () => {
    expect(interpolate(points, values, 29.5)).toBeCloseTo(250, 5);
  });

  it("代表年齢そのものでは対応する値を返す", () => {
    expect(interpolate(points, values, 42)).toBe(500);
  });
});
