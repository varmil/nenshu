/**
 * L2（Issue #243）: 英字社名からの公式サイト推定の recall / precision を測る。
 *
 * **これは測定であって、成果物（`logos.json`・`web/public/logos/`）を書き換えない。**
 * 採否が決まるまで `build-logos.ts` の経路にも入れない。
 *
 * 使い方:
 *   npx tsx scripts/measure-site-guess.ts --sample 500   … 正解のある集団で測る
 *   npx tsx scripts/measure-site-guess.ts --apply        … ロゴが無い会社に当てて見込みを出す
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import zlib from "node:zlib";
import { Fetcher, fetchSite, mapLimit } from "./lib/logo/fetcher";
import { lookupByHoujin } from "./lib/logo/wikidata";
import { readToken, lookupUrls } from "./lib/logo/gbiz";
import { domainCandidates, verifySite, sameSite, hostOf } from "./lib/logo/guess";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "logo-cache");

/** **乱数の種を固定する。** 同じ標本を後から再現できないと、測り直しが別の実験になる。 */
const SEED = 20260828;
function shuffled<T>(items: readonly T[], seed: number): T[] {
  // mulberry32。標本の抽出にしか使わないので暗号強度は要らない
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type Company = { id: string; nameJa: string; nameEn: string; houjin: string };

function loadCompanies(): Company[] {
  const csv = readFileSync(resolve(ROOT, "data/ranking_unified_2026.csv"), "utf-8").split("\n");
  const h = csv[0].split(",");
  const iSec = h.indexOf("sec_code"), iEd = h.indexOf("edinet_code");
  const iName = h.indexOf("name"), iCorp = h.indexOf("corporate_number");
  const en = loadEnglishNames();
  const out: Company[] = [];
  for (const l of csv.slice(1)) {
    if (!l) continue;
    const f = l.split(",");
    const id = f[iSec] || f[iEd];
    if (!id) continue;
    out.push({ id, nameJa: f[iName], nameEn: en.get(f[iEd]) ?? "", houjin: f[iCorp] });
  }
  return out;
}

/** EDINETコード一覧の `提出者名（英字）`。**候補の元になる唯一の材料。** */
function loadEnglishNames(): Map<string, string> {
  const path = resolve(OUT, "Edinetcode.zip");
  if (!existsSync(path)) {
    throw new Error(
      `${path} がありません。https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip を置いてください`
    );
  }
  // ZIP の中身は1ファイル。deflate を自前で開く（依存を足さない）
  const buf = readFileSync(path);
  const raw = unzipSingle(buf);
  const rows = parseCsv(raw.toString("latin1"));
  const decoded = parseCsv(decodeCp932(raw));
  const hdr = decoded[1];
  const iEd = hdr.indexOf("ＥＤＩＮＥＴコード"), iEn = hdr.indexOf("提出者名（英字）");
  if (iEd < 0 || iEn < 0) throw new Error(`列が見つかりません: ${hdr.slice(0, 12).join(" / ")}`);
  const map = new Map<string, string>();
  for (const r of decoded.slice(2)) if (r.length > iEn) map.set(r[iEd], r[iEn].trim());
  void rows;
  return map;
}

function unzipSingle(zip: Buffer): Buffer {
  // ローカルファイルヘッダを1つ読む。EDINET の ZIP は1エントリ
  const nameLen = zip.readUInt16LE(26), extraLen = zip.readUInt16LE(28);
  const method = zip.readUInt16LE(8);
  const body = zip.subarray(30 + nameLen + extraLen);
  return method === 0 ? body : zlib.inflateRawSync(body);
}

function decodeCp932(buf: Buffer): string {
  return new TextDecoder("shift_jis").decode(buf);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** 推定の1社ぶん。候補を順に叩き、検証を通った最初のものを返す。 */
async function guessSite(fetcher: Fetcher, c: Company) {
  const tried: { host: string; status: number; verified: boolean }[] = [];
  for (const host of domainCandidates(c.nameEn)) {
    const res = await fetchSite(fetcher, `https://${host}/`);
    if (!res) { tried.push({ host, status: 0, verified: false }); continue; }
    const ok = verifySite(res.body.toString("utf-8"), { ja: c.nameJa, en: c.nameEn }, host);
    tried.push({ host, status: res.status, verified: ok });
    if (ok) return { guess: res.url || `https://${host}/`, tried };
  }
  return { guess: null as string | null, tried };
}

/** 二項比率の95%区間（Wilson）。**点推定だけを採否の根拠にしない。** */
function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const sampleSize = Number(args[args.indexOf("--sample") + 1]) || 500;

mkdirSync(OUT, { recursive: true });
const companies = loadCompanies();
const logos = JSON.parse(readFileSync(resolve(ROOT, "../web/public/data/logos.json"), "utf-8"));
const hasLogo = new Set<string>(Object.keys(logos.byId));

const fetcher = new Fetcher(resolve(OUT, "site-guess"));
console.log("Wikidata / gBizINFO に問い合わせています…");
const wd = await lookupByHoujin(fetcher, companies.map((c) => c.houjin));
const noSite = companies.filter((c) => !wd.get(c.houjin)?.site);
const gb = await lookupUrls(fetcher, readToken(resolve(ROOT, "salary/.gbiz_key")), noSite.map((c) => c.houjin));
const knownSite = (c: Company) => wd.get(c.houjin)?.site ?? gb.get(c.houjin) ?? null;

if (!apply) {
  // === 測定用: 正解（既知のURL）がある会社 ===
  const withTruth = companies.filter((c) => knownSite(c) && c.nameEn);
  const sample = shuffled(withTruth, SEED).slice(0, sampleSize);
  console.log(`正解のある会社 ${withTruth.length} 社から無作為 ${sample.length} 社（種 ${SEED}）`);

  let done = 0;
  const rows = await mapLimit(sample, 3, async (c) => {
    const { guess, tried } = await guessSite(fetcher, c);
    const truth = knownSite(c)!;
    if (++done % 50 === 0) console.log(`  ${done}/${sample.length}`);
    return { id: c.id, nameJa: c.nameJa, nameEn: c.nameEn, truth, guess, tried, correct: guess ? sameSite(guess, truth) : null };
  });

  const guessed = rows.filter((r) => r.guess);
  const correct = guessed.filter((r) => r.correct);
  const [rLo, rHi] = wilson(correct.length, rows.length);
  const [pLo, pHi] = wilson(correct.length, guessed.length);
  console.log("");
  console.log(`標本 ${rows.length} 社`);
  console.log(`推定できた: ${guessed.length} 社 / うち正解と一致: ${correct.length} 社`);
  console.log(`recall    = ${(correct.length / rows.length).toFixed(3)}  [${rLo.toFixed(3)}, ${rHi.toFixed(3)}]`);
  console.log(`precision = ${(correct.length / guessed.length).toFixed(3)}  [${pLo.toFixed(3)}, ${pHi.toFixed(3)}]`);
  console.log("");
  console.log("外した会社（precision を下げているもの）:");
  for (const r of guessed.filter((x) => !x.correct).slice(0, 30)) {
    console.log(`  ${r.id} ${r.nameJa} 正解=${hostOf(r.truth)} 推定=${hostOf(r.guess!)}`);
  }
  writeFileSync(resolve(OUT, "site-guess-measure.json"), JSON.stringify({ seed: SEED, rows }, null, 1));
} else {
  // === 判断用: ロゴが無く、URLもどこにも無い会社 ===
  const targets = companies.filter((c) => !hasLogo.has(c.id) && !knownSite(c) && c.nameEn);
  console.log(`ロゴもURLも無く英字名を持つ会社: ${targets.length} 社`);
  let done = 0;
  const rows = await mapLimit(targets, 3, async (c) => {
    const { guess } = await guessSite(fetcher, c);
    if (++done % 25 === 0) console.log(`  ${done}/${targets.length}`);
    return { id: c.id, nameJa: c.nameJa, nameEn: c.nameEn, guess };
  });
  const found = rows.filter((r) => r.guess);
  console.log("");
  console.log(`公式サイトを推定できた: ${found.length} 社 / ${targets.length} 社`);
  writeFileSync(resolve(OUT, "site-guess-apply.json"), JSON.stringify({ rows }, null, 1));
}
