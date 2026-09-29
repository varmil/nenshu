/**
 * 女性活躍DB の全件版を落とす（refresh の D7・#877・`docs/refresh/worklife-fetch/design.md`）。
 *
 * ネットワークに触れるのは `fetchPage` と `fetchZip` だけで、どちらも `fetch` を引数で
 * 受け取る。リンクの拾い方・User-Agent の順・ファイル名はここで固定し、テストで見る。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

/** オープンデータのページ。**ZIP の URL は決め打ちしない**——このページのリンクから拾う。 */
export const PAGE_URL = "https://positive-ryouritsu.mhlw.go.jp/positivedb/opendata/";

/**
 * 名乗る User-Agent と試す順（ADR-0008 の 2026-09-29 の追記）。**まず自サイト名を名乗り、
 * 403 のときだけブラウザを名乗る。** ブラウザを名乗ってよいのはこのデータベースの全件版の
 * 取得に限る（ロゴの取得には広げない）。
 */
export const AGENTS = [
  { name: "self", userAgent: "OpenReport-bot/1.0 (+https://openreport.net/about)" },
  {
    name: "browser",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/141.0.0.0 Safari/537.36",
  },
] as const;

export type AgentName = (typeof AGENTS)[number]["name"];

export type Fetcher = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

export class DownloadError extends Error {}

/**
 * 全件版のリンク（絶対 URL）。ページには BOM 有り（`id="download_b"`）と BOM 無し
 * （`id="download_nb"`）の2つの表があり、どちらにも「全体版」の行がある。
 * **BOM 無しの表の「全体版」の行のリンクを採る**（`docs/worklife/spec.md` 1.1）。
 *
 * 表の形が変わって見つからなければ落とす。**別の行のリンクで代用しない**——企業規模別や
 * 業種別の ZIP も同じ形のリンクで並んでおり、取り違えると一部の会社だけの版を全件として
 * 取り込むことになる。
 */
export function findFullVersionLink(html: string, pageUrl: string = PAGE_URL): string {
  const start = html.indexOf('id="download_nb"');
  if (start < 0) throw new DownloadError("ページに BOM 無しの表（download_nb）がありません");
  // 表の範囲は、次の `id="download_` か終わりまで
  const next = html.indexOf('id="download_', start + 1);
  const block = html.slice(start, next < 0 ? undefined : next);
  const rows = block.split(/<tr[\s>]/i).slice(1);
  const hrefs = rows
    .filter((row) => /<td[^>]*>\s*全体版\s*<\/td>/.test(row))
    .map((row) => row.match(/<a\s[^>]*href="([^"]+)"/i)?.[1])
    .filter((href): href is string => href !== undefined);
  if (hrefs.length !== 1) {
    throw new DownloadError(
      `BOM 無しの表の「全体版」の行のリンクが${hrefs.length}個あります（1個の想定）`
    );
  }
  return new URL(hrefs[0].replaceAll("&amp;", "&"), pageUrl).toString();
}

/**
 * ZIP のファイル名。`Content-Disposition` にあればそれ（`99_20260929_utf8.zip` のように
 * 版の日付が入る）、無ければ URL の最後の部分。**パスの区切りは落とす**（置き場所の外へ
 * 書かせない）。
 */
export function zipFileName(contentDisposition: string | null, url: string): string {
  let name = "";
  if (contentDisposition) {
    const star = contentDisposition.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/);
    const plain = contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/);
    name = star ? decodeURIComponent(star[1].trim()) : (plain?.[1].trim() ?? "");
  }
  if (!name) name = new URL(url).pathname.split("/").pop() ?? "";
  name = name.split(/[\\/]/).pop() ?? "";
  if (!name.toLowerCase().endsWith(".zip")) name = `${name || "positivedb"}.zip`;
  return name;
}

/** 日本時間の日付（`YYYY-MM-DD`）。**1日1回は日本時間の1日で数える**（D4 と同じ）。 */
export function jstDate(at: Date): string {
  return new Date(at.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** ZIP の先頭は `PK`。エラーのページを ZIP として置かないために見る。 */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/** 送る見出しは名乗りだけ（Accept は curl の既定のまま）。通ることを確かめた形のまま。 */
const headersFor = (agent: AgentName) => ({
  "User-Agent": AGENTS.find((a) => a.name === agent)!.userAgent,
});

/**
 * `curl -D` が書いた見出しの束から、最後の応答の見出しを読む。転送（リダイレクト）や
 * プロキシの `Connection Established` のたびにブロックが足されるので、最後のブロックを使う。
 */
export function parseHeaderDump(text: string): Headers {
  const blocks = text.split(/\r?\n\r?\n/).filter((b) => b.trim() !== "");
  const headers = new Headers();
  for (const line of (blocks.at(-1) ?? "").split(/\r?\n/).slice(1)) {
    const i = line.indexOf(":");
    if (i > 0) headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  return headers;
}

/**
 * curl で取る。**Node の `fetch` では通らない**——同じブラウザの User-Agent でも、Node
 * （undici）の `fetch` は 403、curl は 200 だった（2026-09-30）。undici が足す見出し
 * （`sec-fetch-mode` など）で弾かれているとみられる。弾かれ方を探るためにデータベースへ
 * 何度も試しに行くのは1日1回の約束に反するので、通ることを確かめた curl にそろえた。
 */
export const curlFetcher: Fetcher = async (url, init) => {
  const dir = mkdtempSync(resolve(tmpdir(), "positivedb-curl-"));
  try {
    const body = resolve(dir, "body");
    const head = resolve(dir, "head");
    const args = ["-sS", "-L", "--max-time", "600", "-o", body, "-D", head, "-w", "%{http_code}"];
    for (const [name, value] of Object.entries(init.headers)) args.push("-H", `${name}: ${value}`);
    const status = Number(execFileSync("curl", [...args, url], { encoding: "utf-8" }).trim());
    const bytes = readFileSync(body);
    return new Response([204, 205, 304].includes(status) ? null : new Uint8Array(bytes), {
      status,
      headers: parseHeaderDump(readFileSync(head, "utf-8")),
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/**
 * ページを取る。**自サイト名で 403 なら、ブラウザを名乗って1回だけ取り直す。**
 * 通った名乗りを返し、ZIP もその名乗りで取る（名乗りを試すのはページの1回だけ）。
 * 403 以外の失敗では名乗りを変えない——名乗りで弾かれたのではないので、変えても通らない。
 */
export async function fetchPage(
  fetcher: Fetcher,
  url: string = PAGE_URL
): Promise<{ html: string; agent: AgentName }> {
  for (const { name } of AGENTS) {
    const res = await fetcher(url, { headers: headersFor(name) });
    if (res.status === 403 && name !== AGENTS.at(-1)!.name) continue;
    if (res.status !== 200) {
      throw new DownloadError(`${url} が ${res.status} を返しました（${name} を名乗って）`);
    }
    return { html: await res.text(), agent: name };
  }
  throw new DownloadError("到達しない");
}

export async function fetchZip(
  fetcher: Fetcher,
  url: string,
  agent: AgentName
): Promise<{ bytes: Buffer; fileName: string }> {
  const res = await fetcher(url, { headers: headersFor(agent) });
  if (res.status !== 200) {
    throw new DownloadError(`${url} が ${res.status} を返しました（${agent} を名乗って）`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!looksLikeZip(bytes)) {
    throw new DownloadError(
      `${url} の中身が ZIP ではありません（${bytes.length}バイト・${res.headers.get("content-type") ?? "型なし"}）`
    );
  }
  return { bytes, fileName: zipFileName(res.headers.get("content-disposition"), res.url || url) };
}
