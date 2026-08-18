import { describe, it, expect } from "vitest";
import { formatManYen, formatManYen1, formatDecimal1, formatInt } from "./format";

describe("formatManYen", () => {
  it("万円単位に丸めてカンマ区切りにする", () => {
    expect(formatManYen(21783259)).toBe("2,178万円");
  });

  it("四捨五入する", () => {
    expect(formatManYen(16417477)).toBe("1,642万円");
  });
});

describe("formatManYen1", () => {
  it("万円・小数第1位まで表示する", () => {
    expect(formatManYen1(8701000)).toBe("870.1万円");
    expect(formatManYen1(3418900)).toBe("341.9万円");
  });

  // 計算方法ページの式を読者が電卓で追えるようにするための桁。
  // 万円に丸めた値どうしで引き算すると答えが1万円ずれる（U7で踏んだ）。
  it("この桁なら、丸めた値で計算しても表示している推定年収と同じ万円になる", () => {
    const man1 = (yen: number) => Number(formatManYen1(yen).replace("万円", ""));
    const [anchor, target, avg, salary] = [3418900, 6606340, 7490978, 8701000];
    const byHand =
      man1(anchor) +
      ((man1(salary) - man1(anchor)) * (man1(target) - man1(anchor))) / (man1(avg) - man1(anchor));
    expect(formatManYen(Math.round(byHand * 10000))).toBe("755万円");
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
