import { describe, expect, it } from "vitest";
import {
  BROWSER_CACHE_CONTROL,
  EDGE_CACHE_CONTROL,
  cacheHeaderRules,
} from "./headers";

const valueOf = (
  rule: ReturnType<typeof cacheHeaderRules>[number],
  key: string,
) => rule.headers.find((h) => h.key === key)?.value;

describe("cacheHeaderRules", () => {
  const rules = cacheHeaderRules();

  it("キャッシュ対象は5つのパスだけ", () => {
    expect(rules.slice(0, -1).map((r) => r.source)).toEqual([
      "/",
      "/about",
      "/company/:id",
      "/sitemap.xml",
      "/robots.txt",
    ]);
  });

  it("ブラウザには1時間持たせる", () => {
    // 全画面エラーの対処として `max-age=0` を検討したが、あれの対処にならないので
    // 据え置いた（ADR-0004「ブラウザのキャッシュは据え置く」）。代償は、再訪した
    // 読者がこの秒数ぶん古い金額を見ること。
    expect(BROWSER_CACHE_CONTROL).toBe("public, max-age=3600");
    for (const rule of rules.slice(0, -1)) {
      expect(valueOf(rule, "Cache-Control")).toBe(BROWSER_CACHE_CONTROL);
    }
  });

  it("エッジには持たせる（Worker の起動を減らす）", () => {
    for (const rule of rules.slice(0, -1)) {
      expect(valueOf(rule, "Cloudflare-CDN-Cache-Control")).toBe(
        EDGE_CACHE_CONTROL,
      );
    }
  });

  describe("RSCバイパス規則", () => {
    const rsc = rules.at(-1)!;

    it("必ず配列の末尾にある（headers() は後勝ちのため）", () => {
      // 先頭に置くと後続の `{ source: "/" }` に上書きされ、汚染が塞がらない。
      // 実際に先頭で組んで効かないことを確認済み（2026-08-21）。
      expect(rsc.source).toBe("/:path*");
      expect(rules.indexOf(rsc)).toBe(rules.length - 1);
    });

    it("`RSC` ヘッダがあり、かつ `_rsc` クエリが無いときだけ当たる", () => {
      expect(rsc.has).toEqual([{ type: "header", key: "RSC" }]);
      // `value` を落とすと OpenNext のマッチャ側で規則が永久に不成立になる。
      // `next start` では動いてしまうので、ローカルでは気づけない。
      expect(rsc.missing).toEqual([{ type: "query", key: "_rsc", value: ".+" }]);
    });

    it("当たったらブラウザにもエッジにも保存させない", () => {
      expect(valueOf(rsc, "Cache-Control")).toBe("private, no-store");
      expect(valueOf(rsc, "Cloudflare-CDN-Cache-Control")).toBe(
        "private, no-store",
      );
    });
  });
});
