/**
 * 英字社名から公式サイトのドメインを組み立て、取れたページがその会社のものかを検める。
 *
 * **これは測定のための道具で、`build-logos.ts` の経路には入っていない**（L2・Issue #243）。
 * 採否が決まるまでは、ここが本番のロゴ調達に影響しないことが前提になる。
 */

/**
 * 法人格・組織形態を表す語。**ドメインには現れないので落とす。**
 * `Holdings` を落とすのは、`kioxia.com`（`Kioxia Holdings Corporation`）のように
 * 持株会社でも中核の名前でドメインを取るのが普通だから。
 */
const ORG_WORDS = new Set([
  "co", "co.", "ltd", "ltd.", "inc", "inc.", "corp", "corp.", "corporation",
  "company", "limited", "holdings", "holding", "group", "kk", "k.k.",
  "incorporated", "llc", "plc",
]);

/** 語に割らずに落とす飾り。`&` は `and` にせず落とす（両方を候補にすると数が倍になる）。 */
function words(englishName: string): string[] {
  return englishName
    .toLowerCase()
    .replace(/[.,()"'`]/g, " ")
    .split(/[\s&\-_/]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => !ORG_WORDS.has(w))
    .filter((w) => /^[a-z0-9]+$/.test(w));
}

/**
 * **上から順に試す前提の並び。** 実測で当たったのは短いほうから——
 * `Kioxia Holdings Corporation` は `kioxia.com`（先頭語1つ）で当たる。
 *
 * **候補を増やしすぎない。** 1社あたりの取得回数がそのまま他社のサーバーへの負荷になるし、
 * **候補が多いほど「たまたま実在した無関係なドメイン」を踏む確率が上がる**——
 * precision を下げる方向に効く。`LIMIT` で頭を切る。
 */
const TLDS = ["co.jp", "com", "jp"] as const;
export const LIMIT = 6;

export function domainCandidates(englishName: string, limit = LIMIT): string[] {
  const w = words(englishName);
  if (w.length === 0) return [];

  // 語のつなぎ方。**先頭語だけ**を先に置くのは、実測でそこが一番当たるため
  const stems: string[] = [w[0]];
  if (w.length > 1) {
    stems.push(w.join(""), w.join("-"));
    // 2語目までの略（`Nippon Steel Trading` → `nst`）は当てにならないので作らない
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const tld of TLDS) {
    for (const stem of stems) {
      if (stem.length < 2) continue;
      const host = `${stem}.${tld}`;
      if (seen.has(host)) continue;
      seen.add(host);
      out.push(host);
    }
  }
  return out.slice(0, limit);
}

/** 突き合わせはホスト名で行う。`www.` と大文字小文字は無視する。 */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** 同じサイトと見なすか。`example.co.jp` と `www.example.co.jp` は同じ。 */
export function sameSite(a: string, b: string): boolean {
  const ha = hostOf(a), hb = hostOf(b);
  return ha !== null && ha === hb;
}

/**
 * 取れたページがその会社のものかを検める。**precision はここで決まる。**
 *
 * **実在するだけでは通さない。** 推定したドメインは高い確率で誰かのサイトに当たる——
 * 別の会社・ドメイン売却のパーキングページ・検索結果ページのどれかである。
 * **社名がページに現れることを条件にする**のは、それが「この会社のサイトだ」と言える
 * 最低限だからで、これを緩めた瞬間に**別の会社のロゴを企業ページに出す**（#220）。
 *
 * 見るのは3か所。`<title>`・JSON-LD の `name`・コピーライト行。
 * **本文全体は見ない**——取引先や親会社の名前が本文に出るだけで通ってしまう。
 */
const COPYRIGHT = /(?:copyright|\(c\)|&copy;|©)[^<]{0,120}/gi;

export function verifySite(
  html: string,
  names: { ja: string; en: string },
  guessedHost?: string
): boolean {
  const hay = [titleOf(html), ...jsonLdNames(html), ...copyrightLines(html)]
    .filter(Boolean)
    .map((s) => normalize(stripHost(s!, guessedHost)));
  if (hay.length === 0) return false;
  // **照合するのは和文社名だけ。** 英字名も見ていた頃は、同じ英単語を持つ海外の会社を
  // 拾っていた（ワークマン → Workman Publishing の hachettebookgroup.com、
  // ルネサンス → renaissance.com、エイチ・アイ・エス → his.com）。
  // **日本の上場企業の公式サイトなら、和文社名が `<title>` かコピーライトに出る。**
  const needle = normalize(coreJa(names.ja));
  if (needle.length < 2) return false;
  return hay.some((h) => h.includes(needle));
}

/**
 * **推定に使ったドメイン名を照合の前に取り除く。**
 * ドメイン売却のパーキングページは `<社名>.com is for sale` と書くので、
 * 社名がそのまま `<title>` に現れる——実測で `hugedomains.com` が5件・
 * `forsale.dynadot.com` が1件、これで検証を通っていた。
 * **ドメイン名の再掲は「その会社のサイトである」証拠にならない。**
 */
function stripHost(text: string, host: string | undefined): string {
  if (!host) return text;
  const labels = host.toLowerCase().split(".").filter((l) => l.length >= 2);
  let out = text;
  for (const l of labels) out = out.replace(new RegExp(escapeRe(l), "gi"), " ");
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleOf(html: string): string | null {
  const m = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html);
  return m ? stripTags(m[1]) : null;
}

/** JSON-LD の `name`。`Organization` に限らない——`WebSite` に入れている会社がある。 */
function jsonLdNames(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      collectNames(JSON.parse(m[1]), out);
    } catch {
      // JSON-LD が壊れている会社がある。候補が減るだけなので黙って続ける
    }
  }
  return out;
}

function collectNames(node: unknown, out: string[], depth = 0): void {
  if (depth > 6 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const v of node) collectNames(v, out, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if ((k === "name" || k === "legalName" || k === "alternateName") && typeof v === "string") {
      out.push(v);
    } else {
      collectNames(v, out, depth + 1);
    }
  }
}

function copyrightLines(html: string): string[] {
  return [...stripTags(html).matchAll(COPYRIGHT)].map((m) => m[0]);
}

function stripTags(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

/**
 * **法人格と飾りを落として比べる。** 「株式会社ほくほくフィナンシャルグループ」が
 * `<title>` では「ほくほくフィナンシャルグループ」になっていることがあり、
 * 全角・半角や中黒の有無も揺れる。
 */
function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s・･.,()"'`\-_&|/\\[\]{}【】「」（）]/g, "");
}

/** 和文社名から法人格を落とす。前株・後株の両方がある。 */
export function coreJa(name: string): string {
  return name
    .replace(/^(株式会社|有限会社|合同会社|合資会社|合名会社)/, "")
    .replace(/(株式会社|有限会社|合同会社|合資会社|合名会社)$/, "")
    .trim();
}

/** 英字社名から法人格語を落とす。候補を作るときと同じ表を使う。 */
export function coreEn(name: string): string {
  return words(name).join("");
}
