import type { CompaniesData, CompaniesMeta, CompanyRow } from "@/features/ranking/types";

/**
 * 掲載データの「いつ」を1か所で文字列にする（S3・Issue #134、`docs/site-chrome/spec.md` 5.、
 * E1・`docs/expansion/spec.md` 1.4）。
 *
 * **`2026年3月期` を直書きしない。** 決算期は title・description・3ページの本文に
 * 出るので、手で書くと年1回のデータ更新でどこか1つが古い年のまま残る。社数
 * （`companies.meta.count`）と同じ扱いで、値は `companies.meta`（`pipeline/scripts/build-data.ts`
 * が CSV の `period_end` から導く）から引く。
 *
 * **「年度」とは書かない**（spec 5.3）。2026年3月期は年度でいえば2025年度で、
 * どちらの意味で読むかが読者によって1年ずれる。決算期は有価証券報告書そのものの
 * 言い方なのでずれようがない。
 *
 * **代表を1つ選ぶのはやめ、幅で出す**（E1）。母集団を直近12か月に広げると
 * （ADR-0011）3月期は 63.5% まで下がり、1,081社の決算期が違うまま「2026年3月期」と
 * 名乗ることになる。**1社ぶんを出せる場所（企業詳細）では幅ではなく実際の決算期を出す。**
 */

/** `{ from: "2026-03", to: "2026-04" }` → `"2026年3月期〜4月期"`。 */
export function fiscalPeriodLabel(meta: CompaniesMeta): string {
  const from = parseFiscalPeriod(meta.fiscalPeriodRange.from);
  const to = parseFiscalPeriod(meta.fiscalPeriodRange.to);

  if (from.year === to.year && from.month === to.month) {
    return `${from.year}年${from.month}月期`;
  }
  // **同じ年なら後ろの年を省く**（`2026年3月期〜4月期`）。年が違えば省かない
  // （`2025年3月期〜2026年5月期`）——省くと2025年5月期と読めてしまう。
  const tail = from.year === to.year ? `${to.month}月期` : `${to.year}年${to.month}月期`;
  return `${from.year}年${from.month}月期〜${tail}`;
}

/** `"2026-03"` → `"2026年3月期"`。1つの決算期を文字列にする唯一の場所。 */
export function periodLabel(period: string): string {
  const { year, month } = parseFiscalPeriod(period);
  return `${year}年${month}月期`;
}

/**
 * その会社1社の決算期（E1）。**企業詳細は1社ぶんなので幅ではなく実際の決算期を出す。**
 * 値は `companies.rows` の末尾が持つ `companies.periods` への添字。
 */
export function companyFiscalPeriodLabel(companies: CompaniesData, row: CompanyRow): string {
  const period = companies.periods[row[9]];
  if (period === undefined) {
    throw new Error(
      `companies.periods に添字 ${row[9]} がありません（${row[1]}）。` +
        `pipeline/scripts/build-data.ts の periods を確認すること。`
    );
  }
  return periodLabel(period);
}

/**
 * `/about` の「対象範囲」で使う提出の窓（E2・ADR-0011）。
 *
 * **日付を直書きできない。** 窓は「回した日から遡って12か月」で、データを作り直す
 * たびに動く。以前は 6/1〜7/10 という3月期決算の提出ピークに貼り付いていたので
 * 定数で書けたが、**その窓こそが1,095社を落としていた**。
 *
 * **決算期（`fiscalPeriodLabel`）とは別物。** あちらは会社ごとの期末、こちらは
 * 提出日の範囲になる。同じ `/about` の同じ段落に両方が出るが、片方は「いつの
 * 数字か」、もう片方は「どこまで集めたか」を答えている。
 */
export function filingWindowLabel(meta: CompaniesMeta): string {
  const from = parseFilingDate(meta.filingWindow.from);
  const to = parseFilingDate(meta.filingWindow.to);
  return `${from.year}年${from.month}月${from.day}日〜${to.year}年${to.month}月${to.day}日`;
}

/** `YYYY-MM-DD` を数値に割る。壊れた値は決算期と同じ理由で落とす。 */
function parseFilingDate(day: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) {
    throw new Error(
      `提出日が YYYY-MM-DD の形でありません: ${day}。` +
        `pipeline/salary/unified.py の save_universe を確認すること。`
    );
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
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
      `決算期が YYYY-MM の形でありません: ${fiscalPeriod}。` +
        `pipeline/scripts/build-data.ts の fiscalPeriodRange を確認すること。`
    );
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}
