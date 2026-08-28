import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const USER_AGENT =
  "nenshu-logo-bot/0.1 (+https://nenshu.fkmks-247.workers.dev/; mailto:fkmks247@gmail.com)";

export type FetchResult = { status: number; body: Buffer; contentType: string; url: string };

export class Fetcher {
  private cacheDir: string;
  constructor(cacheDir: string) {
    this.cacheDir = resolve(cacheDir, "raw");
    mkdirSync(this.cacheDir, { recursive: true });
  }

  private pathFor(url: string) {
    return resolve(this.cacheDir, createHash("sha1").update(url).digest("hex"));
  }

  /** キャッシュに実体があればそれを返す。無ければ取得して置く。 */
  async get(url: string, opts: { timeoutMs?: number; cache?: boolean } = {}): Promise<FetchResult> {
    const cache = opts.cache !== false;
    const file = this.pathFor(url);
    if (cache && existsSync(file)) {
      const meta = existsSync(file + ".json")
        ? JSON.parse(readFileSync(file + ".json", "utf-8"))
        : { status: 200, contentType: "", url };
      return { ...meta, body: readFileSync(file) };
    }
    const res = await this.fetchOnce(url, opts.timeoutMs ?? 15000);
    if (cache && res.status === 200 && res.body.length > 0) {
      writeFileSync(file, res.body);
      writeFileSync(
        file + ".json",
        JSON.stringify({ status: res.status, contentType: res.contentType, url: res.url })
      );
    }
    return res;
  }

  private async fetchOnce(url: string, timeoutMs: number): Promise<FetchResult> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const r = await fetch(url, {
          signal: ctrl.signal,
          redirect: "follow",
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "*/*",
            "Accept-Language": "ja,en;q=0.8",
          },
        });
        const buf = Buffer.from(await r.arrayBuffer());
        return {
          status: r.status,
          body: buf,
          contentType: r.headers.get("content-type") ?? "",
          url: r.url || url,
        };
      } catch {
        if (attempt === 1) return { status: 0, body: Buffer.alloc(0), contentType: "", url };
      } finally {
        clearTimeout(timer);
      }
    }
    return { status: 0, body: Buffer.alloc(0), contentType: "", url };
  }
}

/**
 * **`http://` で失敗したら `https://` に上げて1回だけやり直す。**
 * Wikidata の公式サイト（P856）は古い `http://` のまま登録されていることが多く、
 * いまはその宛先が生きていない会社がある——実測で、URL を持つ183社のうち**22社**が
 * これだけで通る（オービックは `http://` が 503、`https://` が 200）。
 *
 * **上げるのは失敗したときだけ。** 先に `https://` を試す形にすると、`https` を持たない
 * サイトで余計な1往復が全社に掛かる。**逆向き（https → http）はしない**——平文へ落として
 * まで取りに行く理由が無い。
 */
export async function fetchSite(
  fetcher: SiteFetcher,
  site: string
): Promise<FetchResult | null> {
  const res = await fetcher.get(site);
  if (res.status === 200 && res.body.length > 0) return res;
  if (!site.startsWith("http://")) return null;
  const upgraded = await fetcher.get(`https://${site.slice("http://".length)}`);
  return upgraded.status === 200 && upgraded.body.length > 0 ? upgraded : null;
}


/** 取得だけを使う。テストが `Fetcher` を丸ごと作らずに済むように構造で受ける。 */
export type SiteFetcher = Pick<Fetcher, "get">;

/** 上限つきの並列実行。順序は保つ。 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
      done++;
      onProgress?.(done, items.length);
    }
  });
  await Promise.all(workers);
  return out;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
