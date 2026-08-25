import type { TargetAge } from "@/features/ranking/types";

/**
 * インデックスさせるファセットのパス（ADR-0006・U8）。
 *
 * **canonical・sitemap・企業詳細のパンくずが同じ関数を通る。** 別々に組み立てると、
 * 載せるURLと canonical が1文字ずれても気づけない（`app/sitemap.ts`）。
 *
 * **`lib/seo/ranking.ts` から分けてある。** あちらは `parseSearchParams` や
 * 母集団の社数まで抱えていて、パスを1本作りたいだけの相手（クライアントで描く
 * パンくず）が引くには大きい。
 */

/** `/?age=N`。`age` は数値なのでエンコードは要らない。 */
export function agePath(age: TargetAge): string {
  return `/?age=${age}`;
}

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
