import { formatManYen } from "@/features/ranking/lib/format";
import type { SalaryHistory } from "../types";

/**
 * 平均年収の10年推移（timeseries 施策・T1、`docs/timeseries/spec.md` 2.）。
 *
 * **表示基準の切替と独立に、常に実測値を出す。** 年齢そろえを選んでも過去の
 * 有報に載った数字は変わらない。
 *
 * **値の無い年は棒を描かず、軸ラベルは残す**（AC-7）。内挿しない。
 *
 * 依存を足さずCSSと`<div>`で描く。縦軸は0起点でよい——年齢別の折れ線と違い、
 * ここで見たいのは水準そのものの増減である（`docs/timeseries/overview.md`）。
 */
export function SalaryHistoryChart({ history }: { history: SalaryHistory }) {
  const values = history.values;
  const max = Math.max(...values.filter((v): v is number => v !== null));

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex items-end gap-1.5" role="presentation">
        {history.years.map((year, i) => {
          const value = values[i];
          return (
            <div key={year} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-muted-foreground text-[0.6rem] tabular-nums">
                {value === null ? "" : Math.round(value / 10000).toLocaleString("ja-JP")}
              </span>
              {value === null ? (
                <span className="text-muted-foreground/60 flex h-20 items-end text-[0.6rem]">
                  なし
                </span>
              ) : (
                <span
                  className="bg-primary w-full rounded-t-sm"
                  style={{ height: `${Math.max(2, (value / max) * 80)}px` }}
                />
              )}
              <span className="text-muted-foreground text-[0.6rem] tabular-nums">
                {String(year).slice(2)}
              </span>
            </div>
          );
        })}
      </div>

      <ul className="sr-only">
        {history.years.map((year, i) => (
          <li key={year}>
            {year}年 {values[i] === null ? "データなし" : formatManYen(values[i]!)}
          </li>
        ))}
      </ul>

      <figcaption className="text-muted-foreground text-xs">
        横軸は有価証券報告書の提出年（下2桁）、数値は平均年間給与（万円）です。縦軸は0起点。
        各年の有報に載った提出会社単体の実測値で、年齢の補正は通していません。
      </figcaption>
    </figure>
  );
}
