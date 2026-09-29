import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../../worklife/csv";

/**
 * 更新台帳を読む側（refresh の D2・#872・`docs/refresh/ledger/design.md`）。**書くのは
 * `pipeline/ledger/ledger.py`**——ID を振るのも、入る条件（直近12か月）を見るのもあちら。
 * ビルドは台帳から ID を引き、出る条件（最後の有報から24か月）で母集団を絞るだけで、
 * **ID を振らない。**
 */

const DEFAULT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/ledger.csv");

/** 見出し。`ledger.py` の `COLUMNS` と同じ並び。**完全一致で検める。** */
export const LEDGER_COLUMNS = [
  "edinet_code",
  "id",
  "filed",
  "doc_numbers",
  "doc_description",
  "doc_analysis",
  "doc_pay_policy",
] as const;

/** 最後の有報の提出から、この月数がたったら母集団から外す（ADR-0018 決定2）。 */
export const EXIT_MONTHS = 24;

/** 工程。台帳は工程ごとに、反映した書類 ID を持つ（`docs/refresh/spec.md` 1.1）。 */
export type Stage = "numbers" | "description" | "analysis" | "payPolicy";

export interface LedgerEntry {
  edinetCode: string;
  /** 企業 ID。一度振ったら変えない（ADR-0017）。 */
  id: string;
  /** 最後の有報の提出日（`YYYY-MM-DD`）。 */
  filed: string;
  /** 工程ごとに反映した書類 ID。空はその工程をまだどの書類でも回していない。 */
  docs: Record<Stage, string>;
}

export type Ledger = ReadonlyMap<string, LedgerEntry>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 台帳の CSV を読む。鍵は EDINETコード。**同じ ID が2社にあったら落とす**（ADR-0017「結果」）。 */
export function parseLedgerCsv(text: string): Ledger {
  const [header, ...lines] = parseCsv(text).filter((row) => row.some((cell) => cell !== ""));
  if (header === undefined || header.join(",") !== LEDGER_COLUMNS.join(",")) {
    throw new Error(
      `ledger.csv の見出しが想定と違います: ${header?.join(",")}。pipeline/ledger/ledger.py の COLUMNS と揃えること`
    );
  }
  const ledger = new Map<string, LedgerEntry>();
  const owners = new Map<string, string>();
  for (const cells of lines) {
    const [edinetCode, id, filed, numbers, description, analysis, payPolicy] = cells;
    if (cells.length !== LEDGER_COLUMNS.length || !id || !DATE.test(filed)) {
      throw new Error(`ledger.csv の行の形が違います: ${cells.join(",")}`);
    }
    if (ledger.has(edinetCode)) throw new Error(`ledger.csv に ${edinetCode} が2行あります`);
    const owner = owners.get(id);
    if (owner !== undefined) {
      throw new Error(`企業 ID ${id} が ${owner} と ${edinetCode} の2社に振られています`);
    }
    owners.set(id, edinetCode);
    ledger.set(edinetCode, {
      edinetCode,
      id,
      filed,
      docs: { numbers, description, analysis, payPolicy },
    });
  }
  return ledger;
}

export function readLedger(path = DEFAULT_PATH): Ledger {
  return parseLedgerCsv(readFileSync(path, "utf-8"));
}

/** 台帳から企業 ID を引く。**無ければ落とす**——ID を振るのは台帳を書く側の仕事。 */
export function companyIdOf(ledger: Ledger, row: { edinetCode: string; name: string }): string {
  const entry = ledger.get(row.edinetCode);
  if (entry === undefined) {
    throw new Error(
      `${row.name}（${row.edinetCode}）が更新台帳（pipeline/data/ledger.csv）にありません。` +
        "ID は pipeline/ledger/ledger.py の admit で振ること"
    );
  }
  return entry.id;
}

/**
 * `YYYY-MM-DD` の `n` か月後。**月末は丸める**（`ledger.py` の `add_months` と同じ規則。
 * 3月31日の1か月前は2月28日か29日）。
 */
export function addMonths(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const months = y * 12 + (m - 1) + n;
  const year = Math.floor(months / 12);
  const month = (months % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (v: number, width: number) => String(v).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(Math.min(d, last), 2)}`;
}

/**
 * 最後の有報の提出から24か月たったか（ADR-0018 決定2・3）。`asOf` の日に、ちょうど24か月
 * たった会社は外れる。**`asOf` はデータを取った日で、ビルドを回した日ではない**——同じ入力から
 * 同じ成果物ができるように。
 */
export function isLapsed(filed: string, asOf: string): boolean {
  return asOf >= addMonths(filed, EXIT_MONTHS);
}

/**
 * 母集団を決める。数字の行（`ranking_unified.csv`）と台帳を突き合わせ、24か月を過ぎた会社を外す。
 *
 * - **行にあって台帳に無い会社は落とす**（ID を振っていない会社を出さない）
 * - **台帳にあって行に無い会社も落とす**——一度載った会社は、外れるまで最後の有報の数字で
 *   並ぶ（ADR-0018 決定2）。行が消えているのは取得側の異常で、黙ると企業ページが消える
 *
 * 返す `rows` と `ids` は元の行の並びのまま、添字で対応する。`lapsed` と `lapsedIds` も同じ
 * （外れた会社の企業ページを残すのに ID が要る。D9・#879）。
 */
export function selectUniverse<R extends { edinetCode: string; name: string }>(
  allRows: readonly R[],
  ledger: Ledger,
  asOf: string
): { rows: R[]; ids: string[]; lapsed: R[]; lapsedIds: string[] } {
  const rows: R[] = [];
  const ids: string[] = [];
  const lapsed: R[] = [];
  const lapsedIds: string[] = [];
  const seen = new Set<string>();
  for (const row of allRows) {
    const id = companyIdOf(ledger, row);
    seen.add(row.edinetCode);
    if (isLapsed(ledger.get(row.edinetCode)!.filed, asOf)) {
      lapsed.push(row);
      lapsedIds.push(id);
      continue;
    }
    rows.push(row);
    ids.push(id);
  }
  const missing = [...ledger.keys()].filter((code) => !seen.has(code));
  if (missing.length > 0) {
    throw new Error(
      `更新台帳の ${missing.length}社が ranking_unified.csv にありません（${missing.slice(0, 5).join(", ")} …）。` +
        "一度載った会社は、最後の有報の数字で残す"
    );
  }
  return { rows, ids, lapsed, lapsedIds };
}

/**
 * 工程の成果物が持つ書類 ID（EDINETコード → 書類 ID）が、台帳のその工程の書類と一致するか。
 * **台帳は成果物を写したもので、食い違ったら台帳か成果物のどちらかを書き忘れている。**
 * 成果物に行の無い会社は、台帳の側も空でなければならない。
 *
 * 見るのは同じ工程の中だけ。**工程どうしの書類がずれているのは正しい状態**（数字は新しい
 * 書類、文章は前の書類。`docs/refresh/spec.md` 1.5）。
 */
export function checkStageDocs(
  ledger: Ledger,
  stage: Stage,
  docs: ReadonlyMap<string, string>
): void {
  for (const code of docs.keys()) {
    if (!ledger.has(code)) {
      throw new Error(`${stage} の成果物にある ${code} が更新台帳にありません`);
    }
  }
  for (const entry of ledger.values()) {
    const doc = docs.get(entry.edinetCode) ?? "";
    if (doc !== entry.docs[stage]) {
      throw new Error(
        `${entry.edinetCode} の ${stage} の書類が、台帳では "${entry.docs[stage]}"、成果物では "${doc}" です。` +
          "台帳と成果物は同じ回で書くこと"
      );
    }
  }
}
