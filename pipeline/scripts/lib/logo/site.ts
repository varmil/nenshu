import { Candidate, parseSizes } from "./candidates";

/**
 * 公式サイトのHTMLから候補を集める。取るのは4種類。
 * - JSON-LD の Organization.logo
 * - ヘッダの中の `logo` を含む <img>
 * - <link rel="...icon"> と web app manifest の icons
 */
export function extractCandidates(html: string, baseUrl: string): Candidate[] {
  const out: Candidate[] = [];
  for (const url of jsonLdLogos(html)) push(out, "jsonld", url, baseUrl);
  for (const url of headerLogos(html, baseUrl)) push(out, "header", url, baseUrl);
  for (const c of iconLinks(html)) {
    const abs = absolute(c.url, baseUrl);
    if (abs) out.push({ ...c, url: abs });
  }
  return out;
}

/** manifest は別途取得するので、その参照だけ返す。 */
export function manifestUrl(html: string, baseUrl: string): string | null {
  for (const tag of html.match(/<link[^>]+>/gi) ?? []) {
    const rel = attr(tag, "rel")?.toLowerCase() ?? "";
    if (!rel.includes("manifest")) continue;
    const href = attr(tag, "href");
    if (href) return absolute(href, baseUrl);
  }
  return null;
}

export function manifestIcons(json: unknown, manifestHref: string): Candidate[] {
  const icons = (json as { icons?: unknown })?.icons;
  if (!Array.isArray(icons)) return [];
  const out: Candidate[] = [];
  for (const icon of icons) {
    const src = (icon as { src?: unknown })?.src;
    if (typeof src !== "string") continue;
    const abs = absolute(src, manifestHref);
    if (!abs) continue;
    out.push({
      source: "icon",
      url: abs,
      declared: parseSizes((icon as { sizes?: string }).sizes),
    });
  }
  return out;
}

/** HTMLに何も無かったときの決め打ち。 */
export function defaultIconCandidates(baseUrl: string): Candidate[] {
  const origin = safeOrigin(baseUrl);
  if (!origin) return [];
  return [
    { source: "icon", url: `${origin}apple-touch-icon.png`, declared: { w: 180, h: 180 } },
    { source: "icon", url: `${origin}favicon.ico` },
  ];
}

function push(out: Candidate[], source: Candidate["source"], url: string, baseUrl: string) {
  const abs = absolute(url, baseUrl);
  if (abs) out.push({ source, url: abs });
}

function jsonLdLogos(html: string): string[] {
  const out: string[] = [];
  const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    for (const node of flatten(parsed)) {
      const logo = (node as { logo?: unknown }).logo;
      if (typeof logo === "string" && logo.trim()) out.push(logo.trim());
      else if (logo && typeof logo === "object") {
        const url = (logo as { url?: unknown }).url;
        if (typeof url === "string" && url.trim()) out.push(url.trim());
      }
    }
  }
  return out;
}

function flatten(node: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 4 || !node) return [];
  if (Array.isArray(node)) return node.flatMap((n) => flatten(n, depth + 1));
  if (typeof node !== "object") return [];
  const obj = node as Record<string, unknown>;
  const graph = obj["@graph"];
  return [obj, ...(graph ? flatten(graph, depth + 1) : [])];
}

/**
 * ヘッダのロゴ。<header> があればその中、無ければ先頭 60,000 文字を見る。
 * `logo` を名前に持つ <img> だけを採る——ここを緩めると別会社のバナーを掴む。
 *
 * **囲っている <a> の行き先で仕分ける。** 名前に `logo` を持つ画像は自社ロゴとは限らない。
 * - SNS へ行く → 捨てる。クレスコの `logo-black1.png` は X のロゴで、twitter.com への
 *   リンクの中にあった。後ろへ回すだけでは、他の候補が全部落ちたときに自社ロゴとして出る
 * - トップページへ行く → 先に試す。ヘッダのロゴはトップへ戻るリンクになっている
 * - それ以外（下層ページ・リンクの外） → 後で試す。関連サービスのロゴがここに来る
 *
 * **トップかどうかはホストを問わずパスだけで見る。** ロゴが別ホストのトップを指すサイトが
 * 実在する（コニカミノルタは CDN 配信のHTMLから `kmbs.konicaminolta.us` へリンクしている）。
 * 別ホストというだけで捨てると、そこで本物のロゴを落とす。
 */
function headerLogos(html: string, baseUrl: string): string[] {
  const header = /<header[^>]*>([\s\S]*?)<\/header>/i.exec(html);
  const scope = header ? header[1] : html.slice(0, 60000);
  const home: string[] = [];
  const rest: string[] = [];
  let href: string | null = null;
  for (const m of scope.matchAll(/<a\b[^>]*>|<\/a\s*>|<img\b[^>]*>/gi)) {
    const tag = m[0];
    if (/^<\/a/i.test(tag)) {
      href = null;
      continue;
    }
    if (/^<a/i.test(tag)) {
      href = attr(tag, "href") ?? null;
      continue;
    }
    if (!/logo|ロゴ/i.test(tag)) continue;
    const src = attr(tag, "src") ?? attr(tag, "data-src") ?? attr(tag, "data-original");
    if (!src || src.startsWith("data:")) continue;
    const destination = linkDestination(href, baseUrl);
    if (destination === "social") continue;
    (destination === "home" ? home : rest).push(src);
  }
  return [...home, ...rest];
}

/**
 * ロゴを囲む <a> の行き先。href が無い・読めないときは「リンクの外」と同じ扱いにする。
 *
 * **いま見ているページ自身を指していれば、パスの形によらずトップとして扱う。**
 * 公式サイトのURLが `https://www.kddi.com/english/` のように深いことがあり、
 * パスの形だけで判定すると本物のロゴが後ろへ回る（KDDI は povo のロゴが先に来ていた）。
 */
export function linkDestination(
  href: string | null,
  baseUrl: string
): "home" | "other" | "social" {
  if (!href) return "other";
  const abs = absolute(href, baseUrl);
  if (!abs) return "other";
  let target: URL;
  let base: URL | null = null;
  try {
    target = new URL(abs);
  } catch {
    return "other";
  }
  try {
    base = new URL(baseUrl);
  } catch {
    base = null;
  }
  if (isSocial(target.host)) return "social";
  if (base && samePage(target, base)) return "home";
  return isHomePath(target.pathname) ? "home" : "other";
}

/** 同じページを指すか。`/ja/` と `/ja/index.html` は同じと見る。 */
function samePage(a: URL, b: URL): boolean {
  const host = (u: URL) => u.host.toLowerCase().replace(/^www\./, "");
  const path = (u: URL) => {
    const p = u.pathname.replace(/\/index\.\w+$/i, "/");
    return p.endsWith("/") ? p : `${p}/`;
  };
  return host(a) === host(b) && path(a) === path(b);
}

/**
 * SNS のホストか。**この一覧に無いものを捨てない**——「自社サイトではない」という理由で
 * 捨てると、別ホストへリンクしている本物のロゴまで落ちる。
 */
const SOCIAL_HOSTS = [
  "twitter.com",
  "x.com",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "linkedin.com",
  "line.me",
  "lin.ee",
  "tiktok.com",
  "threads.net",
  "threads.com",
  "note.com",
  "wantedly.com",
  "pinterest.com",
  "weibo.com",
  "mixi.jp",
  "ameblo.jp",
  "github.com",
];

function isSocial(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return SOCIAL_HOSTS.some((s) => h === s || h.endsWith(`.${s}`));
}

/**
 * トップページらしいパスか。`/`・`/index.html`・`/ja/`・`/ja.html` を通す。
 * 1段だけのパスは言語コードの長さ（2〜5文字）に限る——`/products.html` を通さないため。
 */
function isHomePath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (/^index\.\w+$/i.test(segments[segments.length - 1] ?? "")) segments.pop();
  if (segments.length === 0) return true;
  return segments.length === 1 && /^[a-z-]{2,5}(\.\w+)?$/i.test(segments[0]);
}

function iconLinks(html: string): Candidate[] {
  const out: Candidate[] = [];
  for (const tag of html.match(/<link[^>]+>/gi) ?? []) {
    const rel = attr(tag, "rel")?.toLowerCase() ?? "";
    if (!rel.includes("icon")) continue;
    const href = attr(tag, "href");
    if (!href || href.startsWith("data:")) continue;
    const declared = parseSizes(attr(tag, "sizes"));
    out.push({
      source: "icon",
      url: href,
      // apple-touch-icon は既定で180px相当として扱い、favicon より先に試す
      declared: declared ?? (rel.includes("apple") ? { w: 180, h: 180 } : undefined),
    });
  }
  return out;
}

export function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = re.exec(tag);
  if (!m) return undefined;
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/");
}

export function absolute(url: string, baseUrl: string): string | null {
  try {
    const u = new URL(url, baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function safeOrigin(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).origin + "/";
  } catch {
    return null;
  }
}
