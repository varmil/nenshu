import { describe, it, expect } from "vitest";
import { formatManYen, formatDecimal1, formatInt } from "./format";

describe("formatManYen", () => {
  it("万円単位に丸めてカンマ区切りにする", () => {
    expect(formatManYen(21783259)).toBe("2,178万円");
  });

  it("四捨五入する", () => {
    expect(formatManYen(16417477)).toBe("1,642万円");
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
