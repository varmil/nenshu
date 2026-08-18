import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design-system/ui/table";
import Link from "next/link";
import { Badge } from "@/design-system/ui/badge";
import type { RankedCompany, TargetAge } from "../types";
import { formatDecimal1, formatInt, formatManYen } from "../lib/format";

export function RankingTable({
  companies,
  targetAge,
}: {
  companies: RankedCompany[];
  targetAge: TargetAge;
}) {
  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">順位</TableHead>
            <TableHead>会社名</TableHead>
            <TableHead>業種</TableHead>
            <TableHead>
              <span className="flex items-center gap-1.5">
                {targetAge}歳時点の推定年収
                <Badge variant="secondary">推定</Badge>
              </span>
            </TableHead>
            <TableHead>平均年齢</TableHead>
            <TableHead>平均年収（実績）</TableHead>
            <TableHead>在籍年数</TableHead>
            <TableHead>従業員数</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => (
            <TableRow key={company.id}>
              <TableCell className="text-muted-foreground">{company.rank}</TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  {/*
                    prefetch={false}。既定の "auto" だと <Link> がビューポートに入った
                    時点で RSC ペイロードを取りに行き、**本番ビルドでは1ページ表示する
                    だけで数十件のリクエストが飛ぶ**（1ページ100件だった頃の実測で34件）。
                    1ページぶんの会社名がすべて<Link>になるうえ
                    `/company/[id]` は動的レンダリングなので、そのぶんWorkerが起動する
                    （無料枠は10万リクエスト/日）。読者が開くのはせいぜい1社なので、
                    投機的な先読みは割に合わない。
                    **プリフェッチは本番でしか動かないため、devサーバーで走るE2Eでは
                    検出できない。** `npm run measure:prefetch` で測る。
                  */}
                  <Link
                    href={`/company/${company.id}`}
                    prefetch={false}
                    className="hover:underline"
                  >
                    {company.name}
                  </Link>
                  {company.hasBadge && <Badge variant="outline">本社のみ</Badge>}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">{company.tse33}</TableCell>
              <TableCell>
                <span className="text-primary text-2xl font-bold">
                  {formatManYen(company.estimatedSalary)}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDecimal1(company.avgAge)}歳
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatManYen(company.avgSalary)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDecimal1(company.avgTenure)}年
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatInt(company.employees)}人
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableCaption>
          推定年収は年齢補正後の推定値です。実際の年収を保証するものではありません。
        </TableCaption>
      </Table>
    </div>
  );
}
