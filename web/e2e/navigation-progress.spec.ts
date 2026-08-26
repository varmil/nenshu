import { test, expect } from "./appTest";
import type { Page } from "@playwright/test";

/**
 * 遷移中の読み込み表示（`features/navigation/`）。
 *
 * **F1（#209・ADR-0014）で見方を変えた。** `next/link` の頃、ページ間の移動は
 * `pushState` で完結していたので、クリックの後も同じ文書が残り、Playwright の
 * ロケータでそのままバーを見られた。**Astro では素の HTML 取得になる**ので、
 *
 * - `click()` は既定で**新しい文書が届くまで返らない**
 * - `expect(locator)` も**進行中の遷移が終わるまで待つ**（`noWaitAfter` を渡しても、
 *   待つのは `expect` の側）
 *
 * ——どちらも、戻ってきた時点では次のページに入れ替わっている。**バーが見えるのは
 * 「押してから届くまで」の間だけ**なので、外から覗く手が無い。
 *
 * **だから文書の中から標本を取る。** クリックの前にページ内で一定間隔の記録を
 * 始めておき、`exposeFunction` でテスト側へ渡す。記録は文書と一緒に消えるので、
 * 残るのは「前のページで何が起きていたか」だけになる。
 */

/** 遷移待ちの間にページ内で取った標本。 */
interface Sample {
  /** バーの数（0 か 1）。 */
  bars: number;
  /** 見出しの上端（バーが本文を押し下げていないか）。 */
  headingTop: number | null;
}

declare global {
  interface Window {
    __navSample?: (sample: Sample) => void;
  }
}

/** 指定パターンのリクエストを遅らせて、遷移待ちが目に見える状態を作る。 */
async function delayNavigationTo(page: Page, pattern: RegExp, ms: number) {
  await page.route(pattern, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

/**
 * `click` を押してから次のページが届くまでの間、前のページを 50ms ごとに記録する。
 * 戻り値は取れた標本の全部。
 */
async function samplesWhileNavigating(
  page: Page,
  click: () => Promise<void>,
  arrived: () => Promise<void>
): Promise<Sample[]> {
  const samples: Sample[] = [];
  await page.exposeFunction("__navSample", (sample: Sample) => {
    samples.push(sample);
  });
  await page.evaluate(() => {
    const heading = document.querySelector("h1");
    setInterval(() => {
      window.__navSample?.({
        bars: document.querySelectorAll('[data-testid="nav-progress"]').length,
        headingTop: heading ? heading.getBoundingClientRect().top : null,
      });
    }, 50);
  });

  await click();
  await arrived();
  return samples;
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

    const samples = await samplesWhileNavigating(
      page,
      () => page.getByRole("link", { name: "株式会社キーエンス" }).click({ noWaitAfter: true }),
      () =>
        expect(page.getByRole("heading", { name: "株式会社キーエンス", level: 1 })).toBeVisible()
    );

    // 押した直後にバーが出ていた（クリックへの即時の反応）。
    expect(samples.some((sample) => sample.bars === 1)).toBe(true);
    // 着いたら消えている——次のページごと入れ替わるので、消し忘れは残らない。
    await expect(page.getByTestId("nav-progress")).toHaveCount(0);
  });

  test("計算方法ページへの遷移でもプログレスバーが出る", async ({ page }) => {
    await page.goto("/");
    await delayNavigationTo(page, /\/about/, 2000);

    const samples = await samplesWhileNavigating(
      page,
      () => page.getByRole("link", { name: "計算方法" }).click({ noWaitAfter: true }),
      () => expect(page.getByRole("heading", { name: "計算方法", level: 1 })).toBeVisible()
    );

    expect(samples.some((sample) => sample.bars === 1)).toBe(true);
    await expect(page.getByTestId("nav-progress")).toHaveCount(0);
  });

  test("プログレスバーは固定配置なので、出ても本文の位置がずれない", async ({ page }) => {
    await page.goto("/");
    // 押す前の位置。この時点なら進行中の遷移が無いので外から測れる。
    const before = await page.getByRole("heading", { name: "平均年収ランキング" }).boundingBox();
    expect(before).not.toBeNull();

    await delayNavigationTo(page, /\/company\/6861/, 2000);

    const samples = await samplesWhileNavigating(
      page,
      () => page.getByRole("link", { name: "株式会社キーエンス" }).click({ noWaitAfter: true }),
      () =>
        expect(page.getByRole("heading", { name: "株式会社キーエンス", level: 1 })).toBeVisible()
    );

    // バーが出ている間も、見出しの上端は押す前と同じ。
    expect(samples.some((sample) => sample.bars === 1)).toBe(true);
    for (const sample of samples) expect(sample.headingTop).toBe(before!.y);
  });

  test("ページ送り（クライアント側で完結する操作）ではプログレスバーは出ない", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "次のページへ" }).click();
    await expect(page).toHaveURL(/[?&]page=2/);

    await expect(page.getByTestId("nav-progress")).toHaveCount(0);
  });
});
