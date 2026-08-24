import type { Metadata } from "next";
import { statsForBasis } from "@/features/company/lib/stats";
import type { CompanyView } from "@/features/company/types";
import { formatDecimal1, formatManYen } from "@/features/ranking/lib/format";
import { toMetadata, type PageMeta } from "./pageMeta";

/**
 * 企業詳細ページの title・description・canonical（C1 で `generateMetadata` に
 * 直書きしていたものを U16 でここへ出した）。
 *
 * **ビルド時に1度決まればそれきりで、クライアントは書き換えない**（R1・ADR-0012）。
 * このページは全社を事前生成しており、表示基準（年齢そろえ）は URL に出さず
 * クライアントの状態としてだけ持つ。URL が動かないのでメタデータも動かない。
 *
 * **出す数字は有報の実測値だけ。** 年齢そろえに切り替えても「有価証券報告書は
 * 598万円」は嘘にならない——実測値は画面の「有価証券報告書の実測値」の節に
 * 常に出ている。U16 が企業詳細で直していた食い違い（親 Issue #130）は、
 * `?age=` を無くしたことで起きようが無くなった。
 *
 * **canonical は素の `/company/[id]`。** `?age=N` はもう出さないが、配ってしまった
 * リンクが残るので寄せ先としては変わらず必要（ADR-0006）。**それでも `PageMeta` に
 * 含める**——含めないと「メタデータはこの関数が全部持つ」が崩れ、canonical だけ
 * 別の場所を見ることになる。
 *
 * **「推定」の語を出さない**（AC-9・ADR-0007）。有報そのままの数字に推定の体裁を
 * 被せない、という線はタイトルと description にも同じようにかかる。
 *
 * **決算期は description にだけ入れる**（S3・Issue #134・`docs/site-chrome/spec.md` 5.）。
 * タイトルは会社名と金額で既に埋まっており、押し出す価値のあるものが無い。
 * 文字列にするのは呼び出し側（`lib/data/period.ts` の `fiscalPeriodLabel`）。
 */
export function companyPageMeta(view: CompanyView, fiscalPeriod: string): PageMeta {
  const current = statsForBasis(view, null);
  const position =
    `全${view.totalCount.toLocaleString("ja-JP")}社中${current.rankAll}位、` +
    `${view.tse33}${view.industryCount}社中${current.rankIndustry}位。`;

  return {
    canonical: `/company/${view.id}`,
    title: `${view.name}の平均年収 | 有価証券報告書は${formatManYen(current.salary)}`,
    description:
      `${view.name}（${view.tse33}）の平均年間給与は${formatManYen(current.salary)}` +
      `（平均年齢${formatDecimal1(view.avgAge)}歳・平均勤続${formatDecimal1(view.avgTenure)}年）。${position}` +
      `金融庁 EDINET の有価証券報告書（${fiscalPeriod}）に載っている提出会社単体の実測値です。`,
  };
}

/** `app/company/[id]/page.tsx` の `generateMetadata` が返す形。包むだけ。 */
export function companyMetadata(view: CompanyView, fiscalPeriod: string): Metadata {
  return toMetadata(companyPageMeta(view, fiscalPeriod));
}
