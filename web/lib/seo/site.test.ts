import { describe, expect, it } from "vitest";
import { absoluteUrl, SITE_ORIGIN } from "./site";

describe("absoluteUrl", () => {
  it("ルートは canonical と同じ形（末尾スラッシュ無し）で返す", () => {
    expect(absoluteUrl("/")).toBe("https://openreport.net");
    expect(SITE_ORIGIN).toBe("https://openreport.net");
  });

  it("クエリ付きのルートはスラッシュが残る（canonical 側と一致する形）", () => {
    expect(absoluteUrl("/?age=35")).toBe("https://openreport.net/?age=35");
  });

  it("非ASCIIはパーセントエンコードする", () => {
    expect(absoluteUrl("/?ind=銀行業")).toBe(
      "https://openreport.net/?ind=%E9%8A%80%E8%A1%8C%E6%A5%AD"
    );
  });

  it("通常のパスはそのまま", () => {
    expect(absoluteUrl("/about")).toBe("https://openreport.net/about");
    expect(absoluteUrl("/company/6861")).toBe("https://openreport.net/company/6861");
  });
});
