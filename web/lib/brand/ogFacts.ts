/* このファイルは `pipeline/scripts/build-brand.ts` の出力。手で編集しない。 */

/**
 * `public/og.png` を焼いたときの母集団（S2・Issue #116・`pipeline/brand/og.ts`）。
 *
 * **絵の中に数字が入っている以上、その数字がどれだったかを web 側も知っている必要が
 * ある。** `OG_IMAGE.alt` は絵に書いてあることをそのまま読み上げる文なので、
 * ここから組む——書き写すと、焼き直したときに代替テキストだけ古い数字で残る。
 *
 * `ogFacts.test.ts` が `public/data/` の中身と突き合わせている。
 * **データを作り直したら `cd pipeline && npm run build:brand` も回すこと。**
 */
export const OG_FACTS = {
  count: 2961,
  averageManYen: 693,
  fiscalPeriod: "2025年3月期〜2026年5月期",
  alt: "OpenReport — 有価証券報告書の数値のまま、2,961社の平均年収。対象社数 2,961社、全体平均 693万円、対象期間・出典 2025年3月期〜2026年5月期・金融庁 EDINET",
} as const;
