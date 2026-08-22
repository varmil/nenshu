import type { Metadata } from "next";
import { statsForBasis } from "@/features/company/lib/stats";
import type { CompanyView } from "@/features/company/types";
import { formatDecimal1, formatManYen } from "@/features/ranking/lib/format";
import type { TargetAge } from "@/features/ranking/types";
import { toMetadata, type PageMeta } from "./pageMeta";

/**
 * 企業詳細ページの title・description・canonical（C1 で `generateMetadata` に
 * 直書きしていたものを U16 でここへ出した）。
 *
 * **クライアントからも引く。** タイトルに金額が入っているので、画面で表示基準を
 * 切り替えたときに更新されないと**タイトルの金額と画面の金額が食い違う**
 * （親 Issue #130）。`CompanyDetail` は `usePageMeta` を通してこの関数を呼ぶ。
 *
 * **canonical は表示基準に依らず素の `/company/[id]`。** `?age=N` は同じ会社の
 * 同じ内容を表示基準だけ変えたページで、1,867社×9基準の16,803 URL をインデックス
 * させる意味がない（ADR-0006）。**それでも `PageMeta` に含める**——含めないと
 * 「メタデータはこの関数が全部持つ」が崩れ、canonical だけ別の場所を見ることになる。
 *
 * **実測値では「推定」の語を出さない**（AC-9・ADR-0007）。有報そのままの数字に
 * 推定の体裁を被せない、という線はタイトルと description にも同じようにかかる。
 */
export function companyPageMeta(view: CompanyView, targetAge: TargetAge | null): PageMeta {
  const current = statsForBasis(view, targetAge);
  const canonical = `/company/${view.id}`;
  const position =
    `全${view.totalCount.toLocaleString("ja-JP")}社中${current.rankAll}位、` +
    `${view.tse33}${view.industryCount}社中${current.rankIndustry}位。`;

  if (targetAge === null) {
    return {
      canonical,
      title: `${view.name}の平均年収 | 有価証券報告書は${formatManYen(current.salary)}`,
      description:
        `${view.name}（${view.tse33}）の平均年間給与は${formatManYen(current.salary)}` +
        `（平均年齢${formatDecimal1(view.avgAge)}歳・平均勤続${formatDecimal1(view.avgTenure)}年）。${position}` +
        `金融庁 EDINET の有価証券報告書に載っている提出会社単体の実測値です。`,
    };
  }

  return {
    canonical,
    title: `${view.name}の年収 | ${targetAge}歳時点の推定は${formatManYen(current.salary)}`,
    description:
      `${view.name}（${view.tse33}）の${targetAge}歳時点の推定年収は${formatManYen(current.salary)}。${position}` +
      `有価証券報告書の平均年間給与${formatManYen(view.avgSalary)}（平均年齢${formatDecimal1(view.avgAge)}歳）を年齢で補正した推定値です。`,
  };
}

/** `app/company/[id]/page.tsx` の `generateMetadata` が返す形。包むだけ。 */
export function companyMetadata(view: CompanyView, targetAge: TargetAge | null): Metadata {
  return toMetadata(companyPageMeta(view, targetAge));
}
