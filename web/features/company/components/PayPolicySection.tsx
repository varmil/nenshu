import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableRow } from "@/design-system/ui/table";
import { TABLE_NO_VERTICAL_SCROLL } from "@/design-system/tableContainer";
import { edinetDocumentUrl } from "@/lib/data/sources";
import { formatInt } from "@/features/ranking/lib/format";
import { cellSpan, type PayPolicyBlock, type PayPolicyView } from "../lib/payPolicy";
import { FilingLink } from "./FilingLink";

/**
 * 「{社名}の給与の決定方針」（C19・Issue #852・親 #850、`docs/company/spec.md` 1.23・AC-36、
 * Claude Design `C19 給与の決定方針.dc.html`）。有報に会社が書いた給与の決定方針を原文のまま出す。
 *
 * **島の外で描く。** 中身は表示基準でも年齢でも変わらないので、C10 の2節・C12 の出典・C16 の
 * Q&A と同じく `[id].astro` が名前付きスロット（`slot="payPolicy"`）で差し込む。サーバーで1度
 * HTML になるだけで、クライアントの JS にも props にも入らない（最長3,140字が props と本文の
 * 2か所に入ることもない）。**状態を持たせないこと**——長い会社の「続きを読む」はブラウザの
 * `details` で開くので JS が要らない。
 *
 * - **原文は `blockquote` で囲い、`cite` に有報の書類を置く。** 枠の先頭に出どころの節の名前、
 *   続いて会社の小見出し（運営者の判断で残す）、原文の塊を段落ごとに並べる
 * - **`heading` を強い見出しにしない。** C18 の `heading` は「句点で終わらない短い行」で、
 *   箇条書きの1項目や言いさしも入る。本文と同じ大きさで、太さだけ一段上げる
 * - **段落の中の改行は残す**（`whitespace-pre-line`）。原文の行の区切りのまま読ませる
 * - **「生成AI」の語を置かない。** 文そのものを AI が書いたように読める。範囲の判定に生成AIを
 *   使ったことは「このページの出典」と `/about` が言う（spec 1.23）
 * - **決算期は節の説明の1行の先頭に、常に書く**（Q&A・要約の説明と同じ置き方。site-chrome spec 5.1）。
 *   値は原文を切り出した有報の期で、数字の期とは違いうる（refresh の D3。毎日の更新で数字だけが
 *   先に新しい有報へ替わる）。引用の枠の先頭（出どころの節の名前）には書かない——同じ節で2回になる
 * - **引用の `cite` と下辺の帯は、原文を切り出した書類を指す**（数字の書類ではない。refresh の D3）
 * - **下辺に EDINET の帯**（C13 と同じ）。原文の枠は下の角を丸めず、帯が枠の続きとして下の角を持つ
 */
export function PayPolicySection({ view }: { view: PayPolicyView }) {
  return (
    <section className="flex flex-col gap-2" data-testid="company-pay-policy">
      <h2 className="text-lg font-bold">{view.heading}</h2>
      <p data-pay-note className="text-muted-foreground text-xs leading-relaxed">
        {view.fiscalPeriod}
        の有価証券報告書に会社が書いた方針です。要約も言い換えもせず、原文のまま載せています。
        <a href="/about#pay-policy" className="text-primary ml-1 underline">
          抜き出し方
        </a>
      </p>
      <div className="flex flex-col">
        <blockquote
          cite={edinetDocumentUrl(view.docId)}
          className="border-border flex flex-col gap-2.5 rounded-t-lg border px-4 py-3.5"
        >
          <p data-pay-source className="text-muted-foreground text-[11px] leading-4">
            「{view.sourceLabel}」から
          </p>
          {view.title !== null && (
            <p data-pay-title className="text-sm leading-[1.8] font-semibold whitespace-pre-line">
              {view.title}
            </p>
          )}
          {view.open.map((block, i) => (
            <Block key={i} block={block} />
          ))}
          {view.folded.length > 0 && (
            /*
             * **全文は初期 HTML にある**（spec 2. の SEO）。`details` の中身は閉じていても
             * 文書にあり、検索エンジンも JS を実行しない読者も読める。
             */
            <details className="group border-border border-t border-dashed pt-2.5">
              <summary className="text-primary flex min-h-8 cursor-pointer list-none items-center gap-1 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
                <ChevronDown
                  aria-hidden="true"
                  className="size-3.5 flex-none transition-transform group-open:rotate-180"
                />
                <span className="underline underline-offset-2">
                  続きを読む（残り{formatInt(view.foldedChars)}字）
                </span>
              </summary>
              <div className="mt-2.5 flex flex-col gap-2.5">
                {view.folded.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </div>
            </details>
          )}
        </blockquote>
        <FilingLink docId={view.docId} testId="company-pay-policy-filing" />
      </div>
    </section>
  );
}

/** 原文の塊1つ。`data-pay-block` は E2E がデータと突き合わせるための印。 */
function Block({ block }: { block: PayPolicyBlock }) {
  switch (block.kind) {
    case "para":
      return (
        <p data-pay-block="para" className="text-sm leading-[1.8] whitespace-pre-line text-pretty">
          {block.text}
        </p>
      );
    case "heading":
      return (
        <p
          data-pay-block="heading"
          className="text-sm leading-[1.8] font-medium whitespace-pre-line"
        >
          {block.text}
        </p>
      );
    case "table":
      /*
       * **表のまま出す**（C18 の全件で58社。多いのは2〜6列・1〜5行）。どの行が見出しかは原文から
       * 決まらないので、行はすべて同じ扱いにする。幅が足りなければ表の器の中で横に送る
       * （文書は横にはみ出さない）。
       *
       * **セルに最小幅（5字ぶん）を持たせる。** 持たせないと表は器の幅に縮もうとして、6列の表
       * （コニシ）が 390px で1字ずつ縦に折れる（「※所定内賃金」が6行になっていた）。
       *
       * **最小幅は字のあるセルにだけ付ける。** 字の無いセルは字下げの列（ソニーグループの株式報酬の
       * 内訳。原文では24px）に使われていて、5字ぶん取ると 390px で本文の列が細る。
       *
       * **結合したセルは原文どおりに結合する**（`cellSpan`）。落とすと列がずれる。
       */
      return (
        <div className={TABLE_NO_VERTICAL_SCROLL}>
          <Table data-pay-block="table" className="border-border border text-[13px]">
            <TableBody>
              {block.rows.map((row, r) => (
                <TableRow key={r} className="hover:bg-transparent">
                  {row.map((cell, c) => (
                    <TableCell
                      key={c}
                      {...cellSpan(block.spans, r, c)}
                      className={cn(
                        "border-border border px-2 py-1.5 align-top leading-relaxed whitespace-pre-line",
                        cell.trim() !== "" && "min-w-[5em]"
                      )}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    case "image":
      /*
       * **画像は出さない。** 有報の HTML の代替テキストは空かファイル名で、読める文字が無い。
       * 図があったことだけを断る。図そのものは下の帯から開く有報で見られる。
       */
      return (
        <p data-pay-block="image" className="text-muted-foreground text-xs">
          （図は省略しています）
        </p>
      );
  }
}
