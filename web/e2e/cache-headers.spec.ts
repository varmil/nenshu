import { test, expect } from "@playwright/test";

/**
 * ADR-0004「キャッシュの3層」。`lib/cache/headers.test.ts` が固定するのは値そのもので、
 * **それが実際の応答ヘッダとして出るかは別の話**になる。
 *
 * **F1（#209・ADR-0014）で受け持ちが2つに割れた。** `/` は実行時に
 * `Astro.response.headers` が付け、それ以外は静的アセットとして `public/_headers` が
 * 付ける。**どちらの経路も通ることをここで見る**——単体テストは値が揃っていることしか
 * 見ておらず、`_headers` が実際に適用されるかは Worker に投げないと分からない。
 *
 * **`RSC` まわりのテストは消えた。** 守っていた相手（`RSC: 1` ヘッダ付きで `_rsc` の
 * 無いリクエストに Next.js が返す `307 → /?_rsc` が素の `/` のキャッシュを上書きする
 * 事故。2026-08-21 に本番で再現）が、RSC ごと無くなったため。
 *
 * **見るのは `Cloudflare-CDN-Cache-Control` のほう。** devサーバーは `Cache-Control` を
 * `no-cache, must-revalidate` で上書きするので、ブラウザ向けの値はここでは検証できない
 * （単体テスト側で担保している）。エッジの挙動を決めているのはこちらなので、対象としては
 * むしろ正しい。
 */

const EDGE = "cloudflare-cdn-cache-control";

test.describe("ページ応答のキャッシュヘッダ", () => {
  test("実行時に描く `/` はエッジに乗る", async ({ request }) => {
    for (const path of ["/", "/?age=35", "/?ind=銀行業"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()[EDGE], path).toContain("s-maxage=86400");
    }
  });

  /**
   * **`public/_headers` は Worker に向けたときだけ効く**（Cloudflare の静的アセットの
   * 仕組みなので、devサーバーは読まない）。dev では skip する——ここで通してしまうと、
   * `_headers` が空でも気づけない。
   */
  test("事前生成したページもエッジに乗る（`public/_headers`）", async ({ request }) => {
    test.skip(
      !process.env.E2E_BASE_URL,
      "`public/_headers` は Cloudflare の静的アセットの仕組みで、devサーバーは読まない"
    );
    for (const path of ["/about", "/company/6861", "/sitemap.xml", "/robots.txt"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()[EDGE], path).toContain("s-maxage=86400");
    }
  });
});
