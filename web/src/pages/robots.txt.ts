import type { APIRoute } from "astro";
import { absoluteUrl } from "@/lib/seo/site";

/**
 * **クロールは止めない。寄せるのは canonical でやる**（ADR-0006）。
 *
 * `?emp=` などの絞り込みURLを `Disallow` にすると、Google はそのURLを読めなくなり、
 * 中に書いてある canonical も読めなくなる。結果として、インデックスから外れるのでは
 * なく、正規URLへ評価が渡らないまま宙に浮く。ここでやるのは sitemap の在り処を
 * 示すことだけ。
 *
 * **ビルド時に確定して静的アセットになる**（F1・AC-1）。クローラが取りに来るたびに
 * Worker を起こす理由が無い。
 */
export const GET: APIRoute = () =>
  new Response(
    ["User-Agent: *", "Allow: /", "", `Sitemap: ${absoluteUrl("/sitemap.xml")}`, ""].join("\n"),
    { headers: { "content-type": "text/plain; charset=utf-8" } }
  );
