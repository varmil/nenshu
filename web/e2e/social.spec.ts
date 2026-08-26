import { test, expect, type APIRequestContext } from "@playwright/test";
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

test.describe("OGP（AC-10〜AC-12）", () => {
  for (const path of PAGES) {
    test(`${path} に og: 一式が出る`, async ({ request }) => {
      const head = await headOf(request, path);

      expect(head.og("site_name")).toBe("OpenReport");
      expect(head.og("type")).toBe("website");
      expect(head.og("locale")).toBe("ja_JP");
      expect(head.og("image")).toBe(`${ORIGIN}${OG_IMAGE.path}`);
      expect(head.twitterCard).toBe("summary_large_image");

      // AC-12: そのページの title・description と同じ文字列。
      expect(head.og("title")).toBe(head.title);
      expect(head.og("description")).toBe(head.description);
      // AC-11: canonical と同じ文字列。
      expect(head.og("url")).toBe(head.canonical);
    });
  }

  /**
   * AC-11 の肝。**非正規URLで両方が寄せ先を指す**こと——別々に組み立てていると、
   * canonical だけが `/?ind=銀行業` を指して `og:url` が自分自身を指す。
   */
  test("非正規URLでも og:url と canonical が同じ寄せ先を指す", async ({ request }) => {
    const facet = await headOf(request, `/?age=35&ind=${BANK}`);
    expect(facet.canonical).toBe(`${ORIGIN}/?ind=${BANK}`);
    expect(facet.og("url")).toBe(facet.canonical);

    const filtered = await headOf(request, "/?emp=1000-");
    expect(filtered.canonical).toBe(ORIGIN);
    expect(filtered.og("url")).toBe(filtered.canonical);

    const company = await headOf(request, "/company/6861?age=35");
    expect(company.canonical).toBe(`${ORIGIN}/company/6861`);
    expect(company.og("url")).toBe(company.canonical);
  });
});

test.describe("OG画像（AC-13）", () => {
  test("絶対URLで、200 で返り、1200×630 である", async ({ request }) => {
    const head = await headOf(request, "/");
    const url = head.og("image");
    expect(url).toBe(`${ORIGIN}${OG_IMAGE.path}`);
    // 寸法は `og:image:width` / `og:image:height` としても出す（カードの枠を先に決められる）。
    expect(head.og("image:width")).toBe(String(OG_IMAGE.width));
    expect(head.og("image:height")).toBe(String(OG_IMAGE.height));

    // 実体はこのサーバーが配る。オリジンは本番のものなのでパスで取りに行く。
    const response = await request.get(OG_IMAGE.path);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");

    // PNG の IHDR から寸法を読む（`lib/brand/assets.test.ts` と同じ読み方）。
    const png = await response.body();
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
      OG_IMAGE.width,
      OG_IMAGE.height,
    ]);
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
    const { jsonLd } = await headOf(request, "/company/6861");
    const keys = new Set(jsonLd.flatMap((data) => Object.keys(data)));
    // 金額・偏差値・順位は画面にあるが、パンくずの階層とは別の話。
    // **「機械にだけ渡す」入口を作らない**ために、鍵の集合そのものを固定する。
    expect([...keys].sort()).toEqual(["@context", "@type", "itemListElement"]);
  });

  test("Organization を出さない（spec 4.4）", async ({ request }) => {
    // 企業ページが表すのは当該企業だが、その主体を名乗るのは我々ではない。
    const { html } = await headOf(request, "/company/6861");
    expect(html).not.toContain('"Organization"');
  });
});
