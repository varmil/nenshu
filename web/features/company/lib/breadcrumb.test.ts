import { describe, expect, it } from "vitest";
import { companyBreadcrumb } from "./breadcrumb";

describe("companyBreadcrumb（AC-14）", () => {
  const items = companyBreadcrumb({
    id: "6861",
    name: "株式会社キーエンス",
    tse33: "電気機器",
  });

  it("ランキング / 業種 / 会社名 の3段", () => {
    expect(items.map((item) => item.name)).toEqual([
      "ランキング",
      "電気機器",
      "株式会社キーエンス",
    ]);
  });

  it("業種は `industryPath` を通してエンコードされる", () => {
    // 画面のリンクと sitemap と canonical が同じ文字列になる（U8）。
    // 生の日本語のまま `href` に置くと、ブラウザは開けるが文字列としては別物になる。
    expect(items[1].path).toBe("/?ind=%E9%9B%BB%E6%B0%97%E6%A9%9F%E5%99%A8");
  });

  it("先頭は `/`、末尾は自分自身", () => {
    expect(items[0].path).toBe("/");
    expect(items[2].path).toBe("/company/6861");
  });
});
