import type { APIRoute } from "astro";
import { industryCounts } from "@/features/ranking/lib/industryCounts";
import type { CompaniesData } from "@/features/ranking/types";
import { industryPath } from "@/lib/seo/ranking";
import { absoluteUrl } from "@/lib/seo/site";
import companiesData from "@/public/data/companies.json";
import unrankedData from "@/public/data/unranked.json";
import type { UnrankedData } from "@/features/company/lib/unranked";

const companies = companiesData as CompaniesData;
const unranked = unrankedData as unknown as UnrankedData;

/**
 * ADR-0006 のインデックス対象のうち、sitemap で発見を勧めるものを並べる。
 *
 * **ビルド時に確定して静的アセットになる**（F1・AC-1）。Next.js の
 * `MetadataRoute.Sitemap` が組み立てていた XML を自分で書く形になったが、
 * **載せるURLの作り方は1文字も変えていない**——`industryPath`・`absoluteUrl` を
 * canonical と共有しているという U8 の性質が担保になる。
 *
 * | 対象 | 件数 |
 * | --- | --- |
 * | `/` | 1 |
 * | `/about` | 1 |
 * | `/?ind=X` | 会社のいる業種ごとに1（33） |
 * | `/company/[id]` | 全社（ランキングの外の会社を含む。毎日の更新で動く） |
 *
 * **`/?age=N`（8件）は載せない**（2026-10-03・ADR-0006 の追記）。Search Console で
 * 全くインデックスされておらず、重要とみなされていなかったため。canonical は自己の
 * まま変えていない（寄せ先を変える判断ではなく、sitemap で発見を勧めるのをやめるだけ）。
 *
 * **canonical と載せるURLが1文字もずれないこと。** `/?ind=X` は `industryPath` を
 * 通してエンコードし、`app/page.tsx` の canonical と同じ関数を共有している。
 * 別々に組み立てると、sitemap が載せるURLと canonical が指すURLが食い違い、
 * Google から見て sitemap 全体の信頼が下がる。
 *
 * `lastModified` はビルド時に確定する `companies.json` の生成日時。データの更新は
 * 年1回（`docs/product/product.md`）なので、リクエストごとの現在時刻を入れると
 * 「毎日更新されている」という誤った信号になる。
 *
 * `changeFrequency` と `priority` は出さない（Google が使っていない）。
 *
 * 上限（50,000 URL / 50MB）に対して十分小さいので分割しない。
 */
export const GET: APIRoute = () => {
  const lastModified = companies.meta.generatedAt;
  const counts = industryCounts(companies);

  const urls: string[] = [absoluteUrl("/"), absoluteUrl("/about")];

  companies.industries.forEach((industry, index) => {
    // 0件の業種は載せない（現状は33件すべてに会社があるが、データ更新で
    // 空になった業種を黙って載せ続けないようにしてある）。
    if (counts[index] === 0) return;
    urls.push(absoluteUrl(industryPath(industry)));
  });

  for (const row of companies.rows) urls.push(absoluteUrl(`/company/${row[0]}`));
  // **ランキングの外の会社のページも載せる**（refresh の D9・#879・D11・#903）。ページは正規の
  // ページのまま残す（ADR-0018 の「ページが誤って消えるほうが痛手」）。
  for (const row of unranked.rows) urls.push(absoluteUrl(`/company/${row[0]}`));

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (url) => `<url><loc>${escapeXml(url)}</loc><lastmod>${lastModified}</lastmod></url>`
    ),
    "</urlset>",
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};

/**
 * `<loc>` に入れる前のエスケープ。**業種名は日本語だが `&` を含みうる**
 * （`industryPath` が percent-encode するので実際には出ないが、素通しにしない）。
 */
function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
