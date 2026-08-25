import { test, expect } from "@playwright/test";

/**
 * U8（Issue #53）。ADR-0006 のインデックス戦略が、実際に返るHTMLと
 * `/sitemap.xml`・`/robots.txt` の中身として出ていることを固定する。
 *
 * **単体テスト（`lib/seo/ranking.test.ts`）では足りない。** あちらが固定するのは
 * 「どのURLへ寄せるか」という判断であって、それが `<link rel="canonical">` として
 * 実際に初期HTMLに入るか、`metadataBase` が効いて絶対URLになるかは、
 * Next.js のメタデータ解決を通らないと分からない。
 */

const ORIGIN = "https://openreport.net";
const BANK = "%E9%8A%80%E8%A1%8C%E6%A5%AD";

async function canonicalOf(request: import("@playwright/test").APIRequestContext, path: string) {
  const response = await request.get(path);
  expect(response.status()).toBe(200);
  const html = await response.text();
  const match = html.match(/<link rel="canonical" href="([^"]*)"/);
  // 属性値なので `&` は `&amp;` としてHTMLに出る。実URLに戻してから比べる。
  return match?.[1].replaceAll("&amp;", "&") ?? null;
}

test.describe("検索エンジン向け導線（U8）", () => {
  test("インデックスさせる41件は自己canonical", async ({ request }) => {
    expect(await canonicalOf(request, "/")).toBe(ORIGIN);
    expect(await canonicalOf(request, "/?age=35")).toBe(`${ORIGIN}/?age=35`);
    expect(await canonicalOf(request, `/?ind=${BANK}`)).toBe(`${ORIGIN}/?ind=${BANK}`);
    expect(await canonicalOf(request, "/about")).toBe(`${ORIGIN}/about`);
  });

  test("`?age=N&ind=X` は業種側へ寄る", async ({ request }) => {
    expect(await canonicalOf(request, `/?age=35&ind=${BANK}`)).toBe(`${ORIGIN}/?ind=${BANK}`);
  });

  test("インデックスさせない絞り込みは `/` へ寄る", async ({ request }) => {
    expect(await canonicalOf(request, "/?emp=1000-")).toBe(ORIGIN);
    expect(await canonicalOf(request, "/?q=%E9%8A%80%E8%A1%8C&page=2")).toBe(ORIGIN);
    expect(await canonicalOf(request, `/?age=35&ind=${BANK}&emp=1000-`)).toBe(ORIGIN);
  });

  test("企業ページは表示基準に関わらず素のURLへ寄る", async ({ request }) => {
    expect(await canonicalOf(request, "/company/6861")).toBe(`${ORIGIN}/company/6861`);
    expect(await canonicalOf(request, "/company/6861?age=35")).toBe(`${ORIGIN}/company/6861`);
  });

  test("sitemap.xml に 1,910 URL が載り、canonical と同じ文字列になっている", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    const xml = await response.text();

    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toHaveLength(1910);
    // 重複が無いこと。canonical と sitemap が食い違うと sitemap 全体の信頼が下がる。
    expect(new Set(locs).size).toBe(locs.length);

    expect(locs).toContain(ORIGIN);
    expect(locs).toContain(`${ORIGIN}/about`);
    expect(locs).toContain(`${ORIGIN}/?age=25`);
    expect(locs).toContain(`${ORIGIN}/?age=60`);
    expect(locs).toContain(`${ORIGIN}/?ind=${BANK}`);
    expect(locs).toContain(`${ORIGIN}/company/6861`);

    // 寄せる側のURLは1つも載せない。
    expect(locs.some((loc) => loc.includes("emp="))).toBe(false);
    expect(locs.some((loc) => loc.includes("page="))).toBe(false);
    expect(locs.some((loc) => loc.includes("age=") && loc.includes("ind="))).toBe(false);
    expect(locs.some((loc) => loc.includes("/company/") && loc.includes("age="))).toBe(false);
  });

  test("robots.txt はクロールを止めず、sitemap の在り処だけ示す", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const text = await response.text();

    expect(text).toContain("User-Agent: *");
    expect(text).toContain("Allow: /");
    expect(text).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    // 絞り込みURLを Disallow にすると canonical が読まれなくなる（ADR-0006）。
    expect(text).not.toContain("Disallow");
  });

  test("`?age=N` の title は年齢そろえ、`?ind=X` は業種名を含む", async ({ page }) => {
    await page.goto("/?age=35");
    await expect(page).toHaveTitle("35歳年収ランキング | OpenReport");

    await page.goto(`/?ind=${BANK}`);
    await expect(page).toHaveTitle("銀行業の平均年収ランキング | OpenReport");
  });

  test("`/` の title はブランド先頭のまま、有価証券報告書・社数・決算期を含む", async ({
    page,
  }) => {
    // 決算期は末尾（S3・`docs/site-chrome/spec.md` 5.）。前に置くと、差別化要因の
    // 「有価証券報告書」がSERPで見える位置から押し出される。
    await page.goto("/");
    await expect(page).toHaveTitle(
      "OpenReport | 有価証券報告書ベースの平均年収ランキング 1,867社【2026年3月期〜4月期】"
    );
  });

  test("ページ2以降は自己canonical。先頭へ寄せない", async ({ request }) => {
    // `/?page=2` は `/` の複製ではなく別の30社が並ぶ。ここを `/` へ寄せると、
    // 1,837社への内部リンク経路（ページ2〜63の中にしか無い）を細める。
    expect(await canonicalOf(request, "/?page=2")).toBe(`${ORIGIN}/?page=2`);
    expect(await canonicalOf(request, `/?ind=${BANK}&page=2`)).toBe(`${ORIGIN}/?ind=${BANK}&page=2`);
    // 総ページ数を超えたものは落とす。
    expect(await canonicalOf(request, "/?page=999")).toBe(ORIGIN);
  });

  test("ページ送りが範囲外のURLへリンクしない（無限のクロール空間を作らない）", async ({
    request,
  }) => {
    // `aria-disabled` と `pointer-events-none` はクローラに効かない。href が
    // 出ていないことで防ぐ。
    const pageLinks = async (path: string) => {
      const html = await (await request.get(path)).text();
      return [...html.matchAll(/href="\?[^"]*page=(\d+)"/g)].map((m) => Number(m[1]));
    };

    for (const page of await pageLinks("/")) {
      expect(page, "/").toBeGreaterThanOrEqual(1);
      expect(page, "/").toBeLessThanOrEqual(63);
    }
    for (const page of await pageLinks("/?page=63")) {
      expect(page, "/?page=63").toBeLessThanOrEqual(63);
    }
    // 手で叩いた範囲外のURLからも、範囲外へは繋がない。
    for (const page of await pageLinks("/?page=999")) {
      expect(page, "/?page=999").toBeLessThanOrEqual(63);
    }
  });

  test("ページごとに別の企業が並び、企業ページへの内部リンクになっている", async ({
    request,
  }) => {
    const companyIds = async (path: string) => {
      const html = await (await request.get(path)).text();
      return new Set([...html.matchAll(/href="\/company\/([^"]+)"/g)].map((m) => m[1]));
    };

    const first = await companyIds("/");
    const second = await companyIds("/?page=2");
    expect(first.size).toBe(30);
    expect(second.size).toBe(30);
    // 1社も重ならない。だからページ2は `/` の複製ではない。
    expect([...second].filter((id) => first.has(id))).toHaveLength(0);
  });

  test("有価証券報告書が全ページの description に入っている", async ({ request }) => {
    for (const path of ["/", "/?age=35", `/?ind=${BANK}`, "/about", "/company/6861"]) {
      const html = await (await request.get(path)).text();
      const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
      expect(description, path).toContain("有価証券報告書");
    }
  });
});
