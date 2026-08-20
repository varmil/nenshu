import { NavLink } from "@/features/navigation/components/NavLink";
import { Badge } from "@/design-system/ui/badge";
import { deviationScore, formatDeviation } from "@/features/company/lib/stats";
import type { RankedCompany, TargetAge } from "../types";
import { displaySalary } from "../lib/rank";
import { formatManYen } from "../lib/format";
import { CompanyLogoMark } from "./CompanyLogoMark";
import { CompanyMetaLine } from "./CompanyMetaLine";
import { SalaryBar } from "./SalaryBar";

/**
 * モバイルの行（U13、アートボード 5c）。
 *
 * **カードの枠を外して区切り線だけにする。** U12 は1社ごとに `Card` で囲んでいたが、
 * 枠が100本並ぶと枠自体が模様になり、行の切れ目が読み取りにくかった。上下の余白と
 * 1本の細い線のほうが、同じ密度でも境目がはっきりする。
 */
export function RankingCardList({
  companies,
  targetAge,
  pageMaxSalary,
  population,
}: {
  companies: RankedCompany[];
  targetAge: TargetAge | null;
  pageMaxSalary: number;
  population: { mean: number; sd: number } | null;
}) {
  const isRaw = targetAge === null;

  return (
    <div className="flex flex-col md:hidden">
      {companies.map((company) => {
        const salary = displaySalary(company);
        return (
          <div
            key={company.id}
            className="border-border flex flex-col gap-1.5 border-b py-2.5"
          >
            <div className="flex items-start gap-2">
              <span className="w-7 shrink-0 pt-0.5 text-right text-base font-bold tabular-nums">
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
                <CompanyMetaLine company={company} omitTenure />
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold tabular-nums">{formatManYen(salary)}</p>
                {/*
                  **実測値のときは何も添えない**（アートボード 5c）。有報そのままの
                  数字に注記を付けると、かえって加工したように見える。年齢そろえの
                  ときだけ「推定」であることを行ごとに示す（AC-9）——モバイルには
                  列見出しが無く、ここを省くとページ末尾の注記しか手掛かりが無くなる。
                */}
                {!isRaw && (
                  <p className="text-muted-foreground text-[0.7rem]">{targetAge}歳・推定</p>
                )}
                {/* **数字だけを出す**（アートボード 5c）。モックに無いものを足さない。 */}
                {population && (
                  <p className="text-muted-foreground text-[0.7rem] tabular-nums">
                    偏差値{" "}
                    {formatDeviation(deviationScore(salary, population.mean, population.sd))}
                  </p>
                )}
              </div>
            </div>
            <SalaryBar value={salary} max={pageMaxSalary} mean={population?.mean ?? null} />
          </div>
        );
      })}
      <p className="text-muted-foreground pt-3 text-xs">
        {isRaw
          ? "有価証券報告書の平均年間給与（提出会社単体）そのままです。年齢の違いは補正していません。"
          : "推定年収は年齢補正後の推定値です。実際の年収を保証するものではありません。"}
        {" "}
        帯はこのページの1位を100%とした相対の長さで、細い縦線は全体平均
        {population ? `（${formatManYen(population.mean)}）` : ""}の位置です。
        偏差値は分布が右に裾を引くため100を超えることがあります。水準は順位と併せて読んでください。
      </p>
    </div>
  );
}
