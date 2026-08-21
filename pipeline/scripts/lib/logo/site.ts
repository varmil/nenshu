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
  for (const url of headerLogos(html)) push(out, "header", url, baseUrl);
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
 */
function headerLogos(html: string): string[] {
  const header = /<header[^>]*>([\s\S]*?)<\/header>/i.exec(html);
  const scope = header ? header[1] : html.slice(0, 60000);
  const out: string[] = [];
  for (const tag of scope.match(/<img[^>]+>/gi) ?? []) {
    const looksLikeLogo = /logo|ロゴ/i.test(tag);
    if (!looksLikeLogo) continue;
    const src = attr(tag, "src") ?? attr(tag, "data-src") ?? attr(tag, "data-original");
    if (src && !src.startsWith("data:")) out.push(src);
  }
  return out;
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
