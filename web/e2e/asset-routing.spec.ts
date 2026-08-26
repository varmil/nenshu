import { test, expect } from "@playwright/test";
import { RENDERED_BY_HEADER, RENDERED_BY_WORKER } from "../lib/runtime/renderedBy";

/**
 * **どのURLが Worker を起こすか**（F1・#209・ADR-0014。もとは Issue #200 の一部）。
 *
 * `wrangler.jsonc` の `run_worker_first` は `/` だけで、他はビルド時に生成した HTML が
 * 静的アセットとして返る。**この施策の KPI そのもの**（公開している約3,004 URL のうち
 * Worker を起こすのは `/` とそのファセット42件だけ）なので、ここで固定する。
 *
 * あわせて `not_found_handling: "404-page"` も見る——アセットに一致しないリクエスト
 * （ボットのスキャン）は Worker を呼ばずに 404 になる。
 *
 * **dev サーバーには `run_worker_first` が効かない**（wrangler の設定なので）。
 * だからこのファイルは Worker（`E2E_BASE_URL`）に向けたときだけ走る——dev で走らせると
 * 全部通ってしまい、守っているつもりで守っていない状態になる（#183 で起きたのがそれ）。
 */

/** Worker が描くパス。`wrangler.jsonc` の `run_worker_first` と対で見る。 */
const WORKER_PATHS = ["/", "/?age=35", "/?ind=銀行業", "/?page=2"];

/** ビルド時に生成して静的アセットで返すパス（AC-1）。 */
const ASSET_PATHS = ["/about", "/company/6861", "/sitemap.xml", "/robots.txt"];

/** Worker を起こす価値が無いパス。ボットのスキャンはここに来る。 */
const SCANNED_PATHS = ["/wp-admin/install.php", "/.env", "/xmlrpc.php", "/admin"];

test.describe("静的アセットのルーティング（F1・AC-1）", () => {
  test.skip(
    !process.env.E2E_BASE_URL,
    "`run_worker_first` は wrangler の設定で dev サーバーには効かない。Worker に向けたときだけ意味がある"
  );

  test("`/` とそのファセットは Worker が描く", async ({ request }) => {
    for (const path of WORKER_PATHS) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()[RENDERED_BY_HEADER], `${path} が Worker を通っていない`).toBe(
        RENDERED_BY_WORKER
      );
    }
  });

  /**
   * **この施策の目的そのもの。** 200 で返るのに Worker を起こしていないこと——
   * 印が付いていなければ、応答は静的アセットから直接出ている。
   */
  test("事前生成したページは Worker を起こさずに返る", async ({ request }) => {
    for (const path of ASSET_PATHS) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(
        response.headers()[RENDERED_BY_HEADER],
        `${path} で Worker が起動している（run_worker_first が広すぎる）`
      ).toBeUndefined();
    }
  });

  test("sitemap に載せた企業ページが 404 になっていない", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const companies = [...xml.matchAll(/<loc>[^<]*(\/company\/[^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(companies.length, "sitemap に企業ページが無い").toBeGreaterThan(1_000);

    // 全部叩くと2,961件になるので、先頭・末尾・中間を抜いて見る。
    const sample = [companies[0], companies[Math.floor(companies.length / 2)], companies.at(-1)!];
    for (const path of sample) {
      expect((await request.get(path)).status(), path).toBe(200);
    }
  });

  test("存在しないIDは 404（一覧に無い会社を描かない）", async ({ request }) => {
    for (const path of ["/company/does-not-exist", "/company/s100yfah"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
    }
  });

  test("ボットのスキャンは Worker を起こさずに 404 になる", async ({ request }) => {
    for (const path of SCANNED_PATHS) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
      expect(
        response.headers()[RENDERED_BY_HEADER],
        `${path} で Worker が起動している`
      ).toBeUndefined();
    }
  });

  /**
   * **404 はこのサイトの 404 であること**（F1）。`src/pages/404.astro` を置き忘れると
   * Astro の既定（`lang="en"` の `404: Not Found`、共通ヘッダ無し）が出るが、
   * **ステータスは同じ 404 なので上のテストは通ってしまう。**
   * 出どころが1つであること——存在しないIDの企業ページも同じ HTML——も併せて見る。
   */
  test("404 は共通ヘッダを持つ日本語のページで、出どころが1つ", async ({ request }) => {
    const bodies: string[] = [];
    for (const path of [...SCANNED_PATHS, "/company/does-not-exist"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
      const html = await response.text();
      expect(html, path).toContain('lang="ja"');
      expect(html, path).toContain("ページが見つかりません");
      // 共通ヘッダ（`SiteHeader`）が出ている。
      expect(html, path).toContain("OpenReport");
      bodies.push(html);
    }
    expect(new Set(bodies).size, "404 の HTML が1種類ではない").toBe(1);
  });
});
