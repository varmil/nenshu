import { OG_IMAGE } from "@/lib/brand/assets";

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
 * もう1組書く必要は無い。**Next.js は `twitter:title` などを自動で埋めていたが、
 * F1 でそれも無くなった**——`e2e/social.spec.ts` が見ているのも `twitter:card` だけ。
 */

/**
 * ページによらない部分。**`src/components/PageHead.astro` が唯一の読み手。**
 * 全ページが `PageMeta` を持つので、「ページが返さないときの受け皿」は要らなくなった。
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
} as const;

/**
 * 全ページ共通。**種類だけ宣言する**——`twitter:title` などは Next.js が
 * `title`・`description`・`openGraph.images` から埋める。
 */
export const TWITTER_DEFAULTS = { card: "summary_large_image" } as const;

