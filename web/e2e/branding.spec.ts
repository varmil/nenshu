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
 * 200 で返るか」は分からない。`src/layouts/Base.astro` の `<link>` を書き忘れれば、
 * ファイルは正しいのにタブのアイコンだけ消える。
 *
 * ページを開かずに取れる情報は `request` で取る（描画を待つ必要が無い）。
 */

const ICON_LINKS = [
  { path: FAVICON_SVG, type: "image/svg+xml" },
  ...FAVICON_PNG.map(({ path }) => ({ path, type: "image/png" })),
];

test.describe("ブランドのアイコン", () => {
  test("HTML にファビコンとアプリアイコンの参照が出る（AC-21〜AC-25）", async ({ page }) => {
    await page.goto("/");

    for (const { path, type } of ICON_LINKS) {
      await expect(page.locator(`link[rel="icon"][href="${path}"]`), path).toHaveAttribute("type", type);
    }
    /*
      SVG を最初の `icon` にする（AC-25）。濃色サーフェスでの色の切り替えを持っているのは
      SVG だけで、PNG は1色しか持てないフォールバック。ブラウザは並びも手がかりにする。
    */
    await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", FAVICON_SVG);
    /*
      `/favicon.ico` は `<link>` に出さない。出すと SVG より先に選ぶブラウザがあり、
      切り替えを持たないほうが使われる。ファイルを置いておくのは、ページを読まずに
      固定パスを叩く相手（RSSリーダー・ブックマークサービス）のため（下のテストで 200 を見る）。
    */
    await expect(page.locator(`link[href="${FAVICON_ICO}"]`)).toHaveCount(0);
    await expect(page.locator(`link[rel="apple-touch-icon"][href="${APPLE_TOUCH_ICON.path}"]`)).toHaveCount(1);
    await expect(page.locator(`link[rel="manifest"][href="${WEB_MANIFEST}"]`)).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
  });

  /*
    中身（寸法・透過・manifest が指すアイコンが表と一致すること・`.ico` が雛形より
    小さいこと）は `lib/brand/assets.test.ts` が `public/` のファイルで見る。ここで見るのは
    それが配信されること。manifest のアイコンも OG画像もこの表に入っている。
  */
  test("参照先が全部 200 で返る", async ({ request }) => {
    for (const path of BRAND_ASSET_PATHS) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect((await response.body()).byteLength, path).toBeGreaterThan(0);
    }
  });
});

test.describe("ヘッダのブランド", () => {
  /**
   * 文字のまま（AC-27）で、ライトでもダークでも `--primary` の色になる（AC-25・AC-26）。
   *
   * 色は hex と突き合わせない。`getComputedStyle` が返す形式（`rgb()` / `oklch()` / `lab()`）は
   * ブラウザで違うので、**同じブラウザの中で `var(--primary)` を当てた要素と
   * 文字列比較する**。形式が何であれ、同じ色なら同じ文字列になる。
   */
  test("文字のままで、ライトでもダークでも --primary の色になる（AC-25〜AC-27）", async ({ page }) => {
    await page.goto("/");
    const brand = page.locator("header a[href='/']").first();
    await expect(brand).toHaveText("OpenReport");
    await expect(brand.locator("img, svg")).toHaveCount(0);

    const matchesPrimary = () =>
      brand.evaluate((el) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--primary)";
        document.body.append(probe);
        const result = getComputedStyle(el).color === getComputedStyle(probe).color;
        probe.remove();
        return result;
      });

    expect(await matchesPrimary(), "ライト").toBe(true);

    // `--primary` はライトとダークで別の値。ダークに切り替えても追従していること。
    await page.getByRole("button", { name: "ダークモードに切り替える" }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    expect(await matchesPrimary(), "ダーク").toBe(true);
  });
});
