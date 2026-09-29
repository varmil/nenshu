/**
 * 給与の決定方針（`pay-policies.json`）を組む純関数。C19・Issue #852（親 #850、`docs/company/spec.md` 1.23）。
 *
 * 原文は C18（#851）が有報から切り出して `pipeline/data/pay_policy.json` に置いた。ここでは
 * **表示に要る形へ直すだけで、文は1字も書き換えない**。落とすのは画面が使わない鍵（範囲の番号・
 * 字数・判定のメモなど）と、画像の代替テキストだけ。
 */
import { filingRef, type FilingRef } from "./filing";

/**
 * 本文の塊。`heading` は「句点で終わらない短い行」で、見出しとは限らない（C18 の design.md）。
 * **画像は代替テキストを持たない**——有報の HTML の代替テキストは空かファイル名
 * （`0104010_004.png`）で、読者が読める文字が無い。
 *
 * **表の結合したセルは `spans`**（`[行, セル, colspan, rowspan]`。行とセルは `rows` の添字）。
 * 結合の無い表では鍵ごと無い。落とすとセルが左へ詰まって列がずれる（ソニーグループ）。
 */
export type PayPolicySpan = [row: number, cell: number, colspan: number, rowspan: number];

export type PayPolicyBlock =
  | { kind: "para" | "heading"; text: string }
  | { kind: "table"; rows: string[][]; spans?: PayPolicySpan[] }
  | { kind: "image" };

/** どの節から取ったか。参照だけの会社は参照先の節から取っている（C18）。 */
export type PayPolicySource = "section" | "sustainability" | "employees";

export interface PayPolicyRecord {
  source: PayPolicySource;
  /**
   * 原文を切り出した有報（refresh の D3）。節の引用と EDINET の帯はこの書類を指す。数字の書類とは
   * 違いうる——数字は新しい有報が出た翌日に替わり、給与の決定方針は書き直すまで前の書類のまま。
   */
  filing: FilingRef;
  /** 給与の決定方針そのものに会社が付けた小見出し。無ければ `null`。引用の先頭に出す（spec 1.23）。 */
  title: string | null;
  blocks: PayPolicyBlock[];
}

/** C18 の成果物の1行（使う鍵だけ）。 */
export interface PayPolicyRow {
  doc_id: string;
  period_end: string;
  edinet_code: string;
  name: string;
  verdict: string;
  source?: string;
  title: string | null;
  blocks: Record<string, unknown>[];
}

const SOURCES: readonly string[] = ["section", "sustainability", "employees"];

/**
 * 1行を表示の形にする。**本文の無い会社は `null`**（節ごと出さない。spec 1.23）。
 *
 * **形が崩れていたらビルドを落とす。** C18 の `verify` が原文と突き合わせてから書いたファイル
 * なので、ここで崩れているのは手で直されたか、C18 の出力の形が変わったとき——黙って飛ばすと
 * その会社だけ節が消えて誰も気づかない。
 */
export function toPayPolicyRecord(row: PayPolicyRow): PayPolicyRecord | null {
  if (row.blocks.length === 0) return null;
  const where = `${row.name}（${row.edinet_code}）`;
  if (row.verdict !== "own") {
    throw new Error(`${where} は本文があるのに verdict が own でありません: ${row.verdict}`);
  }
  if (row.source === undefined || !SOURCES.includes(row.source)) {
    throw new Error(`${where} の source が不正です: ${row.source}`);
  }
  if (row.title !== null && (typeof row.title !== "string" || row.title.trim() === "")) {
    throw new Error(`${where} の title が不正です`);
  }
  return {
    source: row.source as PayPolicySource,
    filing: filingRef(row.doc_id, row.period_end, where),
    title: row.title,
    blocks: row.blocks.map((block) => toBlock(block, where)),
  };
}

function toBlock(block: Record<string, unknown>, where: string): PayPolicyBlock {
  const kind = block.kind;
  if (kind === "para" || kind === "heading") {
    if (typeof block.text !== "string" || block.text.trim() === "") {
      throw new Error(`${where} に文字の無い ${kind} があります`);
    }
    return { kind, text: block.text };
  }
  if (kind === "table") {
    const rows = block.rows;
    if (
      !Array.isArray(rows) ||
      rows.length === 0 ||
      !rows.every((r) => Array.isArray(r) && r.length > 0 && r.every((c) => typeof c === "string"))
    ) {
      throw new Error(`${where} の表の形が不正です`);
    }
    const table: Extract<PayPolicyBlock, { kind: "table" }> = { kind, rows: rows as string[][] };
    if (block.spans !== undefined) table.spans = toSpans(block.spans, rows as string[][], where);
    return table;
  }
  if (kind === "image") return { kind };
  throw new Error(`${where} に知らない種類の塊があります: ${String(kind)}`);
}

/** 結合したセルの並び。どれかがセルを指していない・1を下回る・何も結合していないなら落とす。 */
function toSpans(spans: unknown, rows: string[][], where: string): PayPolicySpan[] {
  const ok =
    Array.isArray(spans) &&
    spans.length > 0 &&
    spans.every(
      (s) =>
        Array.isArray(s) &&
        s.length === 4 &&
        s.every((n) => Number.isInteger(n)) &&
        rows[s[0]] !== undefined &&
        rows[s[0]][s[1]] !== undefined &&
        s[2] >= 1 &&
        s[3] >= 1 &&
        s[2] * s[3] > 1
    );
  if (!ok) throw new Error(`${where} の表の結合の形が不正です`);
  return spans as PayPolicySpan[];
}
