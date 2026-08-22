import type { CompaniesMeta } from "@/features/ranking/types";

/**
 * 掲載データの「いつ」を1か所で文字列にする（S3・Issue #134、
 * `docs/site-chrome/spec.md` 5.）。
 *
 * **`2026年3月期` を直書きしない。** 決算期は title・description・3ページの本文に
 * 出るので、手で書くと年1回のデータ更新でどこか1つが古い年のまま残る。社数
 * （`companies.meta.count`）と同じ扱いで、値は `companies.meta.fiscalPeriod`
 * （`pipeline/scripts/build-data.ts` が CSV の `period_end` から導く）から引く。
 *
 * **「年度」とは書かない**（spec 5.3）。2026年3月期は年度でいえば2025年度で、
 * どちらの意味で読むかが読者によって1年ずれる。決算期は有価証券報告書そのものの
 * 言い方なのでずれようがない。
 */

/** `"2026-03"` → `"2026年3月期"`。 */
export function fiscalPeriodLabel(meta: CompaniesMeta): string {
  const { year, month } = parseFiscalPeriod(meta.fiscalPeriod);
  return `${year}年${month}月期`;
}

/**
 * `/about` の「対象範囲」で使う提出の窓。**窓の日付（6/1〜7/10）は有報の提出期に
 * 貼り付いていて年で動かない**ので日付は定数のままにし、年だけデータから引く。
 * 窓そのものを決めているのは `pipeline/salary35/` の取得側（暦年ぜんぶを見て
 * この範囲を採る）で、ここはその表示にすぎない。
 */
export function filingWindowLabel(meta: CompaniesMeta): string {
  return `${parseFiscalPeriod(meta.fiscalPeriod).year}年6月1日〜7月10日`;
}

/**
 * `YYYY-MM` を数値に割る。壊れた値は落とす——決算期は全ページに出るので、
 * `NaN年NaN月期` が黙って公開されるより、ビルドで止まるほうがよい
 * （`aboutFacts.ts` の実例が見つからないときと同じ方針）。
 */
function parseFiscalPeriod(fiscalPeriod: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(fiscalPeriod);
  if (match === null) {
    throw new Error(
      `companies.meta.fiscalPeriod が YYYY-MM の形でありません: ${fiscalPeriod}。` +
        `pipeline/scripts/build-data.ts の dominantFiscalPeriod を確認すること。`
    );
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}
