import type { BreadcrumbItem } from "@/lib/seo/jsonLd";
import { companyPath, industryPath } from "@/lib/seo/paths";

/**
 * 企業詳細ページのパンくず（C1 以来の画面の並びを S2 で1か所にまとめたもの）。
 *
 * **画面（`CompanyDetail`）と構造化データ（`BreadcrumbList`）が同じ配列を読む**
 * （AC-14）。書き写すと、業種チップのリンク先を直したときに構造化データだけが
 * 古い階層を指し、しかも画面を見ている限り気づけない。
 *
 * 先頭が「ランキング」なのは、ブランドを共通ヘッダが持っているため
 * （`docs/site-chrome/spec.md` 2.4）。
 */
export function companyBreadcrumb(company: {
  id: string;
  name: string;
  tse33: string;
}): BreadcrumbItem[] {
  return [
    { name: "ランキング", path: "/" },
    { name: company.tse33, path: industryPath(company.tse33) },
    { name: company.name, path: companyPath(company.id) },
  ];
}
