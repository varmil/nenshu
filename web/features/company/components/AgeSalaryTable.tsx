import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design-system/ui/table";
import { formatManYen } from "@/features/ranking/lib/format";
import type { TargetAge } from "@/features/ranking/types";
import { TABLE_NO_VERTICAL_SCROLL } from "@/design-system/tableContainer";
import { ESTIMATE_RANGE_RATIO, estimateRange } from "../lib/stats";
import type { CompanyAgeStats } from "../types";

/**
 * 年齢別の推定年収の表（spec 1.14）。折れ線と同じ8点を数値で読ませる。
 *
 * **断り書きはこの表には置かない（Issue #95）。** 「目安の幅であって統計的な信頼区間
 * ではない」は、同じ `section` の中にあるチャートの `figcaption` が持つ——表・説明文・
 * チャートが縦に続く1つの塊なので、表の `caption` にも同じ文を置くと、一度の視界に
 * 同じ断りが2つ並ぶ。**断り自体を消すのではない**（AC-14）ので、figcaption と
 * `/about` の2か所は外さない。
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
    /*
      **罫線で仕切り、値は中央に置く**（C3、アートボード 4b）。8行×3列の数表で、
      罫線が無いと横に読むときに行を見失う。金額を右寄せにしないのは、列幅が
      内容より広く、右端に寄せると見出しと縦位置が揃わないため。
    */
    <div className={TABLE_NO_VERTICAL_SCROLL}>
      <Table className="border-border border">
        <TableHeader>
          <TableRow className="bg-muted">
            <TableHead className="border-border w-36 border text-center">年齢</TableHead>
            <TableHead className="border-border border text-center">推定年収</TableHead>
            <TableHead className="border-border border text-center">
              推定範囲（±{percent}%）
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {byAge.map((stats) => {
            const { low, high } = estimateRange(stats.salary);
            const isSelected = stats.targetAge === selectedAge;
            return (
              <TableRow key={stats.targetAge}>
                {/* 選択中の年齢の行だけ地を敷いて太くする（表とスイッチの対応を見せる）。 */}
                <TableCell
                  className={`border-border bg-muted text-muted-foreground border text-center ${
                    isSelected ? "text-foreground font-bold" : ""
                  }`}
                >
                  {stats.targetAge}歳
                </TableCell>
                <TableCell
                  className={`border-border border text-center tabular-nums ${
                    isSelected ? "bg-muted font-bold" : ""
                  }`}
                >
                  {formatManYen(stats.salary)}
                </TableCell>
                <TableCell
                  className={`border-border text-muted-foreground border text-center tabular-nums ${
                    isSelected ? "bg-muted" : ""
                  }`}
                >
                  {formatManYen(low)}〜{formatManYen(high)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
