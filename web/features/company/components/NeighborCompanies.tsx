import { NavLink } from "@/features/navigation/components/NavLink";
import { CompanyLogo } from "@/features/logo/components/CompanyLogo";
import { formatDecimal1, formatInt, formatManYen } from "@/features/ranking/lib/format";
import type { NeighborCompany } from "../lib/neighbors";

/**
 * 「◯◯で水準が近い会社」（spec 1.12）。
 *
 * **比較表ではない。** 同じ業種で金額が近い5社を並べるだけで、優劣も推奨も付けない
 * （同業他社の比較表は spec 1.16 で対象外のまま）。「2,178万円」が高いのか低いのかは、
 * 順位や偏差値より「同じ業種のどのあたりに並ぶか」で伝わる。
 *
 * **各行に業界順位と平均年齢を添える**（C3、アートボード 5b）。社名と金額だけだと、
 * 並んでいる5社が上に居るのか下に居るのかが読み取れなかった。
 *
 * 末尾に業種一覧への導線を置く。ここは `?ind=` の実体を持つリンクで、ランキングの
 * 業種チップと同じ経路になる（ADR-0006）。
 */
export function NeighborCompanies({
  neighbors,
  industry,
  industryCount,
}: {
  neighbors: NeighborCompany[];
  industry: string;
  /** 同じ業種の社数。「◯◯150社をすべて見る」に使う。 */
  industryCount: number;
}) {
  if (neighbors.length === 0) return null;

  return (
    <section className="border-border flex flex-col gap-2.5 rounded-lg border p-4">
      <h2 className="text-sm font-bold">{industry}で水準が近い会社</h2>
      <ul className="flex flex-col">
        {neighbors.map((company) => (
          <li
            key={company.id}
            className="border-border flex items-center gap-2.5 border-t py-2.5 first:border-t-0 first:pt-0"
          >
            <CompanyLogo id={company.id} name={company.name} size="sm" />
            <div className="min-w-0 flex-1">
              {/*
                **「本社のみ」は出さない**（運営者の指示）。316px の列にバッジを足すと
                社名がそのぶん切れる。バッジの意味はその会社のページで説明している。
              */}
              {/* prefetch={false} の理由は RankingTable.tsx。 */}
              <NavLink
                href={`/company/${company.id}`}
                prefetch={false}
                className="text-primary block truncate text-sm hover:underline"
              >
                {company.name}
              </NavLink>
              <p className="text-muted-foreground text-[0.7rem]">
                業界{formatInt(company.industryRank)}位・平均{formatDecimal1(company.avgAge)}歳
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {formatManYen(company.salary)}
            </span>
          </li>
        ))}
      </ul>
      <NavLink
        href={`/?ind=${encodeURIComponent(industry)}`}
        prefetch={false}
        className="text-primary text-xs underline"
      >
        {industry}
        {formatInt(industryCount)}社をすべて見る
      </NavLink>
    </section>
  );
}
