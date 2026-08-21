import type { MetadataRoute } from "next";
import { industryCounts } from "@/features/ranking/lib/industryCounts";
import { TARGET_AGES, type CompaniesData } from "@/features/ranking/types";
import { agePath, industryPath } from "@/lib/seo/ranking";
import { absoluteUrl } from "@/lib/seo/site";
import companiesData from "../public/data/companies.json";

const companies = companiesData as CompaniesData;

/**
 * ADR-0006 のインデックス対象をそのまま並べる（約1,910 URL）。
 *
 * | 対象 | 件数 |
 * | --- | --- |
 * | `/` | 1 |
 * | `/about` | 1 |
 * | `/?age=N` | 8 |
 * | `/?ind=X` | 33 |
 * | `/company/[id]` | 1,867 |
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
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = companies.meta.generatedAt;
  const counts = industryCounts(companies);

  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified },
    { url: absoluteUrl("/about"), lastModified },
  ];

  for (const age of TARGET_AGES) {
    entries.push({ url: absoluteUrl(agePath(age)), lastModified });
  }

  companies.industries.forEach((industry, index) => {
    // 0件の業種は載せない（現状は33件すべてに会社があるが、データ更新で
    // 空になった業種を黙って載せ続けないようにしてある）。
    if (counts[index] === 0) return;
    entries.push({ url: absoluteUrl(industryPath(industry)), lastModified });
  });

  for (const row of companies.rows) {
    entries.push({ url: absoluteUrl(`/company/${row[0]}`), lastModified });
  }

  return entries;
}
