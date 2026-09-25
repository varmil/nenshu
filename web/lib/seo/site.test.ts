import { describe, expect, it } from "vitest";
import { absoluteUrl } from "./site";

describe("absoluteUrl", () => {
  it("ルートは canonical と同じ形（末尾スラッシュ無し）で返す", () => {
    expect(absoluteUrl("/")).toBe("https://openreport.net");
  });

  it("ルート以外は URL の正規形のまま（クエリ付きのルートはスラッシュが残り、非ASCIIはパーセントエンコード）", () => {
    // canonical 側と一致する形。sitemap の `<loc>` もこの関数を通る。
    expect(absoluteUrl("/?age=35")).toBe("https://openreport.net/?age=35");
    expect(absoluteUrl("/?ind=銀行業")).toBe(
      "https://openreport.net/?ind=%E9%8A%80%E8%A1%8C%E6%A5%AD"
    );
    expect(absoluteUrl("/company/6861")).toBe("https://openreport.net/company/6861");
  });
});
