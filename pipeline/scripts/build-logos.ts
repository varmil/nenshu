import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUnifiedCsv } from "./lib/csv";
import { makeId } from "./lib/slug";
import { Fetcher, mapLimit } from "./lib/logo/fetcher";
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
import {
  probe,
  reject,
  normalize,
  looksLikeSvg,
  icoToImage,
  blankOnLight,
  ImageProbe,
} from "./lib/logo/image";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = resolve(ROOT, "logo-cache");
const EXPECTED_ROW_COUNT = 2961;
/**
 * ロゴを持つ会社の下限（AC-3）。**気づくための線であって目標ではない。**
 * E2（#173）で母集団が 1,867 → 2,961社になったぶん、新しく入った会社の到達率が
 * 揃うまでは全体の率が下がる。**社数で置く**——率で置くと、母集団が動いたときに
 * 「何社ぶん取れなくなったか」が読めない。
 */
const MIN_WITH_LOGO = 2300;
const MAX_FILE_BYTES = 20 * 1024;
// 実測 8.8MB（1,625社ぶん・1枚平均5.4KB）。**E2 で母集団が1.59倍になったので
// 上限も引き上げる**——1枚あたりの大きさは `MAX_FILE_BYTES` が別に見ている。
const MAX_TOTAL_BYTES = 18 * 1024 * 1024;
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
    /** 母集団の社数（＝CSV の行数）。**今回叩いた社数ではない。** */
    count: number;
    withLogo: number;
    bySource: Record<string, number>;
    /**
     * ロゴが1枚も取れなかった理由の内訳。**`--only` で回したときは対象社ぶんだけ**
     * を数えるので、母集団ぜんぶの内訳にはならない。そのことは `partialOf` が示す。
     */
    missReasons: Record<string, number>;
    rejectReasons: Record<string, number>;
    /**
     * `--only` で回したときの対象社数（E3・#175）。**`missReasons` と
     * `rejectReasons` はこの社数に対する内訳**で、母集団ぜんぶのものではない。
     * 全社を回したときは付かない。
     */
    partialOf?: number;
  };
  byId: Record<string, LogoEntry>;
};

type Company = { id: string; name: string; houjin: string };

async function main() {
  const outDir = argValue("--out") ?? "../web/public";
  const limit = Number(argValue("--limit") ?? "0");
  const only = argValue("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const publicDir = resolve(ROOT, outDir);
  mkdirSync(CACHE, { recursive: true });
  const fetcher = new Fetcher(CACHE);

  // 1. 名寄せの土台
  const rows = parseUnifiedCsv(readFileSync(resolve(ROOT, "data/ranking_unified_2026.csv"), "utf-8"));
  if (rows.length !== EXPECTED_ROW_COUNT) {
    throw new Error(`${EXPECTED_ROW_COUNT}行の想定ですが${rows.length}行でした`);
  }
  // 法人番号は CSV の `corporate_number` 列から引く（W0・ADR-0009）。
  // **`Edinetcode.zip` を別途読まない**——同じ列を2箇所から引くと、片方だけ古い
  // スナップショットを見る状態を作れてしまう。値が一致することは確認済み（全1,867社）。
  const companies: Company[] = rows.map((row) => {
    if (!row.corporateNumber) {
      throw new Error(`${row.name}（${row.edinetCode}）の法人番号がありません`);
    }
    return { id: makeId(row), name: row.name, houjin: row.corporateNumber };
  });
  const targets = only
    ? pickOnly(companies, only)
    : limit > 0
      ? companies.slice(0, limit)
      : companies;
  console.log(`対象 ${targets.length} 社`);

  // `--only` は既存の索引に上書きする。**前回の全周の結果を捨てない**——1社を取り直すために
  // 1,867社を叩き直すと、gBizINFO のトークンが無い環境では147社ぶんのURLが引けず到達率が落ちる。
  const previous = only ? readPrevious(publicDir) : null;

  // 2. 外部の索引（結果はキャッシュに残し、やり直しで叩き直さない）
  const index = await buildIndex(fetcher, targets, Boolean(only));

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
  const dropped = new Set<string>();
  for (const company of targets) {
    if (entries[company.id] || !previous?.byId[company.id]) continue;
    // 取れなかった会社は既存の記録を残す。消すと、直しに来たはずが画像を1枚減らして帰ることになる。
    // **ただし残すのは、いま配っている画像がいまの判定を通るときだけ。** 通らないものを残すと、
    // 直しに来た当の対象をそのまま置いて帰ることになる（Issue #156 の白いロゴがこれ）
    const file = resolve(logosDir, `${company.id}.webp`);
    if (existsSync(file) && (await blankOnLight(readFileSync(file)))) {
      console.warn(`  ${company.id}（${company.name}）は代わりが無いので記録を消します（頭文字に戻る）`);
      dropped.add(company.id);
      rmSync(file);
      continue;
    }
    console.warn(`  ${company.id}（${company.name}）は取れませんでした。前回の記録を残します`);
  }
  const carried = previous
    ? Object.fromEntries(Object.entries(previous.byId).filter(([id]) => !dropped.has(id)))
    : null;
  const byId = carried ? { ...carried, ...entries } : entries;
  const bySource: Record<string, number> = { commons: 0, jsonld: 0, header: 0, icon: 0 };
  for (const e of Object.values(byId)) bySource[e.src]++;
  const json: LogosJson = {
    meta: {
      generatedAt: new Date().toISOString(),
      // **母集団の社数。今回叩いた社数ではない。** 以前は部分実行のとき前回の値を
      // 引き継いでいたが、**E2（#173）で母集団そのものが 1,867 → 2,961社に変わった
      // ときに古い数が残った**（到達率が 2500/1867 = 133.9% と出た）。CSV の行数は
      // 部分実行でも変わらないので、そこから引けばよい。
      count: companies.length,
      withLogo: Object.keys(byId).length,
      bySource,
      // **落ちた理由は「回した社数」に対する内訳。** 部分実行では前回の値を残すのを
      // やめた——E3（#175）で1,336社を回したとき、旧母集団の231件がそのまま残り、
      // 実際の欠け（461社）と食い違った。今回のぶんを入れ、`partialOf` で
      // 「何社を回した内訳か」が読めるようにする。
      missReasons: miss,
      rejectReasons,
      ...(only ? { partialOf: targets.length } : {}),
    },
    byId,
  };
  writeFileSync(resolve(publicDir, "data/logos.json"), JSON.stringify(json));
  // 部分実行では対象外の画像が全部「余り」に見えるので掃除しない
  if (!only) pruneOrphans(logosDir, written);

  const ids = new Set(companies.map((c) => c.id));
  validate(json, ids, logosDir, limit > 0);
  report(json, json.meta.count);
}

function pickOnly(companies: readonly Company[], ids: readonly string[]): Company[] {
  const byId = new Map(companies.map((c) => [c.id, c]));
  return ids.map((id) => {
    const hit = byId.get(id);
    if (!hit) throw new Error(`--only: ${id} は companies に無い企業IDです`);
    return hit;
  });
}

function readPrevious(publicDir: string): LogosJson | null {
  const path = resolve(publicDir, "data/logos.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as LogosJson;
}

async function buildIndex(fetcher: Fetcher, companies: readonly Company[], partial: boolean) {
  // 部分実行の索引を全周のキャッシュに被せない。被せると、次の全周が
  // 「1社ぶんの索引」を再利用できないまま、残り1,866社を引き直すところから始まる
  const path = resolve(CACHE, partial ? "index-partial.json" : "index.json");
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

  const token = readToken(resolve(ROOT, "salary/.gbiz_key"));
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
      // 白いロゴは明るい器の上で空白のマス目になる（Issue #156）。**画質を落とす前に見る**——
      // 白いことは画質と関わりが無いので、落として入れ直しても結論は変わらない
      if (await blankOnLight(webp)) {
        reasons.push("blankOnLight");
        continue;
      }
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
  const { withLogo, bySource, missReasons, partialOf } = json.meta;
  console.log(`\n=== ロゴあり ${withLogo}/${total} = ${((withLogo / total) * 100).toFixed(1)}%`);
  console.log("出典の内訳:", bySource);
  // **内訳は「回した社数」に対する値。** 全社を回していないときは分母を明示する
  // ——さもないと母集団に対する欠けの内訳として読まれる。
  console.log(`落ちた理由${partialOf === undefined ? "" : `（${partialOf}社を回したぶん）`}:`, missReasons);
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
