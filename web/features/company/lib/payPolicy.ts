/**
 * 給与の決定方針の節（C19・Issue #852・親 #850、`docs/company/spec.md` 1.23・AC-36）の見せ方を組む純関数。
 *
 * 原文は C18（#851）が有報から切り出し、`build-data.ts` が `pay-policies.json` にした
 * （`pipeline/scripts/lib/payPolicy.ts`）。**文は1字も書き換えない。** ここで決めるのは
 * 見出し・出どころの節の名前・長い会社でどこまで開いておくかだけ。
 *
 * **島の外で描く**（`PayPolicySection`）ので、ここで組んだものはサーバーで1度 HTML になるだけで、
 * クライアントの JS にも島の props にも入らない。
 */
import type { FilingRef } from "@/lib/data/sources";
import { periodLabel } from "@/lib/data/period";

/** 表の結合したセル。`[行, セル, colspan, rowspan]`（行とセルは `rows` の添字）。 */
export type PayPolicySpan = [row: number, cell: number, colspan: number, rowspan: number];

/** `pipeline/scripts/lib/payPolicy.ts` の `PayPolicyBlock` と同じ形。 */
export type PayPolicyBlock =
  | { kind: "para" | "heading"; text: string }
  | { kind: "table"; rows: string[][]; spans?: PayPolicySpan[] }
  | { kind: "image" };

export type PayPolicySource = "section" | "sustainability" | "employees";

/** `pay-policies.json` の1社ぶん。 */
export interface PayPolicyRecord {
  source: PayPolicySource;
  /** 原文を切り出した有報（refresh の D3）。 */
  filing: FilingRef;
  title: string | null;
  blocks: PayPolicyBlock[];
}

export interface PayPolicyView {
  /** `{社名}の給与の決定方針`（spec 1.23。デザインの「給与・賞与の決定方針」は採らない）。 */
  heading: string;
  /** 原文を取った節の名前。引用の枠の先頭に置く。 */
  sourceLabel: string;
  /** 給与の決定方針そのものに会社が付けた小見出し。引用の先頭に残す（運営者の判断）。 */
  title: string | null;
  /** 開いたまま出す塊。 */
  open: PayPolicyBlock[];
  /** 「続きを読む」に畳む塊。畳まない会社では空。 */
  folded: PayPolicyBlock[];
  /** 畳んだ塊の字数（空白を除く）。「続きを読む（残り◯字）」に出す。 */
  foldedChars: number;
  /** 原文を切り出した有報の書類 ID。引用の `cite` と下辺の EDINET の帯がここを指す。 */
  docId: string;
  /**
   * 原文の決算期（`2025年3月期`）。**数字の決算期とずれたときだけ持ち、そろっていれば `null`**
   * （refresh の D3）。そろっていれば、直後の「年収に関するQ&A」の説明が同じ期を言っているので
   * 重ねない（`docs/site-chrome/spec.md` 5.1）。ずれているのは、数字だけが新しい有報に替わり、
   * 給与の決定方針がまだ前の有報のままの会社——そのときは読者がそれを知る必要がある。
   */
  fiscalPeriod: string | null;
}

/**
 * 出どころの節の名前。**開示府令の項目名で書く**——会社によって「人財戦略」と書くが、
 * どの会社の枠にも同じ名前が出るほうが「同じ項目から取った」ことが読める。
 * 参照だけの会社（C18 の2回目）は参照先の節から取っている。
 */
export const PAY_POLICY_SOURCE_LABEL: Record<PayPolicySource, string> = {
  section: "人材戦略に関する基本方針等",
  sustainability: "サステナビリティに関する考え方及び取組",
  employees: "従業員の状況",
};

/**
 * **これを超える会社だけ畳む**（C18 の全件で 1,862社中80社）。1,000字は 390px で縦に約1,000px。
 * 90%点は752字なので、ほとんどの会社は全文が開いている。
 */
export const PAY_POLICY_FOLD_OVER = 1000;

/**
 * **畳む会社で、開いておく字数の下限。** 塊の単位で切るので、実際に開いているのはこれ以上
 * （80社で中央値466字・最大938字）。75%点の会社（509字）がまるごと見える量にそろう。
 */
export const PAY_POLICY_OPEN_AT_LEAST = 400;

/**
 * 表のセルの結合を引く。結合の無いセルは `undefined`（`colSpan`・`rowSpan` の属性を書かない）。
 *
 * **結合を落とすと列がずれる**（公開後の指摘・2026-09-28）。ソニーグループの報酬の表は、項目名が
 * 2列ぶん、株式報酬の内訳が左に空の列を置いて2行ぶん結合している。結合を読まずに描くと、内訳の
 * 行だけが1列右へずれていた。
 */
export function cellSpan(
  spans: PayPolicySpan[] | undefined,
  row: number,
  cell: number
): { colSpan?: number; rowSpan?: number } | undefined {
  const hit = spans?.find(([r, c]) => r === row && c === cell);
  if (hit === undefined) return undefined;
  const [, , colSpan, rowSpan] = hit;
  return { colSpan: colSpan > 1 ? colSpan : undefined, rowSpan: rowSpan > 1 ? rowSpan : undefined };
}

/** 塊の字数。空白は数えない（C18 が字数を数えたのと同じ規則）。画像は0。 */
export function blockChars(block: PayPolicyBlock): number {
  const text =
    block.kind === "table" ? block.rows.flat().join("") : block.kind === "image" ? "" : block.text;
  return text.replace(/\s/g, "").length;
}

/**
 * 1社ぶんの見せ方を組む。**本文の無い会社は `null`**（節ごと出さない。spec 1.23）。
 *
 * 畳む位置は塊の境目。`PAY_POLICY_OPEN_AT_LEAST` に届いた塊で切るが、**小見出しでは終わらせない**
 * ——開いている部分の最後が小見出しだと、その中身が「続きを読む」の向こうに行って見出しだけが残る。
 * 畳む部分が空になるなら畳まない。
 */
export function buildPayPolicyView(
  name: string,
  record: PayPolicyRecord | undefined,
  /** 数字の決算期（`YYYY-MM`・`companies.periods` の値）。原文の期と比べる。 */
  numbersPeriod: string
): PayPolicyView | null {
  if (record === undefined || record.blocks.length === 0) return null;
  const total = record.blocks.reduce((sum, block) => sum + blockChars(block), 0);
  let cut = record.blocks.length;
  if (total > PAY_POLICY_FOLD_OVER) {
    let chars = 0;
    for (let i = 0; i < record.blocks.length; i++) {
      chars += blockChars(record.blocks[i]);
      if (chars >= PAY_POLICY_OPEN_AT_LEAST && record.blocks[i].kind !== "heading") {
        cut = i + 1;
        break;
      }
    }
  }
  const open = record.blocks.slice(0, cut);
  const folded = record.blocks.slice(cut);
  return {
    heading: `${name}の給与の決定方針`,
    sourceLabel: PAY_POLICY_SOURCE_LABEL[record.source],
    title: record.title,
    open,
    folded,
    foldedChars: folded.reduce((sum, block) => sum + blockChars(block), 0),
    docId: record.filing.docId,
    fiscalPeriod: record.filing.period === numbersPeriod ? null : periodLabel(record.filing.period),
  };
}
