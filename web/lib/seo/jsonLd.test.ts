import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, jsonLdText, webSiteJsonLd } from "./jsonLd";

describe("WebSite（AC-15）", () => {
  it("サイト名と `/` のURLだけを持つ", () => {
    // **鍵を増やすときは、その値が画面に出ていることを確かめてから。**
    // 画面に無い主張を構造化データにしない（spec 4.4）。
    expect(webSiteJsonLd()).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "OpenReport",
      url: "https://openreport.net",
    });
  });

  it("サイトリンク検索ボックスを出さない", () => {
    // ヘッダに検索欄はあるが、Google はこの機能を終了している。
    expect(webSiteJsonLd()).not.toHaveProperty("potentialAction");
  });
});

describe("BreadcrumbList（AC-14）", () => {
  const jsonLd = breadcrumbJsonLd([
    { name: "ランキング", path: "/" },
    { name: "電気機器", path: "/?ind=%E9%9B%BB%E6%B0%97%E6%A9%9F%E5%99%A8" },
    { name: "株式会社キーエンス", path: "/company/6861" },
  ]);

  it("渡した順に 1 から番号を振り、絶対URLにする", () => {
    expect(jsonLd.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "ランキング",
        // `absoluteUrl` はルートだけ末尾のスラッシュを落とす（canonical と同じ表記）。
        item: "https://openreport.net",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "電気機器",
        item: "https://openreport.net/?ind=%E9%9B%BB%E6%B0%97%E6%A9%9F%E5%99%A8",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "株式会社キーエンス",
        item: "https://openreport.net/company/6861",
      },
    ]);
  });
});

describe("jsonLdText", () => {
  it("`<` を逃がす", () => {
    // 会社名に `</script>` が入ることは無いが、「入らないはず」で書いた文字列を
    // そのままHTMLへ落とす形は残さない。
    const text = jsonLdText(breadcrumbJsonLd([{ name: "a</script>b", path: "/" }]));
    expect(text).not.toContain("</script>");
    expect(JSON.parse(text).itemListElement[0].name).toBe("a</script>b");
  });
});
