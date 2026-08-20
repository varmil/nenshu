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
import { deviationScore, formatDeviation } from "@/features/company/lib/stats";
import type { RankedCompany, TargetAge } from "../types";
import { displaySalary } from "../lib/rank";
import { formatManYen } from "../lib/format";
import { TABLE_NO_SCROLL } from "@/design-system/tableContainer";
import { CompanyLogoMark } from "./CompanyLogoMark";
import { CompanyMetaLine } from "./CompanyMetaLine";
import { SalaryBar } from "./SalaryBar";

export function RankingTable({
  companies,
  targetAge,
  pageMaxSalary,
  population,
}: {
  companies: RankedCompany[];
  targetAge: TargetAge | null;
  /** 年収バーの基準（そのページの1位）。 */
  pageMaxSalary: number;
  /** 現在の表示基準の母集団。偏差値と全体平均の線に使う。 */
  population: { mean: number; sd: number } | null;
}) {
  const isRaw = targetAge === null;

  return (
    /* 器のスクロールは止める。`table-fixed` で列幅を先に決めているのではみ出さない（tableContainer.ts）。 */
    <div className={`hidden md:block ${TABLE_NO_SCROLL}`}>
      {/*
        `table-fixed`。既定の自動レイアウトだと社名の列が中身の幅まで伸び、
        2カラムにしたぶん狭くなった本文からはみ出す（実測 978px / 枠 752px）。

        **列は4つ**（U13、アートボード 5a）。平均年齢・在籍年数・従業員数は
        社名の下の1行に移した——U12 の7列では社名の列に 200px 弱しか残らず、
        「三菱商事…」のように**一覧で最も重要な情報が省略記号で切れていた**。
        同じ数字が meta 行に移るだけなので、読める情報は減らない。
      */}
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-11">順位</TableHead>
            <TableHead>会社名</TableHead>
            <TableHead className="w-44">
              {/*
                実測値では「推定」バッジも「推定」の語も出さない（spec AC-9）。
                有報そのままの数字に推定の体裁を被せない。
              */}
              {isRaw ? (
                "平均年収（有報）"
              ) : (
                <span className="flex items-center gap-1.5">
                  推定年収（{targetAge}歳）
                  <Badge variant="secondary">推定</Badge>
                </span>
              )}
            </TableHead>
            <TableHead className="w-20 text-right">偏差値</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => {
            const salary = displaySalary(company);
            return (
              <TableRow key={company.id}>
                {/*
                  順位は行の目印なので、他の数字より大きく太くする（アートボード 5a）。
                  並び替えても振り直さないため、平均年齢順では 1,204 / 87 / … と飛ぶ。
                */}
                <TableCell className="text-lg font-bold tabular-nums">{company.rank}</TableCell>
                <TableCell>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <CompanyLogoMark name={company.name} />
                    <span className="flex min-w-0 flex-col">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {/*
                          prefetch={false}。既定の "auto" だと <Link> がビューポートに
                          入った時点で RSC ペイロードを取りに行き、**本番ビルドでは1
                          ページ表示するだけで数十件のリクエストが飛ぶ**（1ページ100件
                          だった頃の実測で34件）。1ページに PAGE_SIZE 社ぶん並ぶうえ
                          `/company/[id]` は動的レンダリングなので、そのぶんWorkerが
                          起動する（無料枠は10万リクエスト/日）。
                          **プリフェッチは本番でしか動かないため、devサーバーで走る
                          E2Eでは検出できない。** `npm run measure:prefetch` で測る。
                        */}
                        <NavLink
                          href={`/company/${company.id}`}
                          prefetch={false}
                          className="text-primary truncate font-bold hover:underline"
                        >
                          {company.name}
                        </NavLink>
                        {company.hasBadge && (
                          <Badge variant="outline" className="shrink-0">
                            本社のみ
                          </Badge>
                        )}
                      </span>
                      <span className="text-xs">
                        <CompanyMetaLine company={company} />
                      </span>
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="text-base font-bold tabular-nums">{formatManYen(salary)}</span>
                    <SalaryBar
                      value={salary}
                      max={pageMaxSalary}
                      mean={population?.mean ?? null}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {/*
                    **数字だけを出す**（アートボード 5a）。以前は「上位◯%」を下に
                    添えていたが、モックに無いものを足さない（運営者の指示）。
                    100 を超えうることと順位の読み方は表の脚注に置いてある。
                  */}
                  {population ? (
                    <span className="text-sm font-medium tabular-nums">
                      {formatDeviation(deviationScore(salary, population.mean, population.sd))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
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
          偏差値は分布が右に裾を引くため100を超えることがあります。水準は順位と併せて読んでください。
        </TableCaption>
      </Table>
    </div>
  );
}
