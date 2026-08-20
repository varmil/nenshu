import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design-system/ui/table";
import { formatManYen } from "@/features/ranking/lib/format";
import type { TargetAge } from "@/features/ranking/types";
import { ESTIMATE_RANGE_RATIO, estimateRange } from "../lib/stats";
import type { CompanyAgeStats } from "../types";

/**
 * 年齢別の推定年収の表（spec 1.14）。折れ線と同じ8点を数値で読ませる。
 *
 * **推定範囲 ±20% は目安の幅であって、統計的な信頼区間ではない。** 賃金カーブは
 * 会社間の差から作った1本の平均的な形で、1社ごとのばらつきを推定する仕組みを
 * 持っていない。この断りを表から外さない（AC-14）。
 */
export function AgeSalaryTable({
  byAge,
  selectedAge,
}: {
  byAge: CompanyAgeStats[];
  selectedAge: TargetAge | null;
}) {
  const percent = Math.round(ESTIMATE_RANGE_RATIO * 100);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">年齢</TableHead>
          <TableHead className="text-right">推定年収</TableHead>
          <TableHead className="text-right">推定範囲（±{percent}%）</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {byAge.map((stats) => {
          const { low, high } = estimateRange(stats.salary);
          const isSelected = stats.targetAge === selectedAge;
          return (
            <TableRow key={stats.targetAge} className={isSelected ? "bg-muted" : undefined}>
              <TableCell className={isSelected ? "font-medium" : undefined}>
                {stats.targetAge}歳
              </TableCell>
              <TableCell
                className={`text-right tabular-nums ${isSelected ? "font-medium" : ""}`}
              >
                {formatManYen(stats.salary)}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {formatManYen(low)}〜{formatManYen(high)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      <TableCaption>
        推定範囲は推定年収の ±{percent}% です。
        <strong>目安の幅であって、統計的な信頼区間ではありません。</strong>
        賃金カーブは会社間の差から作った1本の平均的な形で、1社ごとのばらつきを推定する仕組みを持っていません。
      </TableCaption>
    </Table>
  );
}
