import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design-system/ui/table";
import { TABLE_NO_VERTICAL_SCROLL } from "@/design-system/tableContainer";
import { formatInt } from "@/features/ranking/lib/format";
import type { ProfitHistory } from "../types";
import { formatOku, formatSignedManYen } from "../lib/profitHistory";

/**
 * 稼ぐ力の推移の表（P2・Issue #168・アートボード 6e）。
 *
 * **器は平均年収推移の表（`SalaryHistoryTable`）と同じ。** 同じページに数表が3つ
 * 並ぶので、見た目が違うと別の種類の情報に見える。**列だけが違う**——あちらは
 * 1つの金額の前年比・累積で、こちらは割り算の分子と分母を並べる。
 *
 * **分子と分母を並べて出す**（アートボード 6e）。稼ぐ力は経常利益 ÷ 従業員数で、
 * 分母が10年で倍になった会社では「利益は増えたのに稼ぐ力は横ばい」が起きる。
 * **その内訳を見せないと、値が動いた理由を読者が確かめられない。**
 */
export function ProfitHistoryTable({ history }: { history: ProfitHistory }) {
  const latest = history.profit.reduce((found, value, i) => (value === null ? found : i), -1);

  return (
    <div className={`@container ${TABLE_NO_VERTICAL_SCROLL}`}>
      <Table className="border-border border">
        <TableHeader>
          <TableRow className="bg-muted">
            <TableHead className="border-border w-14 border text-center @md:w-24">年度</TableHead>
            <TableHead className="border-border border text-center">稼ぐ力</TableHead>
            <TableHead className="border-border border text-center">従業員数</TableHead>
            <TableHead className="border-border border text-center">経常利益</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.years.map((year, i) => (
            <TableRow key={year}>
              <TableCell
                className={`border-border bg-muted text-muted-foreground border text-center ${
                  i === latest ? "text-foreground font-bold" : ""
                }`}
              >
                {year}年
              </TableCell>
              <TableCell
                className={`border-border border text-center tabular-nums ${
                  i === latest ? "bg-muted font-bold" : ""
                }`}
              >
                {/*
                  **値の無い年は行ごと落とさず「データなし」と出す**（推移の既存の
                  扱いと同じ）。従業員数はその年の書類の当期からしか取れないので、
                  経常利益はあっても稼ぐ力が出ない年がある。
                */}
                {history.profit[i] === null ? (
                  <span className="text-muted-foreground">データなし</span>
                ) : (
                  formatSignedManYen(history.profit[i] as number)
                )}
              </TableCell>
              <TableCell
                className={`border-border text-muted-foreground border text-center tabular-nums ${
                  i === latest ? "bg-muted" : ""
                }`}
              >
                {history.employees[i] === null
                  ? ""
                  : `${formatInt(history.employees[i] as number)}人`}
              </TableCell>
              <TableCell
                className={`border-border text-muted-foreground border text-center tabular-nums ${
                  i === latest ? "bg-muted" : ""
                }`}
              >
                {history.income[i] === null ? "" : formatOku(history.income[i] as number)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
