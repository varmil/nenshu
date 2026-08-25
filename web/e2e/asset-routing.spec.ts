import { test, expect } from "@playwright/test";

/**
 * **`run_worker_first` の許可リストに漏れが無いこと**（Issue #200 の一部・親 #118）。
 *
 * `wrangler.jsonc` で `not_found_handling: "404-page"` にしてある。ボットのスキャン
 * （`/wp-admin/install.php` 等）が Worker を起こして CPU を使っていたためで、
 * アセットに一致しないリクエストは Worker を呼ばずに `404.html` で返る。
 *
 * **代償として、`run_worker_first` に載っていないパスは全部 404 になる。** ページを
 * 足してここへの追記を忘れると、本番でそのページだけが 404 になる。
 *
 * **dev サーバーには `run_worker_first` が効かない**（wrangler の設定なので）。
 * だからこのファイルは Worker（`E2E_BASE_URL`）に向けたときだけ走る——dev で
 * 走らせると全部通ってしまい、守っているつもりで守っていない状態になる
 * （#183 で起きたのがそれ）。
 *
 * 回し方は `e2e/prefetch-loop.spec.ts` と同じ。
 */

/** Worker が処理すべきパス。`wrangler.jsonc` の `run_worker_first` と対で見る。 */
const WORKER_PATHS = ["/", "/?age=35", "/?ind=銀行業", "/about", "/sitemap.xml", "/robots.txt"];

/** Worker を起こす価値が無いパス。ボットのスキャンはここに来る。 */
const SCANNED_PATHS = ["/wp-admin/install.php", "/.env", "/xmlrpc.php", "/admin"];

test.describe("静的アセットのルーティング（Issue 200）", () => {
  test.skip(
    !process.env.E2E_BASE_URL,
    "`run_worker_first` は wrangler の設定で dev サーバーには効かない。Worker に向けたときだけ意味がある"
  );

  test("Worker が処理すべきパスが 404 になっていない", async ({ request }) => {
    for (const path of WORKER_PATHS) {
      const response = await request.get(path);
      expect(response.status(), `${path} が 404 なら run_worker_first の漏れ`).toBe(200);
    }
  });

  test("sitemap に載せた企業ページが 404 になっていない", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const companies = [...xml.matchAll(/<loc>[^<]*(\/company\/[^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(companies.length, "sitemap に企業ページが無い").toBeGreaterThan(1_000);

    // 全部叩くと1,867件になるので、先頭・末尾・中間を抜いて見る。
    const sample = [companies[0], companies[Math.floor(companies.length / 2)], companies.at(-1)!];
    for (const path of sample) {
      expect((await request.get(path)).status(), path).toBe(200);
    }
  });

  test("存在しないIDは Worker が 404 を返す（一覧に無い会社を描かない）", async ({ request }) => {
    for (const path of ["/company/does-not-exist", "/company/s100yfah"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
    }
  });

  /**
   * **これがこの設定の目的。** Worker を経由したかは応答ヘッダで分かる——
   * OpenNext は `x-opennext` 系のヘッダを付けるが、静的アセットの応答には付かない。
   */
  test("ボットのスキャンは Worker を起こさずに 404 になる", async ({ request }) => {
    for (const path of SCANNED_PATHS) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);

      const headers = response.headers();
      const viaWorker = Object.keys(headers).some(
        (key) => key.startsWith("x-opennext") || key.startsWith("x-nextjs")
      );
      expect(viaWorker, `${path} で Worker が起動している`).toBe(false);
    }
  });
});
