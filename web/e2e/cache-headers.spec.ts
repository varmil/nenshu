import { test, expect } from "@playwright/test";

/**
 * ADR-0004「キャッシュの3層」。`lib/cache/headers.test.ts` が固定するのは
 * 規則の配列そのもので、**それが実際の応答ヘッダとして出るかは別の話**——
 * `has`/`missing` の判定も、規則の後勝ちも、Next.js のルーティングを通らないと
 * 分からない。実際に先頭に置いて効かなかった事故があり、そこを塞ぐ。
 *
 * **見るのは `Cloudflare-CDN-Cache-Control` のほう。** devサーバーは
 * `Cache-Control` を `no-cache, must-revalidate` で上書きするので、
 * ブラウザ向けの値はここでは検証できない（単体テスト側で担保している）。
 * エッジの挙動を決めているのはこちらなので、対象としてはむしろ正しい。
 */

const EDGE = "cloudflare-cdn-cache-control";

test.describe("ページ応答のキャッシュヘッダ", () => {
  test("ふつうのGETはエッジに乗る", async ({ request }) => {
    for (const path of ["/", "/about", "/company/6861", "/sitemap.xml", "/robots.txt"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()[EDGE], path).toContain("s-maxage=86400");
    }
  });

  test("`RSC` ヘッダ付きで `_rsc` の無いリクエストは保存させない", async ({ request }) => {
    // Cloudflare は `Vary` を見ないので、この応答（`307 → /?_rsc`）に
    // キャッシュ可能なヘッダが付いていると素の `/` のキャッシュキーを
    // 上書きし、ふつうの読者が `/?_rsc` へ飛ばされる。本番で再現した。
    for (const path of ["/", "/about", "/company/6861"]) {
      const response = await request.get(path, {
        headers: { RSC: "1" },
        maxRedirects: 0,
      });
      expect(response.headers()[EDGE], path).toBe("private, no-store");
    }
  });

  test("`_rsc` 付きの正規の遷移はキャッシュ対象のまま", async ({ request }) => {
    // 正規のルーターは必ず `_rsc` を付ける。ここまで巻き込むとページ遷移が
    // 毎回 Worker を起こすことになるので、当たらないことを固定する。
    const response = await request.get("/company/6861?_rsc=abc123", {
      headers: { RSC: "1" },
      maxRedirects: 0,
    });
    expect(response.headers()[EDGE]).toContain("s-maxage=86400");
  });
});
