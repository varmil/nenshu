/**
 * インデックスさせるファセットのパス（ADR-0006・U8）。
 *
 * **canonical・sitemap・企業詳細のパンくずが同じ関数を通る。** 別々に組み立てると、
 * 載せるURLと canonical が1文字ずれても気づけない（`src/pages/sitemap.xml.ts`）。
 *
 * **`lib/seo/ranking.ts` から分けてある。** あちらは `parseSearchParams` や
 * 母集団の社数まで抱えていて、パスを1本作りたいだけの相手（クライアントで描く
 * パンくず）が引くには大きい。
 *
 * **年齢のパス（`agePath`）は無い。** `/?age=N` は canonical にも sitemap にも載せなく
 * なった（2026-10-03・ADR-0006 の追記）。
 */

/**
 * `/?ind=X`。**業種名は日本語なので必ずエンコードする。**
 * canonical も sitemap もここを通し、生の文字列を混ぜない。
 */
export function industryPath(industry: string): string {
  return `/?ind=${encodeURIComponent(industry)}`;
}

/** `/company/[id]`。 */
export function companyPath(id: string): string {
  return `/company/${id}`;
}
