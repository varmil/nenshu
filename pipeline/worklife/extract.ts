/**
 * 女性活躍DBの全件CSVを、有報の掲載社に法人番号で突合して
 * `pipeline/data/worklife_2026.csv` を作る（W0・Issue #149）。
 *
 *   cd pipeline && npx tsx worklife/extract.ts
 *
 * **ZIP の取得は自動化しない。** ダウンロードURLに UUID が入っていて固定できないので、
 * 手で落としたものを `pipeline/worklife/source/` に置く（`docs/worklife/spec.md` 1.1）。
 * 置いたファイルの名前・sha256・行数は `manifest.json` に残す。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { forEachCsvRow, toCsv } from "./csv";
import {
  assertHeader,
  hasAnyMetric,
  normalizeRow,
  COL,
  type DroppedValue,
  type WorklifeRecord,
} from "./positivedb";
import { parseUnifiedCsv } from "../scripts/lib/csv";
import { makeId } from "../scripts/lib/slug";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)));
const PIPELINE = resolve(HERE, "..");
const SOURCE_DIR = resolve(HERE, "source");
const MANIFEST = resolve(HERE, "manifest.json");
const OUT_CSV = resolve(PIPELINE, "data/worklife_2026.csv");
/** 有報の掲載社数（＝CSV の行数）。E2（#173）で 1,867 → 2,961社になった。 */
const EXPECTED_COMPANY_COUNT = 2961;

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
    Array.from({ length: 5 }, (_, k) => units[k])
      .flatMap((u) => (u ? [u.unit, cell(u.value)] : ["", ""]));
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

function findSourceZip(): string {
  const zips = readdirSync(SOURCE_DIR).filter((f) => f.toLowerCase().endsWith(".zip"));
  if (zips.length !== 1) {
    throw new Error(
      `${SOURCE_DIR} に .zip をちょうど1つ置いてください（いまは${zips.length}個）。` +
        `女性活躍DBのオープンデータ（全件版）を手で落として置く（docs/worklife/spec.md 1.1）`
    );
  }
  return resolve(SOURCE_DIR, zips[0]);
}

export function extract() {
  const zipPath = findSourceZip();
  const bytes = readFileSync(zipPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // 有報側。突合キーは法人番号だけ（ADR-0009）
  const unified = parseUnifiedCsv(
    readFileSync(resolve(PIPELINE, "data/ranking_unified_2026.csv"), "utf-8")
  );
  if (unified.length !== EXPECTED_COMPANY_COUNT) {
    throw new Error(`有報は${EXPECTED_COMPANY_COUNT}社の想定ですが${unified.length}社でした`);
  }
  const idByNumber = new Map<string, string>();
  for (const row of unified) {
    if (!row.corporateNumber) {
      throw new Error(
        `${row.name} に corporate_number がありません。` +
          `先に unified.py --backfill-corporate-number を回す（ADR-0009）`
      );
    }
    idByNumber.set(row.corporateNumber, makeId(row));
  }

  // 女性活躍DB側。要る掲載社ぶんだけ拾い、残りはその場で捨てる
  const text = execFileSync("unzip", ["-p", zipPath], { maxBuffer: 512 * 1024 * 1024 }).toString("utf-8");
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
  if (!headerChecked) throw new Error("女性活躍DBのCSVが空です");

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
    if (record.overtimeAll !== null || record.overtimeUnits.some((u) => u.value !== null)) filled.overtime++;
    if (record.paidLeaveAll !== null || record.paidLeaveUnits.some((u) => u.value !== null)) filled.paidLeave++;
    if (record.wageGapAll !== null) filled.wageGap++;
    if (record.wageGapNote !== "") filled.note++;
    rows.push(toRow(makeId(row), record));
  }

  writeFileSync(OUT_CSV, toCsv([[...WORKLIFE_HEADER], ...rows]), "utf-8");
  writeFileSync(
    MANIFEST,
    JSON.stringify(
      {
        source: "厚生労働省 女性の活躍推進企業データベース オープンデータ（全件版）",
        url: "https://positive-ryouritsu.mhlw.go.jp/positivedb/opendata/",
        file: basename(zipPath),
        sha256,
        bytes: bytes.length,
        fetchedAt: statSync(zipPath).mtime.toISOString().slice(0, 10),
        sourceRows,
        matched: picked.size,
        written: rows.length,
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );

  return { zipPath, sha256, sourceRows, matched: picked.size, written: rows.length, withoutMetrics, filled, dropped };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const r = extract();
  const pct = (n: number) => `${((n / EXPECTED_COMPANY_COUNT) * 100).toFixed(1)}%`;
  console.log(`${basename(r.zipPath)}  sha256 ${r.sha256.slice(0, 16)}…  ${r.sourceRows}行`);
  console.log(`法人番号で突合: ${r.matched}社 (${pct(r.matched)})`);
  console.log(`  うち3指標のいずれも無い: ${r.withoutMetrics}社（行を作らない）`);
  console.log(`${OUT_CSV}: ${r.written}行`);
  const rate = (n: number) => `${n}社（突合比 ${((n / r.matched) * 100).toFixed(1)}% / 全社比 ${pct(n)}）`;
  console.log(`  平均残業時間        ${rate(r.filled.overtime)}`);
  console.log(`  年次有給休暇の取得率 ${rate(r.filled.paidLeave)}`);
  console.log(`  男女の賃金の差異    ${rate(r.filled.wageGap)}`);
  console.log(`  賃金の差異の注釈    ${rate(r.filled.note)}`);
  if (r.dropped.length > 0) {
    console.log(`\n落とした異常値 ${r.dropped.length}件:`);
    for (const d of r.dropped) console.log(`  ${d.name}（${d.corporateNumber}） ${d.field} = ${d.raw}`);
  }
}
