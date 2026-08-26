import { test, expect } from "./appTest";
import {
  APPLE_TOUCH_ICON,
  BRAND_ASSET_PATHS,
  FAVICON_ICO,
  FAVICON_PNG,
  FAVICON_SVG,
  WEB_MANIFEST,
} from "../lib/brand/assets";

/*
 * S4（Issue #163・`docs/site-chrome/spec.md` 6.・AC-21〜AC-28）。
 *
 * **単体テスト（`lib/brand/assets.test.ts`）では足りない。** あちらが見るのは
 * `public/` に置いたファイルそのもので、「その参照がHTMLに出ているか」「配信されて
 * 200 で返るか」は分からない。`app/favicon.ico` を消したのに `metadata.icons` を
 * 書き忘れれば、ファイルは正しいのにタブのアイコンだけ消える。
 *
 * ページを開かずに取れる情報は `request` で取る（描画を待つ必要が無い）。
 */

const ICON_LINKS = [
  { path: FAVICON_SVG, type: "image/svg+xml" },
  ...FAVICON_PNG.map(({ path, size }) => ({ path, type: "image/png", sizes: `${size}x${size}` })),
];

test.describe("ブランドのアイコン", () => {
  test("HTML にファビコンとアプリアイコンの参照が出る（AC-21〜AC-24）", async ({ page }) => {
    await page.goto("/");

    for (const { path, type } of ICON_LINKS) {
      await expect(page.locator(`link[rel="icon"][href="${path}"]`)).toHaveAttribute("type", type);
    }
    await expect(page.locator(`link[rel="apple-touch-icon"][href="${APPLE_TOUCH_ICON.path}"]`)).toHaveCount(1);
    await expect(page.locator(`link[rel="manifest"][href="${WEB_MANIFEST}"]`)).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
  });

  test("SVG が最初の `icon` として出る（AC-25）", async ({ page }) => {
    await page.goto("/");
    /*
      濃色サーフェスでの色の切り替えを持っているのは SVG だけで、PNG は1色しか
      持てないフォールバック。ブラウザは並びも手がかりにするので、SVG を先に置く。
    */
    const first = page.locator('link[rel="icon"]').first();
    await expect(first).toHaveAttribute("href", FAVICON_SVG);
  });

  test("`/favicon.ico` は `<link>` に出さないが 200 で返る", async ({ page, request }) => {
    /*
      出すと SVG より先に選ぶブラウザがあり、切り替えを持たないほうが使われる。
      それでもファイルを置いておくのは、ページを読まずに固定パスを叩く相手
      （RSSリーダー・ブックマークサービス）がいるため。
    */
    await page.goto("/");
    await expect(page.locator(`link[href="${FAVICON_ICO}"]`)).toHaveCount(0);

    const response = await request.get(FAVICON_ICO);
    expect(response.status()).toBe(200);
    // 25,931 バイトは `create-next-app` の既定。これに戻っていたら差し替えていない。
    expect((await response.body()).byteLength).toBeLessThan(25_931);
  });

  test.describe("参照先が全部 200 で返る", () => {
    for (const path of BRAND_ASSET_PATHS) {
      test(path, async ({ request }) => {
        const response = await request.get(path);
        expect(response.status()).toBe(200);
        expect((await response.body()).byteLength).toBeGreaterThan(0);
      });
    }
  });

  test("manifest が JSON として読めて、アイコンが 200 で返る（AC-24）", async ({ request }) => {
    const manifest = await (await request.get(WEB_MANIFEST)).json();
    expect(manifest.name).toBe("OpenReport");
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).status()).toBe(200);
    }
  });
});

test.describe("ヘッダのブランド", () => {
  /**
   * ブランドの文字色が `--primary` と一致するか（AC-26）。
   *
   * hex と突き合わせない。`getComputedStyle` が返す形式（`rgb()` / `oklch()` / `lab()`）は
   * ブラウザで違うので、**同じブラウザの中で `var(--primary)` を当てた要素と
   * 文字列比較する**。形式が何であれ、同じ色なら同じ文字列になる。
   */
  async function brandColorMatchesPrimary(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const brand = document.querySelector("header a[href='/']");
      if (!brand) throw new Error("ヘッダのブランドが見つからない");
      const probe = document.createElement("span");
      probe.style.color = "var(--primary)";
      document.body.append(probe);
      const result = getComputedStyle(brand).color === getComputedStyle(probe).color;
      probe.remove();
      return result;
    });
  }

  test("ライトで --primary の色になる（AC-26）", async ({ page }) => {
    await page.goto("/");
    expect(await brandColorMatchesPrimary(page)).toBe(true);
  });

  test.describe("濃色サーフェス", () => {
    test.use({ colorScheme: "dark" });

    test("ダークでも --primary の色になる（AC-25・AC-26）", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      expect(await brandColorMatchesPrimary(page)).toBe(true);
    });
  });

  test("画像ではなく文字のまま（AC-27）", async ({ page }) => {
    await page.goto("/");
    const brand = page.locator("header a[href='/']").first();
    await expect(brand).toHaveText("OpenReport");
    await expect(brand.locator("img, svg")).toHaveCount(0);
  });

  test("390px でヘッダが横スクロールを起こさない（AC-27）", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
