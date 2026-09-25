import { describe, it, expect } from "vitest";
import { formatManYen, formatManYen1, formatDecimal1, formatInt } from "./format";

// 万円・小数第1位の桁で式を追うと表の推定年収と同じ万円になること（U7 で踏んだ）は、
// 実データの実例で `aboutFacts.test.ts` が固定している。
describe("formatManYen", () => {
  it.each([
    [21783259, "2,178万円"],
    // 四捨五入する
    [16417477, "1,642万円"],
  ])("%d 円は %s", (yen, expected) => {
    expect(formatManYen(yen)).toBe(expected);
  });
});

describe("formatManYen1", () => {
  it("万円・小数第1位まで表示する", () => {
    expect(formatManYen1(8701000)).toBe("870.1万円");
    expect(formatManYen1(3418900)).toBe("341.9万円");
  });
});

describe("formatDecimal1", () => {
  it("小数第1位まで表示する", () => {
    expect(formatDecimal1(35)).toBe("35.0");
    expect(formatDecimal1(11.3)).toBe("11.3");
  });
});

describe("formatInt", () => {
  it("整数をカンマ区切りにする", () => {
    expect(formatInt(3306)).toBe("3,306");
  });
});
