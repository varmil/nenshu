import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pageCacheHeaders } from "./headers";

/**
 * キャッシュ規則（ADR-0004）。**F1（#209・ADR-0014）で受け持ちが2つに割れた**
 * ——実行時に返るのは `/` だけで、他はビルド時に生成した HTML が静的アセットとして
 * 並ぶ。**値が食い違わないこと**をここで固定する（spec AC-15）。
 *
 * **`Cache-Control` はE2Eでは検証できない**（devサーバーが `no-cache` で上書きする）。
 * ブラウザ向けの値はここが唯一の担保になる。
 */
const HEADERS_FILE = new URL("../../public/_headers", import.meta.url);

/** `public/_headers` の1ブロック（パス → ヘッダ）を読む。 */
function headersFor(path: string): Record<string, string> {
  const lines = readFileSync(HEADERS_FILE, "utf8").split("\n");
  const start = lines.findIndex((line) => line.trim() === path);
  expect(start, `${path} のブロックが _headers に無い`).toBeGreaterThanOrEqual(0);
  const result: Record<string, string> = {};
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("  ")) break;
    const [key, ...rest] = line.trim().split(": ");
    result[key] = rest.join(": ");
  }
  return result;
}

describe("pageCacheHeaders（`/` の実行時ヘッダ）", () => {
  it("ブラウザ1時間・エッジ24時間で、エッジは期限切れ後も1週間は古いものを返す（ADR-0004）", () => {
    expect(pageCacheHeaders()).toEqual({
      // ブラウザ向けを 0 にしない（デプロイ直後の全画面エラーの対処にならない）。
      "Cache-Control": "public, max-age=3600",
      "Cloudflare-CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    });
  });
});

/**
 * **静的アセットになったページは `public/_headers` が付ける。**
 * `/` と同じ値でなければ、同じサイトの中でキャッシュの寿命が2種類あることになる。
 */
describe("public/_headers（事前生成したページ）", () => {
  for (const path of ["/about", "/company/*", "/sitemap.xml", "/robots.txt"]) {
    it(`${path} は \`/\` と同じキャッシュ規則を持つ`, () => {
      expect(headersFor(path)).toEqual(pageCacheHeaders());
    });
  }

  /**
   * **`/` は `_headers` に書かない。** あちらは実行時に描くので
   * `src/pages/index.astro` が付ける。両方に書くと、片方だけ直した状態になる。
   * **`/_astro/*` も書かない。** `@astrojs/cloudflare` がビルド時に足すので、
   * 書くと同じパスの規則が2つ並ぶ。
   */
  it("`/` と `/_astro/*` のブロックは `_headers` に無い", () => {
    const lines = readFileSync(HEADERS_FILE, "utf8").split("\n");
    // 規則として書かれていないことを見る（コメントで言及するのは構わない）。
    for (const path of ["/", "/_astro/*"]) {
      expect(lines.some((line) => line.trim() === path), path).toBe(false);
    }
  });
});
