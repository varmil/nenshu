import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design-system/ui/table";
import { TABLE_NO_VERTICAL_SCROLL } from "@/design-system/tableContainer";
import { formatDecimal1 } from "@/features/ranking/lib/format";
import { buildTenureTable, formatYearsDiff } from "../lib/tenureHistory";
import type { TenureHistory } from "../types";

/**
 * 在籍年数の推移の表（T4・#835、モック 1a の表）。
 *
 * **器は平均年収の推移の表（`SalaryHistoryTable`）と同じ**——同じページに縦に並ぶ数表で、
 * 見た目が違うと別の種類の情報に見える。最新年の行だけ濃くするのも同じ。
 *
 * **3列目は基準年との差（年）。** 平均年収の表は比（%）だが、在籍年数の % は意味が取りにくい。
 * 比と同じく割り算・引き算で出した値なので文字を薄くする。
 *
 * **業種の中央値の列は置かない**（モックの表は 1a と同じ3列）。中央値は図の点線と説明文が持つ。
 */
export function TenureHistoryTable({ history }: { history: TenureHistory }) {
  const { rows, baseYear } = buildTenureTable(history);
  const latest = rows.reduce((found, row, i) => (row.value === null ? found : i), -1);

  return (
    <div className={`@container ${TABLE_NO_VERTICAL_SCROLL}`}>
      <Table className="border-border border">
        <TableHeader>
          <TableRow className="bg-muted">
            <TableHead className="border-border w-14 border text-center @md:w-24">年度</TableHead>
            <TableHead className="border-border border text-center">在籍年数</TableHead>
            <TableHead className="border-border border text-center">
              {baseYear === null ? "差" : `${baseYear}年との差`}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={row.year}>
              <TableCell
                className={`border-border bg-muted text-muted-foreground border text-center ${
                  i === latest ? "text-foreground font-bold" : ""
                }`}
              >
                {row.year}年
              </TableCell>
              <TableCell
                className={`border-border border text-center tabular-nums ${
                  i === latest ? "bg-muted font-bold" : ""
                }`}
              >
                {/* 値の無い年は行ごと落とさず「データなし」と出す（平均年収の表と同じ扱い）。 */}
                {row.value === null ? (
                  <span className="text-muted-foreground">データなし</span>
                ) : (
                  `${formatDecimal1(row.value)}年`
                )}
              </TableCell>
              <TableCell
                className={`border-border text-muted-foreground border text-center tabular-nums ${
                  i === latest ? "bg-muted" : ""
                }`}
              >
                {row.diff === null ? "" : formatYearsDiff(row.diff)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
