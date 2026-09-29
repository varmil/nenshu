import { chromium, type FullConfig } from "@playwright/test";
import { companies } from "../testing/realData";

/**
 * テストを始める前に dev サーバーを温める（Playwright の `globalSetup`）。
 *
 * **冷えた dev サーバーは、最初にページを描いたときに依存の事前バンドルをやり直す。** 終わると
 * `[vite] optimized dependencies changed. reloading` を出し、開いているページを読み込み直させる
 * （CI のまっさらなチェックアウトでは毎回起きる。`.astro/`・`node_modules/.vite` が無いため）。
 * その間に走ったテストが巻き込まれていたとみられる——`branding.spec.ts` の配信の確認が
 * `ECONNRESET` で落ちたのは CI と手元で計2回、**どちらも走り出して10件目**だった。
 * **テストごとにやり直しを入れるのではなく、やり直しをテストの前に済ませる。**
 *
 * 島を持つ3つの画面（ランキング・企業詳細・計算方法）を描かせ、読み込み直しが収まるまで
 * 2巡する。Worker 相手（`E2E_BASE_URL`）は dev サーバーではないので何もしない。
 */
export default async function warmup(config: FullConfig) {
  if (process.env.E2E_BASE_URL) return;
  const { baseURL, launchOptions } = config.projects[0].use;
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage();
    const paths = ["/", `/company/${companies.rows[0][0]}`, "/about"];
    for (let round = 0; round < 2; round++) {
      for (const path of paths) {
        await page.goto(new URL(path, baseURL).toString(), { waitUntil: "networkidle" });
      }
    }
  } finally {
    await browser.close();
  }
}
