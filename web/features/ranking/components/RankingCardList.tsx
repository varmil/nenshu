import { Card, CardContent } from "@/design-system/ui/card";
import { NavLink } from "@/features/navigation/components/NavLink";
import { Badge } from "@/design-system/ui/badge";
import {
  deviationScore,
  formatDeviation,
  formatTopPercent,
  topPercent,
} from "@/features/company/lib/stats";
import type { RankedCompany, TargetAge } from "../types";
import { displaySalary } from "../lib/rank";
import { formatDecimal1, formatInt, formatManYen } from "../lib/format";
import { CompanyLogoMark } from "./CompanyLogoMark";
import { SalaryBar } from "./SalaryBar";

export function RankingCardList({
  companies,
  targetAge,
  pageMaxSalary,
  population,
  populationCount,
}: {
  companies: RankedCompany[];
  targetAge: TargetAge | null;
  pageMaxSalary: number;
  population: { mean: number; sd: number } | null;
  /** 母集団の社数（1,867）。上位◯%の分母。 */
  populationCount: number;
}) {
  const isRaw = targetAge === null;

  return (
    <div className="flex flex-col gap-2 md:hidden">
      {companies.map((company) => {
        const salary = displaySalary(company);
        return (
          <Card key={company.id}>
            {/* 行の高密度化（Issue #41）。CardHeader を挟まず1枚の中に収める。 */}
            <CardContent className="flex flex-col gap-2 p-3">
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground w-8 shrink-0 pt-1.5 text-right text-xs tabular-nums">
                  {company.rank}
                </span>
                <CompanyLogoMark name={company.name} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium">
                    {/* prefetch={false} の理由は RankingTable.tsx を参照。 */}
                    <NavLink
                      href={`/company/${company.id}`}
                      prefetch={false}
                      className="text-primary hover:underline"
                    >
                      {company.name}
                    </NavLink>
                    {company.hasBadge && <Badge variant="outline">本社のみ</Badge>}
                  </p>
                  <p className="text-muted-foreground text-xs">{company.tse33}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xl font-bold tabular-nums">{formatManYen(salary)}</p>
                  {/* 実測値では「推定」の語を出さない（spec AC-9）。 */}
                  <p className="text-muted-foreground text-[0.65rem]">
                    {isRaw ? "有報" : `${targetAge}歳・推定`}
                  </p>
                </div>
              </div>
              <SalaryBar value={salary} max={pageMaxSalary} mean={population?.mean ?? null} />
              <dl className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                {/* 偏差値は単独で出さない（glossary）。上位◯%を必ず隣に置く。 */}
                {population && (
                  <div className="flex gap-1">
                    <dt>偏差値</dt>
                    <dd className="tabular-nums">
                      {formatDeviation(deviationScore(salary, population.mean, population.sd))}
                      <span className="ml-1">
                        （{formatTopPercent(topPercent(company.populationRank, populationCount))}）
                      </span>
                    </dd>
                  </div>
                )}
                <div className="flex gap-1">
                  <dt>平均年齢</dt>
                  <dd className="tabular-nums">{formatDecimal1(company.avgAge)}歳</dd>
                </div>
                <div className="flex gap-1">
                  <dt>在籍</dt>
                  <dd className="tabular-nums">{formatDecimal1(company.avgTenure)}年</dd>
                </div>
                <div className="flex gap-1">
                  <dt>従業員</dt>
                  <dd className="tabular-nums">{formatInt(company.employees)}人</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        );
      })}
      <p className="text-muted-foreground text-xs">
        {isRaw
          ? "有価証券報告書の平均年間給与（提出会社単体）そのままです。年齢の違いは補正していません。"
          : "推定年収は年齢補正後の推定値です。実際の年収を保証するものではありません。"}
        {" "}
        帯はこのページの1位を100%とした相対の長さで、細い縦線は全体平均
        {population ? `（${formatManYen(population.mean)}）` : ""}の位置です。
        偏差値は分布が右に裾を引くため100を超えることがあり、上位◯%を併記しています。
      </p>
    </div>
  );
}
