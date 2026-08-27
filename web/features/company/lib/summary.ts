/**
 * 会社の説明文（C7・Issue #161・親 #158、`docs/company/spec.md` 1.18・AC-21〜AC-23、
 * [ADR-0010](../../../../docs/adr/0010-company-summary-sourcing.md)）。
 *
 * **出し分けをここに閉じる。** 説明文を持たない会社が177社あり（C6 の検証パスと
 * 機械ゲートが落としたぶん）、そこでは**節ごと出さない**——空の器・プレースホルダ・
 * 「準備中」を出さない（AC-21）。分岐をコンポーネントの中に書くと、**「何も出ない」
 * ことをテストで固定できない**（出ていないものは query で捕まえにくい）ので、
 * `null` を返す純関数にして、その `null` をテストする。
 *
 * **`CompanyView.byBasis` の中に入れない**（AC-23）。説明文は事業の記述であって
 * 金額の話ではないので、表示基準（実測値 / 年齢そろえ）でも年齢スイッチでも変わらない。
 * 型の上で `byBasis` に置くと「年齢そろえにしたら事業の内容が変わる」を表現できて
 * しまう——10年推移（T1）・働きやすさ（W1）と同じ扱いにしてある。
 */

export interface SummaryView {
  /** 2〜3文・全角60〜130字。生成の規格は `pipeline/summary/prompts/generate.md`。 */
  text: string;
}

/**
 * 説明文が無ければ `null`。**空文字も無いものとして扱う**——C6 の CSV は落とした
 * 会社に空文字を書くので、`""` が「説明文がある」と読めてしまうと空の器が出る。
 */
export function buildSummaryView(summary: string | null | undefined): SummaryView | null {
  const text = summary?.trim() ?? "";
  if (text === "") return null;
  return { text };
}

/**
 * 要約であることと出典の1行（AC-22）。
 *
 * **`SummaryView` に持たせない。** Astro の島は props を HTML の属性に直列化するので、
 * **固定の文言をビューに載せると同じ文が props と本文の2か所に出る**（実測で
 * `/company/6861` が +134 B。W2・#224 で残業の注記が同じ形で二重になったのと同じ）。
 * 描画側でここから引けば本文ぶんだけになる。
 *
 * **決算期を書かない。** 初版は `（2026年3月期）` を挟んでいたが、**同じ画面の
 * 「有価証券報告書の実測値（2026年3月期）」の見出しと重なる**——決算期は1画面に1回
 * （S3・Issue #134・`docs/site-chrome/spec.md` 5.1。Issue #128 で「推定」について
 * 決めたのと同じ扱い）。この1行の役目は**何を原文にしたか**で、いつかは同じページの
 * その見出しが持っている。`e2e/data-period.spec.ts` が2回出たところを捕まえた。
 */
export const SUMMARY_SOURCE = "有価証券報告書「事業の内容」をもとに要約";
