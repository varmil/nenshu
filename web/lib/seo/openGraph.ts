import type { Metadata } from "next";
import { OG_IMAGE } from "@/lib/brand/assets";
import type { PageMeta } from "./pageMeta";
import { SITE_NAME } from "./site";

/**
 * SNS に貼られたときの見え方（S2・Issue #116・`docs/site-chrome/spec.md` 4.1）。
 *
 * **`og:title`・`og:description`・`og:url` は `<title>`・`description`・canonical と
 * 同じ文字列にする**（AC-11・AC-12）。だから出どころは `PageMeta` 1つで、ここは
 * 包み直すだけにしてある。別々に組み立てると、非正規URL（`/?age=35&ind=銀行業`）で
 * **canonical だけが寄せ先を指し `og:url` が自分自身を指す**という食い違いが起きる
 * ——貼られた先で正規URLへ評価が渡らなくなる。
 *
 * **こちらが宣言するのは `twitter:card` だけ。** X は `og:` も読むので文言を
 * もう1組書く必要は無い——実際に返るHTMLには `twitter:title` などが並ぶが、
 * それは Next.js が `title`・`description`・`openGraph.images` から自動で
 * 埋めたものである（同じ値を2か所に書いてはいない）。
 */

/**
 * ページによらない部分。**`app/layout.tsx` もこれを使う**——Next.js の
 * `openGraph` は入れ子ごと差し替わる（浅いマージ）ので、ページ側が
 * `openGraph` を返すとレイアウトのものは1つも残らない。**ページが返さない
 * ルート（`/_not-found`）だけがレイアウトのものを使う。**
 */
export const OPEN_GRAPH_DEFAULTS = {
  siteName: SITE_NAME,
  type: "website",
  locale: "ja_JP",
  images: [
    {
      url: OG_IMAGE.path,
      width: OG_IMAGE.width,
      height: OG_IMAGE.height,
      alt: OG_IMAGE.alt,
    },
  ],
} as const satisfies Metadata["openGraph"];

/**
 * 全ページ共通。**種類だけ宣言する**——`twitter:title` などは Next.js が
 * `title`・`description`・`openGraph.images` から埋める。
 */
export const TWITTER_DEFAULTS = { card: "summary_large_image" } as const;

/**
 * `PageMeta` から `og:` 一式を作る。**`url` は canonical と同じ相対パス**で、
 * 絶対URLにするのは `metadataBase`（`app/layout.tsx`）の仕事——オリジンを書く
 * 場所は `lib/seo/site.ts` の1か所だけ（ADR-0006）。
 */
export function openGraphFor(meta: PageMeta): Metadata["openGraph"] {
  return {
    ...OPEN_GRAPH_DEFAULTS,
    title: meta.title,
    description: meta.description,
    url: meta.canonical,
  };
}
