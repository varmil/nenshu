import { test, expect } from "./rankingTest";
import type { Page } from "@playwright/test";

/** 指定パターンのリクエストを遅らせて、遷移待ちが目に見える状態を作る。 */
async function delayNavigationTo(page: Page, pattern: RegExp, ms: number) {
  await page.route(pattern, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

test.describe("遷移中の読み込み表示", () => {
  test("初期表示ではプログレスバーは出ていない", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("nav-progress")).toHaveCount(0);
  });

  test("企業ページへの遷移が遅いとき、クリック直後にプログレスバーが出て、到着後に消える", async ({
    page,
  }) => {
    await page.goto("/");
    await delayNavigationTo(page, /\/company\/6861/, 2000);

    await page.getByRole("link", { name: "株式会社キーエンス" }).click();

    // 到着を待たずにバーが出ている（クリックへの即時の反応）。
    await expect(page.getByTestId("nav-progress")).toBeVisible({ timeout: 1000 });
    await expect(page.getByRole("status")).toHaveText("読み込み中");

    await expect(page.getByRole("heading", { name: "株式会社キーエンス" })).toBeVisible();
    await expect(page.getByTestId("nav-progress")).toHaveCount(0);
  });

  test("計算方法ページへの遷移でもプログレスバーが出る", async ({ page }) => {
    await page.goto("/");
    await delayNavigationTo(page, /\/about/, 2000);

    await page.getByRole("link", { name: "計算方法" }).click();

    await expect(page.getByTestId("nav-progress")).toBeVisible({ timeout: 1000 });
    await expect(page.getByRole("heading", { name: "計算方法", level: 1 })).toBeVisible();
    await expect(page.getByTestId("nav-progress")).toHaveCount(0);
  });

  test("プログレスバーは固定配置なので、出ても本文の位置がずれない", async ({ page }) => {
    await page.goto("/");
    const heading = page.getByRole("heading", { name: "平均年収ランキング" });
    const before = await heading.boundingBox();

    await delayNavigationTo(page, /\/company\/6861/, 2000);
    await page.getByRole("link", { name: "株式会社キーエンス" }).click();
    await expect(page.getByTestId("nav-progress")).toBeVisible({ timeout: 1000 });

    expect(await heading.boundingBox()).toEqual(before);
  });

  test("ページ送り（クライアント側で完結する操作）ではプログレスバーは出ない", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "次のページへ" }).click();
    await expect(page).toHaveURL(/[?&]page=2/);

    await expect(page.getByTestId("nav-progress")).toHaveCount(0);
  });
});
