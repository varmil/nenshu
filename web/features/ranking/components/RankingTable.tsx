import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design-system/ui/table";
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

export function RankingTable({
  companies,
  targetAge,
  pageMaxSalary,
  population,
  populationCount,
}: {
  companies: RankedCompany[];
  targetAge: TargetAge | null;
  /** 年収バーの基準（そのページの1位）。 */
  pageMaxSalary: number;
  /** 現在の表示基準の母集団。偏差値と全体平均の線に使う。 */
  population: { mean: number; sd: number } | null;
  /** 母集団の社数（1,867）。上位◯%の分母。 */
  populationCount: number;
}) {
  const isRaw = targetAge === null;

  return (
    <div className="hidden md:block">
      {/*
        `table-fixed`。既定の自動レイアウトだと社名の列が中身の幅まで伸び、
        2カラムにしたぶん狭くなった本文からはみ出す（実測 978px / 枠 752px）。
        列幅を先に決めて、入らない社名は省略記号で切る。
      */}
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-right">順位</TableHead>
            <TableHead>会社名</TableHead>
            <TableHead className="w-56">
              {/*
                実測値では「推定」バッジも「推定」の語も出さない（spec AC-9）。
                有報そのままの数字に推定の体裁を被せない。
              */}
              {isRaw ? (
                "平均年収（有報）"
              ) : (
                <span className="flex items-center gap-1.5">
                  {targetAge}歳時点の推定年収
                  <Badge variant="secondary">推定</Badge>
                </span>
              )}
            </TableHead>
            <TableHead className="w-14 text-right">偏差値</TableHead>
            <TableHead className="w-16 text-right">平均年齢</TableHead>
            <TableHead className="w-16 text-right">在籍年数</TableHead>
            <TableHead className="w-24 text-right">従業員数</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => {
            const salary = displaySalary(company);
            return (
              <TableRow key={company.id}>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {company.rank}
                </TableCell>
                <TableCell>
                  <span className="flex min-w-0 items-center gap-2">
                    <CompanyLogoMark name={company.name} />
                    <span className="flex min-w-0 flex-col">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {/*
                          prefetch={false}。既定の "auto" だと <Link> がビューポートに
                          入った時点で RSC ペイロードを取りに行き、**本番ビルドでは1
                          ページ表示するだけで数十件のリクエストが飛ぶ**（実測34件）。
                          1ページに100社並ぶうえ `/company/[id]` は動的レンダリング
                          なので、そのぶんWorkerが起動する（無料枠は10万リクエスト/日）。
                          **プリフェッチは本番でしか動かないため、devサーバーで走る
                          E2Eでは検出できない。** `npm run measure:prefetch` で測る。
                        */}
                        <NavLink
                          href={`/company/${company.id}`}
                          prefetch={false}
                          className="text-primary truncate hover:underline"
                        >
                          {company.name}
                        </NavLink>
                        {company.hasBadge && <Badge variant="outline">本社のみ</Badge>}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {company.tse33}
                      </span>
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="text-xl font-bold tabular-nums">{formatManYen(salary)}</span>
                    <SalaryBar
                      value={salary}
                      max={pageMaxSalary}
                      mean={population?.mean ?? null}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-right">
                  {/*
                    偏差値は単独で出さない（glossary）。分布が右に裾を引くので100を
                    超え、数字だけでは水準が伝わらない。上位◯%を必ず隣に置く。
                  */}
                  {population ? (
                    <span className="flex flex-col leading-tight">
                      <span className="tabular-nums">
                        {formatDeviation(deviationScore(salary, population.mean, population.sd))}
                      </span>
                      <span className="text-[0.65rem]">
                        {formatTopPercent(topPercent(company.populationRank, populationCount))}
                      </span>
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {formatDecimal1(company.avgAge)}歳
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {formatDecimal1(company.avgTenure)}年
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {formatInt(company.employees)}人
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableCaption>
          {isRaw
            ? "有価証券報告書の平均年間給与（提出会社単体）そのままです。年齢の違いは補正していません。"
            : "推定年収は年齢補正後の推定値です。実際の年収を保証するものではありません。"}
          {" "}
          帯はこのページの1位を100%とした相対の長さで、細い縦線は全体平均
          {population ? `（${formatManYen(population.mean)}）` : ""}の位置です。
          偏差値は分布が右に裾を引くため100を超えることがあり、上位◯%を併記しています。
        </TableCaption>
      </Table>
    </div>
  );
}
