import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";

/**
 * **クロールは止めない。寄せるのは canonical でやる**（ADR-0006）。
 *
 * `?emp=` などの絞り込みURLを `Disallow` にすると、Google はそのURLを読めなくなり、
 * 中に書いてある canonical も読めなくなる。結果として、インデックスから外れる
 * のではなく、正規URLへ評価が渡らないまま宙に浮く。Google のファセット
 * ナビゲーション指針が canonical を先に勧めているのはこのためで、非正規側への
 * クロール量は時間とともに自然に減る。
 *
 * ここでやるのは sitemap の在り処を示すことだけ。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
