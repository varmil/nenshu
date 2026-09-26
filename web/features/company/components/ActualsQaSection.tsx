import type { ActualsQa } from "../lib/actualsQa";
import { FilingLink } from "./FilingLink";

/**
 * 「{社名}の年収に関するQ&A」（C16・Issue #838、`docs/company/spec.md` 1.22・AC-34）。
 * 実測値の4項目を1問ずつの質問と回答で出す（Claude Design `Company Actuals QA.dc.html` の 1b）。
 * C1 からの「有価証券報告書の実測値」の節（地の文と4セルの表）を置き換えた。
 *
 * **島の外で描く。** 中身は表示基準でも年齢でも変わらないので、C10 の2節・C12 の出典と同じく
 * `[id].astro` が名前付きスロット（`slot="qa"`）で差し込む。サーバーで1度 HTML になるだけで、
 * クライアントの JS にも props にも入らない。**状態を持たせないこと。**
 *
 * - **4問とも開いたまま並べる。** 折りたたむ案（1c）は採らない——閉じた回答は抜粋に使われにくい
 * - **質問は h3。** 見出しで辿れるうえ、問いと答えの対が文書の構造として読める
 * - **「Q」「A」の字は読み上げない**（`aria-hidden`）。問いは見出し、答えはその直後の段落という
 *   並びが同じことを伝えている
 * - **太字は回答の値だけ。値の途中で折り返さない**（`whitespace-nowrap`）。390px では回答が
 *   2〜3行になり、何もしないと `38.8` / `歳`、`293` / `人` のように数字と単位が行をまたいでいた
 *   （実測）。値は長くても `12,345人` ほどなので、折り返しを止めても横にはみ出さない
 * - **下辺に EDINET の帯（C13）を付ける。** 4問の枠は下の角を丸めず、帯が枠の続きとして
 *   下の角を持つ（`FilingLink`）。どの数字の出典かが形で分かる
 */
export function ActualsQaSection({ qa, docId }: { qa: ActualsQa; docId: string }) {
  return (
    <section className="flex flex-col gap-2" data-testid="company-qa">
      <h2 className="text-lg font-bold">{qa.heading}</h2>
      {/* 決算期はこの1行にだけ置く（企業詳細で2か所。もう1か所は要約の節の説明）。 */}
      <p className="text-muted-foreground text-xs">{qa.note}</p>
      <div className="flex flex-col">
        <div
          data-testid="company-qa-list"
          className="border-border divide-border flex flex-col divide-y rounded-t-lg border"
        >
          {qa.items.map((item) => (
            <div
              key={item.question}
              className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 px-4 py-3.5"
            >
              <span aria-hidden="true" className="text-sm leading-5 font-bold">
                Q
              </span>
              <h3 className="text-sm leading-5 font-semibold">{item.question}</h3>
              <span aria-hidden="true" className="text-muted-foreground text-sm leading-relaxed font-bold">
                A
              </span>
              <p className="text-sm leading-relaxed text-pretty">
                {item.answer.before}
                <strong className="font-bold whitespace-nowrap">{item.answer.value}</strong>
                {item.answer.after}
              </p>
            </div>
          ))}
        </div>
        <FilingLink docId={docId} />
      </div>
    </section>
  );
}
