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
                  <Link href={`/company/${company.id}`} className="hover:underline">
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
