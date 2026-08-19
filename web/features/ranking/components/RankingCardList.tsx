import { Card, CardContent, CardHeader } from "@/design-system/ui/card";
import { NavLink } from "@/features/navigation/components/NavLink";
import { Badge } from "@/design-system/ui/badge";
import type { RankedCompany, TargetAge } from "../types";
import { formatDecimal1, formatInt, formatManYen } from "../lib/format";

export function RankingCardList({
  companies,
  targetAge,
}: {
  companies: RankedCompany[];
  targetAge: TargetAge;
}) {
  return (
    <div className="flex flex-col gap-3 md:hidden">
      {companies.map((company) => (
        <Card key={company.id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-muted-foreground text-xs">{company.rank}位</span>
                <p className="font-medium">
                  {/* prefetch={false} の理由は RankingTable.tsx を参照。 */}
                  <NavLink
                    href={`/company/${company.id}`}
                    prefetch={false}
                    className="text-primary hover:underline"
                  >
                    {company.name}
                  </NavLink>
                </p>
                <p className="text-muted-foreground text-xs">{company.tse33}</p>
              </div>
              {company.hasBadge && <Badge variant="outline">本社のみ</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-3">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-xs">{targetAge}歳時点の推定年収</span>
                <Badge variant="secondary">推定</Badge>
              </div>
              <p className="text-3xl font-bold">
                {formatManYen(company.estimatedSalary)}
              </p>
            </div>
            <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div className="flex justify-between">
                <dt>平均年齢</dt>
                <dd>{formatDecimal1(company.avgAge)}歳</dd>
              </div>
              <div className="flex justify-between">
                <dt>在籍年数</dt>
                <dd>{formatDecimal1(company.avgTenure)}年</dd>
              </div>
              <div className="flex justify-between">
                <dt>平均年収</dt>
                <dd>{formatManYen(company.avgSalary)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>従業員数</dt>
                <dd>{formatInt(company.employees)}人</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      ))}
      <p className="text-muted-foreground text-xs">
        推定年収は年齢補正後の推定値です。実際の年収を保証するものではありません。
      </p>
    </div>
  );
}
