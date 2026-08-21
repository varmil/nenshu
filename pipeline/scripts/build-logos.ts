import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUnifiedCsv } from "./lib/csv";
import { makeId } from "./lib/slug";
import { Fetcher, mapLimit } from "./lib/logo/fetcher";
import { readEdinetCodeZip } from "./lib/logo/houjin";
import { lookupByHoujin, WikidataHit } from "./lib/logo/wikidata";
import { readToken, lookupUrls } from "./lib/logo/gbiz";
import { fetchInfo, titleFromP154, CommonsInfo } from "./lib/logo/commons";
import {
  extractCandidates,
  manifestUrl,
  manifestIcons,
  defaultIconCandidates,
} from "./lib/logo/site";
import { Candidate, sortCandidates } from "./lib/logo/candidates";
import { probe, reject, normalize, looksLikeSvg, icoToImage, ImageProbe } from "./lib/logo/image";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = resolve(ROOT, "logo-cache");
const EXPECTED_ROW_COUNT = 1867;
const MIN_WITH_LOGO = 1400;
const MAX_FILE_BYTES = 20 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const MAX_ATTEMPTS_PER_COMPANY = 6;

export type LogoEntry = {
  w: number;
  h: number;
  src: "commons" | "jsonld" | "header" | "icon";
  from: string;
  lic?: string;
  by?: string;
  attr?: boolean;
};

export type LogosJson = {
  meta: {
    generatedAt: string;
    count: number;
    withLogo: number;
    bySource: Record<string, number>;
    missReasons: Record<string, number>;
    rejectReasons: Record<string, number>;
  };
  byId: Record<string, LogoEntry>;
};

type Company = { id: string; name: string; houjin: string };

async function main() {
  const outDir = argValue("--out") ?? "../web/public";
  const limit = Number(argValue("--limit") ?? "0");
  const publicDir = resolve(ROOT, outDir);
  mkdirSync(CACHE, { recursive: true });
  const fetcher = new Fetcher(CACHE);

  // 1. 名寄せの土台
  const rows = parseUnifiedCsv(readFileSync(resolve(ROOT, "data/ranking_unified_2026.csv"), "utf-8"));
  if (rows.length !== EXPECTED_ROW_COUNT) {
    throw new Error(`${EXPECTED_ROW_COUNT}行の想定ですが${rows.length}行でした`);
  }
  const houjinByEdinet = readEdinetCodeZip(resolve(ROOT, "salary35/Edinetcode.zip"));
  const companies: Company[] = rows.map((row) => {
    const houjin = houjinByEdinet.get(row.edinetCode) ?? "";
    if (!houjin) throw new Error(`${row.name}（${row.edinetCode}）の法人番号がありません`);
    return { id: makeId(row), name: row.name, houjin };
  });
  const targets = limit > 0 ? companies.slice(0, limit) : companies;
  console.log(`対象 ${targets.length} 社`);

  // 2. 外部の索引（結果はキャッシュに残し、やり直しで叩き直さない）
  const index = await buildIndex(fetcher, targets);

  // 3. Commons の情報
  const titles = new Map<string, string>();
  for (const c of targets) {
    const logo = index.wikidata[c.houjin]?.logo;
    const title = logo ? titleFromP154(logo) : null;
    if (title) titles.set(c.id, title);
  }
  const commons = await fetchInfo(fetcher, [...new Set(titles.values())]);
  console.log(`Commons のロゴ ${titles.size} 件・情報が取れたもの ${commons.size} 件`);

  // 4〜5. 候補を集めて実体を取る
  const logosDir = resolve(publicDir, "logos");
  mkdirSync(logosDir, { recursive: true });
  mkdirSync(resolve(publicDir, "data"), { recursive: true });
  const entries: Record<string, LogoEntry> = {};
  const miss: Record<string, number> = { noUrl: 0, fetchFailed: 0, noCandidate: 0, allRejected: 0 };
  /** 全部落ちた会社について、候補が落ちた理由を数える。閾値を決め直すときの材料 */
  const rejectReasons: Record<string, number> = {};
  const written = new Set<string>();

  await mapLimit(
    targets,
    4,
    async (company) => {
      const hit = index.wikidata[company.houjin];
      const site = hit?.site ?? index.gbiz[company.houjin] ?? null;
      const commonsInfo = titles.has(company.id) ? commons.get(titles.get(company.id)!) : undefined;

      const candidates: Candidate[] = [];
      if (commonsInfo?.fileUrl) candidates.push({ source: "commons", url: commonsInfo.fileUrl });
      if (site) candidates.push(...(await siteCandidates(fetcher, site)));

      if (candidates.length === 0) {
        miss[site ? "noCandidate" : "noUrl"]++;
        return;
      }

      const picked = await pick(fetcher, sortCandidates(candidates));
      if (!picked.ok) {
        miss.allRejected++;
        for (const reason of picked.reasons) {
          rejectReasons[reason] = (rejectReasons[reason] ?? 0) + 1;
        }
        return;
      }
      writeFileSync(resolve(logosDir, `${company.id}.webp`), picked.webp);
      written.add(`${company.id}.webp`);
      entries[company.id] = {
        w: picked.probe.w,
        h: picked.probe.h,
        src: picked.candidate.source,
        from: commonsInfo && picked.candidate.source === "commons"
          ? commonsInfo.descriptionUrl
          : picked.candidate.url,
        ...(picked.candidate.source === "commons" && commonsInfo
          ? { lic: commonsInfo.license, by: commonsInfo.author, attr: commonsInfo.needsAttribution }
          : {}),
      };
    },
    (done, total) => {
      if (done % 100 === 0 || done === total) console.log(`  ロゴ取得 ${done}/${total}`);
    }
  );

  // 6. 索引を書いて検証する
  const bySource: Record<string, number> = { commons: 0, jsonld: 0, header: 0, icon: 0 };
  for (const e of Object.values(entries)) bySource[e.src]++;
  const json: LogosJson = {
    meta: {
      generatedAt: new Date().toISOString(),
      count: targets.length,
      withLogo: Object.keys(entries).length,
      bySource,
      missReasons: miss,
      rejectReasons,
    },
    byId: entries,
  };
  writeFileSync(resolve(publicDir, "data/logos.json"), JSON.stringify(json));
  pruneOrphans(logosDir, written);

  const ids = new Set(companies.map((c) => c.id));
  validate(json, ids, logosDir, limit > 0);
  report(json, targets.length);
}

async function buildIndex(fetcher: Fetcher, companies: readonly Company[]) {
  const path = resolve(CACHE, "index.json");
  if (existsSync(path)) {
    const cached = JSON.parse(readFileSync(path, "utf-8"));
    if (cached.count === companies.length) {
      console.log("外部の索引はキャッシュから読みました");
      return cached as { count: number; wikidata: Record<string, WikidataHit>; gbiz: Record<string, string> };
    }
  }
  const houjinNumbers = companies.map((c) => c.houjin);
  console.log("Wikidata に問い合わせています…");
  const wikidata = await lookupByHoujin(fetcher, houjinNumbers);
  const missing = houjinNumbers.filter((n) => !wikidata.get(n)?.site);
  console.log(`Wikidata 到達 ${wikidata.size} 社・URLが無いのは ${missing.length} 社`);

  const token = readToken(resolve(ROOT, "salary35/.gbiz_key"));
  if (!token) console.log("gBizINFO のトークンが無いので、この工程は飛ばします");
  const gbiz = await lookupUrls(fetcher, token, missing);
  console.log(`gBizINFO で ${gbiz.size} 社のURLが埋まりました`);

  const index = {
    count: companies.length,
    wikidata: Object.fromEntries(wikidata),
    gbiz: Object.fromEntries(gbiz),
  };
  writeFileSync(path, JSON.stringify(index));
  return index;
}

async function siteCandidates(fetcher: Fetcher, site: string): Promise<Candidate[]> {
  const res = await fetcher.get(site);
  if (res.status !== 200 || res.body.length === 0) return [];
  const html = res.body.toString("utf-8");
  const base = res.url || site;
  const out = extractCandidates(html, base);
  const manifest = manifestUrl(html, base);
  if (manifest) {
    const m = await fetcher.get(manifest);
    if (m.status === 200) {
      try {
        out.push(...manifestIcons(JSON.parse(m.body.toString("utf-8")), m.url || manifest));
      } catch {
        // manifest が JSON でないことがある。候補が減るだけなので黙って続ける
      }
    }
  }
  out.push(...defaultIconCandidates(base));
  return out;
}

type Picked =
  | { ok: true; candidate: Candidate; probe: ImageProbe; webp: Buffer }
  | { ok: false; reasons: string[] };

async function pick(fetcher: Fetcher, candidates: readonly Candidate[]): Promise<Picked> {
  let attempts = 0;
  const reasons: string[] = [];
  for (const candidate of candidates) {
    if (attempts >= MAX_ATTEMPTS_PER_COMPANY) break;
    attempts++;
    const res = await fetcher.get(candidate.url);
    if (res.status !== 200 || res.body.length === 0) {
      reasons.push(`http:${res.status}`);
      continue;
    }
    const svg = looksLikeSvg(res.body);
    // sharp は ICO を読めないので、中の最大の絵に開いてから渡す
    const body = (await icoToImage(res.body)) ?? res.body;
    const p = await probe(body);
    if (!p) {
      reasons.push("notImage");
      continue;
    }
    const rejected = await reject(body, p);
    if (rejected) {
      reasons.push(rejected);
      continue;
    }
    try {
      // 20KBを超えたら画質を落として入れ直す。捨てるのは最後の手段にする
      let webp = await normalize(body, svg);
      for (const quality of [58, 40]) {
        if (webp.length <= MAX_FILE_BYTES) break;
        webp = await normalize(body, svg, quality);
      }
      if (webp.length > MAX_FILE_BYTES) {
        reasons.push("tooHeavy");
        continue;
      }
      return { ok: true, candidate, probe: p, webp };
    } catch {
      reasons.push("normalizeFailed");
      continue;
    }
  }
  return { ok: false, reasons };
}

function pruneOrphans(logosDir: string, keep: Set<string>) {
  for (const file of readdirSync(logosDir)) {
    if (!keep.has(file)) rmSync(resolve(logosDir, file));
  }
}

export function validate(json: LogosJson, ids: Set<string>, logosDir: string, partial: boolean) {
  for (const [id, e] of Object.entries(json.byId)) {
    if (!ids.has(id)) throw new Error(`AC-5: ${id} は companies.json に無い企業IDです`);
    if (!e.w || !e.h || !e.src || !e.from) throw new Error(`AC-2: ${id} の記録が欠けています`);
    if (!existsSync(resolve(logosDir, `${id}.webp`))) {
      throw new Error(`AC-5: ${id} の画像がありません`);
    }
  }
  let total = 0;
  for (const file of readdirSync(logosDir)) {
    const size = readFileSync(resolve(logosDir, file)).length;
    if (size > MAX_FILE_BYTES) throw new Error(`AC-6: ${file} が ${size} バイトあります`);
    total += size;
  }
  if (total > MAX_TOTAL_BYTES) throw new Error(`AC-6: 合計 ${total} バイトは上限を超えます`);
  if (!partial && json.meta.withLogo < MIN_WITH_LOGO) {
    throw new Error(`AC-3: ロゴを持つ会社が ${json.meta.withLogo} 社しかありません`);
  }
}

function report(json: LogosJson, total: number) {
  const { withLogo, bySource, missReasons } = json.meta;
  console.log(`\n=== ロゴあり ${withLogo}/${total} = ${((withLogo / total) * 100).toFixed(1)}%`);
  console.log("出典の内訳:", bySource);
  console.log("落ちた理由:", missReasons);
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
