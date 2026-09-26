import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./appTest";
import { OG_IMAGE } from "../lib/brand/assets";

/**
 * S2（Issue #116）。**SNS のクローラと検索エンジンが読むのは、JS を実行する前の
 * HTML だけ**なので、ここは全部 `request` で生のレスポンスを取って見る。
 *
 * 操作したあとの DOM は `e2e/metadata.spec.ts` が見ている（`og:url` が canonical と
 * 同じままであることも含めて）。**単体テストでは足りない**——`PageMeta` が
 * 実際に `<meta property="og:...">` として出るか、`absoluteUrl()` が効いて絶対URLに
 * なるかは、`src/components/PageHead.astro` を通らないと分からない。
 */

const ORIGIN = "https://openreport.net";
const BANK = "%E9%8A%80%E8%A1%8C%E6%A5%AD";

/** インデックスさせる5種類。ファセットも含めて全部見る（AC-10）。 */
const PAGES = ["/", "/?age=35", `/?ind=${BANK}`, "/about", "/company/6861"];

/**
 * 非正規URL（AC-11 の肝）。**両方が寄せ先を指す**こと——別々に組み立てていると、
 * canonical だけが `/?ind=銀行業` を指して `og:url` が自分自身を指す。寄せ先そのものが
 * 正しいかは `seo.spec.ts` が見る。
 */
const NON_CANONICAL = [`/?age=35&ind=${BANK}`, "/?emp=1000-", "/company/6861?age=35"];

function unescapeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function headOf(request: APIRequestContext, path: string) {
  const response = await request.get(path);
  expect(response.status()).toBe(200);
  const html = await response.text();
  const pick = (pattern: RegExp) => {
    const match = html.match(pattern);
    return match === null ? null : unescapeHtml(match[1]);
  };
  return {
    html,
    title: pick(/<title>([^<]*)<\/title>/),
    description: pick(/<meta name="description" content="([^"]*)"/),
    canonical: pick(/<link rel="canonical" href="([^"]*)"/),
    og: (property: string) =>
      pick(new RegExp(`<meta property="og:${property}" content="([^"]*)"`)),
    twitterCard: pick(/<meta name="twitter:card" content="([^"]*)"/),
    jsonLd: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
      (match) => JSON.parse(match[1])
    ),
  };
}

test.describe("OGP（AC-10〜AC-13）", () => {
  /*
    OG画像（AC-13）のうち、実体が 200 で返ることは `branding.spec.ts` の「参照先が全部
    200 で返る」が、1200×630 で焼けていることは `lib/brand/assets.test.ts` が見る。
    ここで見るのは、絶対URLと寸法が HTML に出ていること。
  */
  test("どのページにも og: 一式が出て、og:url は非正規URLでも canonical と同じ", async ({
    request,
  }) => {
    for (const path of [...PAGES, ...NON_CANONICAL]) {
      const head = await headOf(request, path);

      expect(head.og("site_name"), path).toBe("OpenReport");
      expect(head.og("type"), path).toBe("website");
      expect(head.og("locale"), path).toBe("ja_JP");
      expect(head.og("image"), path).toBe(`${ORIGIN}${OG_IMAGE.path}`);
      // 寸法は `og:image:width` / `og:image:height` としても出す（カードの枠を先に決められる）。
      expect(head.og("image:width"), path).toBe(String(OG_IMAGE.width));
      expect(head.og("image:height"), path).toBe(String(OG_IMAGE.height));
      expect(head.twitterCard, path).toBe("summary_large_image");

      // AC-12: そのページの title・description と同じ文字列（両方が無くても一致して
      // しまうので、有ることも見る）。
      expect(head.title, path).toBeTruthy();
      expect(head.description, path).toBeTruthy();
      expect(head.og("title"), path).toBe(head.title);
      expect(head.og("description"), path).toBe(head.description);
      // AC-11: canonical と同じ文字列。
      expect(head.canonical, path).not.toBeNull();
      expect(head.og("url"), path).toBe(head.canonical);
    }
  });
});

test.describe("構造化データ（AC-14・AC-15）", () => {
  test("`/`・`/about` に WebSite が1件だけ出る", async ({ request }) => {
    for (const path of ["/", "/about"]) {
      const { jsonLd } = await headOf(request, path);
      expect(jsonLd).toEqual([
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "OpenReport",
          url: ORIGIN,
        },
      ]);
    }
  });

  test("`/company/[id]` の BreadcrumbList が画面のパンくずと一致する", async ({
    request,
    page,
  }) => {
    const { jsonLd } = await headOf(request, "/company/6861");
    expect(jsonLd).toHaveLength(1);
    const breadcrumb = jsonLd[0];
    expect(breadcrumb["@type"]).toBe("BreadcrumbList");

    /*
      **画面のパンくずと突き合わせる**（AC-14）。文言とURLをここに書き写すと、
      パンくずを直すたびにテストも直すことになり、そのとき何も守らない。
    */
    await page.goto("/company/6861");
    // 現在地の印を持つ `nav` がパンくず。共通ヘッダにも `nav` があるので、
    // 並び順（`.first()`）では取らない。
    const nav = page.locator('nav:has([aria-current="page"])');
    const names: string[] = await nav.evaluate((element) =>
      [...element.children]
        .filter((child) => child.getAttribute("aria-hidden") !== "true")
        .map((child) => child.textContent ?? "")
    );
    // `href` 属性のまま取る。`HTMLAnchorElement.href` は実行中のオリジン
    // （E2E では localhost）で解決されてしまい、本番オリジンと比べられない。
    const hrefs = await nav
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    const paths = breadcrumb.itemListElement.map((item: { item: string }) => {
      const url = new URL(item.item);
      return `${url.pathname}${url.search}`;
    });

    expect(breadcrumb.itemListElement.map((item: { name: string }) => item.name)).toEqual(names);
    // 末尾は現在地でリンクにしていないので、リンクの数は1つ少ない。
    expect(paths.slice(0, -1)).toEqual(hrefs);
    expect(paths.at(-1)).toBe("/company/6861");
    expect(breadcrumb.itemListElement.at(-1).item).toBe(`${ORIGIN}/company/6861`);
    expect(
      breadcrumb.itemListElement.map((item: { position: number }) => item.position)
    ).toEqual([1, 2, 3]);
  });

  test("画面に出ていない値を入れない（AC-15）", async ({ request }) => {
    const { html, jsonLd } = await headOf(request, "/company/6861");
    const keys = new Set(jsonLd.flatMap((data) => Object.keys(data)));
    // 金額・偏差値・順位は画面にあるが、パンくずの階層とは別の話。
    // **「機械にだけ渡す」入口を作らない**ために、鍵の集合そのものを固定する。
    expect([...keys].sort()).toEqual(["@context", "@type", "itemListElement"]);
    // Organization も出さない（spec 4.4）。企業ページが表すのは当該企業だが、
    // その主体を名乗るのは我々ではない。
    expect(html).not.toContain('"Organization"');
    // FAQPage も出さない（spec 4.4・C16）。画面には「年収に関するQ&A」があるが、Google は
    // 2026-05-07 に FAQ のリッチリザルトを終了した（`potentialAction` と同じ扱い）。
    expect(html).not.toContain('"FAQPage"');
  });
});
