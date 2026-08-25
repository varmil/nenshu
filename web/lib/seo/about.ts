import type { Metadata } from "next";
import type { CompaniesMeta } from "@/features/ranking/types";
import { fiscalPeriodLabel } from "@/lib/data/period";
import { toMetadata, type PageMeta } from "./pageMeta";
import { SITE_NAME } from "./site";

/**
 * `/about`（計算方法）の title・description・canonical。
 *
 * **`app/about/page.tsx` に直書きしていたものを S2 でここへ出した。** 理由は
 * `og:` にある（Issue #116・AC-10）——`og:title`・`og:description`・`og:url` は
 * title・description・canonical と同じ文字列でなければならず、それを保証して
 * いるのは `toMetadata()` 1本だからである。`/about` だけが素の `Metadata` を
 * 返していると、そこだけ `og:` が付かない。
 *
 * **タイトルに「有価証券報告書」を入れない**（`docs/site-chrome/spec.md` 1.4）。
 * 入れるのは `/` のタイトルだけで、他は description で足りる。
 *
 * **決算期の幅は description に入れる**（AC-18）。掲載社の決算期は1つではないので
 * `2026年3月期〜4月期` のように幅で出す（E1・`docs/expansion/spec.md` 1.4）。
 * 文字列にするのは `lib/data/period.ts` の1か所で、社数と同じく `companies.meta` から
 * 引く——直書きすると年1回のデータ更新でここだけ古い年が残る。
 */
export function aboutPageMeta(meta: CompaniesMeta): PageMeta {
  return {
    title: `計算方法 | ${SITE_NAME}`,
    description:
      `金融庁 EDINET の有価証券報告書（${fiscalPeriodLabel(meta)}）から平均年収をどう取り、` +
      "年齢でどう補正しているか。式と賃金カーブの出典、対象範囲、そしてこの方法で何が言えて何が言えないかまで全部公開しています。",
    // 自己canonical（ADR-0006 の表）。`metadataBase` は `app/layout.tsx`。
    canonical: "/about",
  };
}

/** `app/about/page.tsx` の `metadata` が返す形。包むだけ。 */
export function aboutMetadata(meta: CompaniesMeta): Metadata {
  return toMetadata(aboutPageMeta(meta));
}
