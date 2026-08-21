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

  it("ブラウザにはHTMLを持たせない（再訪で古い数字を見せないため）", () => {
    // `max-age` が正の値に戻ると、デプロイ後その秒数のあいだ再訪した読者が
    // 古い金額を見る。推定式を変えた直後は `/about` の説明と食い違う。ADR-0004 参照。
    expect(BROWSER_CACHE_CONTROL).toBe("public, max-age=0, must-revalidate");
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
      expect(rsc.missing).toEqual([{ type: "query", key: "_rsc" }]);
    });

    it("当たったらブラウザにもエッジにも保存させない", () => {
      expect(valueOf(rsc, "Cache-Control")).toBe("private, no-store");
      expect(valueOf(rsc, "Cloudflare-CDN-Cache-Control")).toBe(
        "private, no-store",
      );
    });
  });
});
