import { NavLink } from "@/features/navigation/components/NavLink";
import { Badge } from "@/design-system/ui/badge";
import { formatManYen } from "@/features/ranking/lib/format";
import type { NeighborCompany } from "../lib/neighbors";

/**
 * 「◯◯で水準が近い会社」（spec 1.12）。
 *
 * **比較表ではない。** 同じ業種で金額が近い5社を並べるだけで、優劣も推奨も付けない
 * （同業他社の比較表は spec 1.16 で対象外のまま）。「2,178万円」が高いのか低いのかは、
 * 順位や偏差値より「同じ業種のどのあたりに並ぶか」で伝わる。
 */
export function NeighborCompanies({
  neighbors,
  industry,
}: {
  neighbors: NeighborCompany[];
  industry: string;
}) {
  if (neighbors.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{industry}で水準が近い会社</h2>
      <ul className="flex flex-col gap-1.5">
        {neighbors.map((company) => (
          <li key={company.id} className="flex items-baseline justify-between gap-2 text-sm">
            {/* prefetch={false} の理由は RankingTable.tsx。 */}
            <NavLink
              href={`/company/${company.id}`}
              prefetch={false}
              className="text-primary min-w-0 truncate hover:underline"
            >
              {company.name}
            </NavLink>
            <span className="flex shrink-0 items-center gap-1">
              {company.hasBadge && <Badge variant="outline">本社のみ</Badge>}
              <span className="tabular-nums">{formatManYen(company.salary)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
