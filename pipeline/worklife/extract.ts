/**
 * 女性活躍DBの全件CSVを、有報の掲載社に法人番号で突合して
 * `pipeline/data/worklife.csv` を作る（W0・Issue #149）。
 *
 *   cd pipeline && npm run extract:worklife
 *
 * **ZIP は定期実行が落とす**（`npm run update:worklife`・refresh の D7・#877）。この入口は
 * `pipeline/worklife/source/` に置かれた ZIP を読む——取り込みの規則だけを変えて回し直すとき
 * に使う。使った ZIP の名前・sha256・行数は `manifest.json` に残す。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { forEachCsvRow, toCsv } from "./csv";
import { jstDate, PAGE_URL } from "./download";
import {
  assertHeader,
  hasAnyMetric,
  normalizeRow,
  COL,
  type DroppedValue,
  type WorklifeRecord,
} from "./positivedb";
import { parseUnifiedCsv } from "../scripts/lib/csv";
import { companyIdOf, readLedger } from "../scripts/lib/ledger";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)));
const PIPELINE = resolve(HERE, "..");

/** 読み書きする場所。テストが一時ディレクトリに差し替える。 */
export type ExtractPaths = {
  sourceDir: string;
  manifest: string;
  outCsv: string;
  unifiedCsv: string;
  ledger: string;
};

export const DEFAULT_PATHS: ExtractPaths = {
  sourceDir: resolve(HERE, "source"),
  manifest: resolve(HERE, "manifest.json"),
  outCsv: resolve(PIPELINE, "data/worklife.csv"),
  unifiedCsv: resolve(PIPELINE, "data/ranking_unified.csv"),
  ledger: resolve(PIPELINE, "data/ledger.csv"),
};

/**
 * 突合できた社数が前の版からこの割合を超えて減ったら、その版を取り込まない（D7）。
 * 列がそろっていても中身の欠けた版を取り込むと、「データベースに登録していません」が
 * 大量に事実と違う文になる。割合はビルドの社数の線（`MAX_COUNT_DROP_RATIO`）と同じ。
 */
export const MAX_MATCHED_DROP_RATIO = 0.05;

/** 版そのものを取り込めない（列が違う・中身が欠けている）。前の版のまま残す。 */
export class RejectedSourceError extends Error {}

/** `manifest.json` の形。`rejected` は最後に落とした版があるときだけ持つ。 */
export type WorklifeManifest = {
  source: string;
  url: string;
  file: string;
  sha256: string;
  bytes: number;
  fetchedAt: string;
  sourceRows: number;
  matched: number;
  written: number;
  rejected?: { file: string; sha256: string; fetchedAt: string; reason: string };
};

export function readManifest(path: string = DEFAULT_PATHS.manifest): WorklifeManifest | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf-8")) as WorklifeManifest) : null;
}

export function writeManifest(path: string, manifest: WorklifeManifest) {
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

/** 出力の列。**注釈は改行・カンマ・引用符を含む**ので、書き出しは `toCsv` を通す。 */
export const WORKLIFE_HEADER = [
  "id",
  "corporate_number",
  "positivedb_name",
  "overtime_all",
  "overtime_scope",
  ...[1, 2, 3, 4, 5].flatMap((n) => [`overtime_unit${n}`, `overtime_unit${n}_hours`]),
  "paid_leave_all",
  ...[1, 2, 3, 4, 5].flatMap((n) => [`paid_leave_unit${n}`, `paid_leave_unit${n}_rate`]),
  "wage_gap_all",
  "wage_gap_regular",
  "wage_gap_nonregular",
  "wage_gap_period",
  "wage_gap_note",
  "as_of",
  "updated_at",
] as const;

const cell = (v: number | null) => (v === null ? "" : String(v));

export function toRow(id: string, r: WorklifeRecord): string[] {
  const unitCells = (units: WorklifeRecord["overtimeUnits"]) =>
    Array.from({ length: 5 }, (_, k) => units[k]).flatMap((u) =>
      u ? [u.unit, cell(u.value)] : ["", ""]
    );
  return [
    id,
    r.corporateNumber,
    r.positivedbName,
    cell(r.overtimeAll),
    r.overtimeScope,
    ...unitCells(r.overtimeUnits),
    cell(r.paidLeaveAll),
    ...unitCells(r.paidLeaveUnits),
    cell(r.wageGapAll),
    cell(r.wageGapRegular),
    cell(r.wageGapNonRegular),
    r.wageGapPeriod,
    r.wageGapNote,
    r.asOf,
    r.updatedAt,
  ];
}

function findSourceZip(sourceDir: string): string {
  const zips = existsSync(sourceDir)
    ? readdirSync(sourceDir).filter((f) => f.toLowerCase().endsWith(".zip"))
    : [];
  if (zips.length !== 1) {
    throw new Error(
      `${sourceDir} に .zip をちょうど1つ置いてください（いまは${zips.length}個）。` +
        `ふだんは npm run update:worklife が落として置く（docs/refresh/worklife-fetch/design.md）`
    );
  }
  return resolve(sourceDir, zips[0]);
}

/**
 * ZIP を取り込み、`worklife.csv` と `manifest.json` を書く。**書くのは検証が全部通った後だけ**
 * で、列が違う（`HeaderMismatchError`）・中身が欠けている（`RejectedSourceError`）版では
 * 何も書かずに投げる。
 *
 * `fetchedAt` は ZIP を落とした日（日本時間）。渡されなければ、前の manifest と同じ版なら
 * その日付を引き継ぎ、違えば ZIP の更新時刻の日付にする（手で置いた ZIP のとき）。
 */
export function extract(opts: { zipPath?: string; fetchedAt?: string; paths?: ExtractPaths } = {}) {
  const paths = opts.paths ?? DEFAULT_PATHS;
  const zipPath = opts.zipPath ?? findSourceZip(paths.sourceDir);
  const bytes = readFileSync(zipPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const previous = readManifest(paths.manifest);

  // 有報側。突合キーは法人番号だけ（ADR-0009）
  const unified = parseUnifiedCsv(readFileSync(paths.unifiedCsv, "utf-8"));
  // **社数は固定しない**（refresh の D0・#870）。毎日の更新で社数は動く。以前は 2,961 で
  // 決め打ちしており、1社動いただけで取り込みが落ちた。空の CSV だけは止める。
  if (unified.length === 0) throw new Error("ranking_unified.csv に会社がありません");
  // 企業 ID は更新台帳から引く（refresh の D2・ADR-0017）
  const ledger = readLedger(paths.ledger);
  const idByNumber = new Map<string, string>();
  for (const row of unified) {
    if (!row.corporateNumber) {
      throw new Error(
        `${row.name} に corporate_number がありません。` +
          `先に unified.py --backfill-corporate-number を回す（ADR-0009）`
      );
    }
    idByNumber.set(row.corporateNumber, companyIdOf(ledger, row));
  }

  // 女性活躍DB側。要る掲載社ぶんだけ拾い、残りはその場で捨てる
  const text = execFileSync("unzip", ["-p", zipPath], { maxBuffer: 512 * 1024 * 1024 }).toString(
    "utf-8"
  );
  const picked = new Map<string, string[]>();
  let sourceRows = 0;
  let headerChecked = false;
  forEachCsvRow(text, (row, index) => {
    if (index === 0) {
      assertHeader(row);
      headerChecked = true;
      return;
    }
    sourceRows++;
    const number = (row[COL.corporateNumber] ?? "").trim();
    if (!number || !idByNumber.has(number)) return;
    const prev = picked.get(number);
    // 同じ法人番号が複数行あれば最終更新日が新しいほうを採る（spec.md 1.2）
    if (prev === undefined || (row[COL.updatedAt] ?? "") > (prev[COL.updatedAt] ?? "")) {
      picked.set(number, row);
    }
  });
  if (!headerChecked) throw new RejectedSourceError("女性活躍DBのCSVが空です");
  // **版全体の壊れ方で止める**（D7）。1社ずつの値の動きでは止めない——自己申告値で、
  // 動いたときにどちらが正しいかを決める根拠が無い（W2 が 0 と 100 ちょうどしか落とさないのと同じ）
  if (previous && picked.size < previous.matched * (1 - MAX_MATCHED_DROP_RATIO)) {
    throw new RejectedSourceError(
      `法人番号で突合できた社数が前の版の${previous.matched}社から${picked.size}社に減りました` +
        `（${MAX_MATCHED_DROP_RATIO * 100}%を超える減少）。版の中身が欠けているのを疑って取り込みません`
    );
  }

  const dropped: DroppedValue[] = [];
  const rows: string[][] = [];
  const filled = { overtime: 0, paidLeave: 0, wageGap: 0, note: 0 };
  let withoutMetrics = 0;
  // 出力の並びは有報CSVと同じにする。会社の順序が2つのファイルで食い違わない
  for (const row of unified) {
    const source = picked.get(row.corporateNumber);
    if (source === undefined) continue;
    const { record, dropped: d } = normalizeRow(source);
    dropped.push(...d);
    if (!hasAnyMetric(record)) {
      withoutMetrics++;
      continue;
    }
    // 記入率は「全体」と「雇用管理区分ごと」の和集合で数える。
    // 片方だけを見ると4割落とす（docs/worklife/intent.md）
    if (record.overtimeAll !== null || record.overtimeUnits.some((u) => u.value !== null))
      filled.overtime++;
    if (record.paidLeaveAll !== null || record.paidLeaveUnits.some((u) => u.value !== null))
      filled.paidLeave++;
    if (record.wageGapAll !== null) filled.wageGap++;
    if (record.wageGapNote !== "") filled.note++;
    rows.push(toRow(companyIdOf(ledger, row), record));
  }

  const fetchedAt =
    opts.fetchedAt ??
    (previous?.sha256 === sha256 ? previous.fetchedAt : jstDate(statSync(zipPath).mtime));
  writeFileSync(paths.outCsv, toCsv([[...WORKLIFE_HEADER], ...rows]), "utf-8");
  // 取り込めたので、前に落とした版の記録（`rejected`）は持ち越さない
  writeManifest(paths.manifest, {
    source: "厚生労働省 女性の活躍推進企業データベース オープンデータ（全件版）",
    url: PAGE_URL,
    file: basename(zipPath),
    sha256,
    bytes: bytes.length,
    fetchedAt,
    sourceRows,
    matched: picked.size,
    written: rows.length,
  });

  return {
    zipPath,
    sha256,
    changed: previous?.sha256 !== sha256,
    sourceRows,
    companies: unified.length,
    matched: picked.size,
    written: rows.length,
    withoutMetrics,
    filled,
    dropped,
  };
}

/** 取り込みの結果を人が読む形で出す。`update.ts` も使う。 */
export function printExtractResult(r: ReturnType<typeof extract>, outCsv: string) {
  const pct = (n: number) => `${((n / r.companies) * 100).toFixed(1)}%`;
  console.log(`${basename(r.zipPath)}  sha256 ${r.sha256.slice(0, 16)}…  ${r.sourceRows}行`);
  console.log(`法人番号で突合: ${r.matched}社 (${pct(r.matched)})`);
  console.log(`  うち3指標のいずれも無い: ${r.withoutMetrics}社（行を作らない）`);
  console.log(`${outCsv}: ${r.written}行`);
  const rate = (n: number) =>
    `${n}社（突合比 ${((n / r.matched) * 100).toFixed(1)}% / 全社比 ${pct(n)}）`;
  console.log(`  平均残業時間        ${rate(r.filled.overtime)}`);
  console.log(`  年次有給休暇の取得率 ${rate(r.filled.paidLeave)}`);
  console.log(`  男女の賃金の差異    ${rate(r.filled.wageGap)}`);
  console.log(`  賃金の差異の注釈    ${rate(r.filled.note)}`);
  if (r.dropped.length > 0) {
    // **理由ごとにまとめる。** 0 を落とす規則（W2・#185）で件数が3桁になったので、
    // 平坦に並べると読めない。**それでも会社名は全部出す**——黙って消さない
    // （spec.md 1.4）のに、数だけ出して中身を隠しては同じことになる。
    console.log(`\n落とした異常値 ${r.dropped.length}件:`);
    const byReason = new Map<string, typeof r.dropped>();
    for (const d of r.dropped) {
      const key = `${d.reason}（${d.field.split(":")[0]}）`;
      const list = byReason.get(key) ?? [];
      list.push(d);
      byReason.set(key, list);
    }
    for (const [reason, list] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${reason}: ${list.length}件`);
      for (const d of list)
        console.log(`    ${d.name}（${d.corporateNumber}） ${d.field} = ${d.raw}`);
    }
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) printExtractResult(extract(), DEFAULT_PATHS.outCsv);
