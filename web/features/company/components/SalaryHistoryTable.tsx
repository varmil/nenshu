import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design-system/ui/table";
import { TABLE_NO_VERTICAL_SCROLL } from "@/design-system/tableContainer";
import { formatManYen } from "@/features/ranking/lib/format";
import { buildHistoryTable, formatRate } from "../lib/historyTable";
import type { SalaryHistory } from "../types";

/**
 * 平均年収推移の表（T2・Issue #138、`docs/timeseries/spec.md` 2.5）。
 *
 * **器は年齢別の表（`AgeSalaryTable`）と同じ**——罫線で仕切り、値は中央に置く。同じページに
 * 数表が2つ並ぶので、見た目が違うと別の種類の情報に見える。
 *
 * **この表が AC-10（読み上げ）を担う。** グラフ側の `sr-only` の一覧は落としてある——同じ
 * 10件を読み上げる経路を2つ置かない。
 *
 * **最新年の行だけ濃くする**（棒グラフで最新年だけ濃いのと同じ理由。10行のうちどれが
 * 「いまの数字」かを、ページの他の場所に出ている金額と突き合わせずに見つけられるようにする）。
 */
export function SalaryHistoryTable({ history }: { history: SalaryHistory }) {
  const { rows, baseYear } = buildHistoryTable(history);
  const latest = rows.reduce((found, row, i) => (row.value === null ? found : i), -1);

  return (
    <div className={`@container ${TABLE_NO_VERTICAL_SCROLL}`}>
      <Table className="border-border border">
        <TableHeader>
          <TableRow className="bg-muted">
            <TableHead className="border-border w-14 border text-center @md:w-24">年度</TableHead>
            <TableHead className="border-border border text-center">平均年収</TableHead>
            <TableHead className="border-border border text-center">前年比</TableHead>
            {/*
              **基準年は会社ごとに違う。** 2017年の値を持たない会社が230社あるので、
              固定の年を見出しに焼くとその230社で列の意味と中身がずれる。
            */}
            <TableHead className="border-border border text-center">
              {baseYear === null ? "累積" : `${baseYear}年比`}
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
                {/* 値の無い年は行ごと落とさず「データなし」と出す（AC-7 と同じ扱い）。 */}
                {row.value === null ? (
                  <span className="text-muted-foreground">データなし</span>
                ) : (
                  formatManYen(row.value)
                )}
              </TableCell>
              <TableCell
                className={`border-border text-muted-foreground border text-center tabular-nums ${
                  i === latest ? "bg-muted" : ""
                }`}
              >
                {row.yoy === null ? "" : formatRate(row.yoy)}
              </TableCell>
              <TableCell
                className={`border-border text-muted-foreground border text-center tabular-nums ${
                  i === latest ? "bg-muted" : ""
                }`}
              >
                {row.cumulative === null ? "" : formatRate(row.cumulative)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
