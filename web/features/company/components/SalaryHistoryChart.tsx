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
 *
 * **棒の高さは器の幅で決める**（`--bar-max`）。PC で 80px しか立ち上がらず、
 * 10年ぶんの増減が読み取りにくかった（公開後の指摘）。年のラベルは棒とは別の
 * 行にして、間に1本の罫線を通す——棒が高くなるほど、揃っている先が要る。
 */
export function SalaryHistoryChart({
  history,
  summary,
}: {
  history: SalaryHistory;
  /** 増減の要約。図の下に軸の断りと1文で並べる（アートボード 4b）。 */
  summary: string | null;
}) {
  const values = history.values;
  const max = Math.max(...values.filter((v): v is number => v !== null));
  // 最新年だけ濃くする（C3、アートボード 4b）。10本のうちどれが「いまの数字」かは、
  // ページの他の場所に出ている金額と同じ棒を探さないと分からなかった。
  const latest = values.reduce((found, value, i) => (value === null ? found : i), -1);

  return (
    <figure className="@container flex flex-col gap-2">
      <div
        className="border-border flex items-end gap-1.5 border-b [--bar-max:6rem] @xl:[--bar-max:7.5rem]"
        role="presentation"
      >
        {history.years.map((year, i) => {
          const value = values[i];
          return (
            <div key={year} className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1">
              <span
                className={`text-[0.65rem] tabular-nums @xl:text-xs ${
                  i === latest ? "text-foreground font-bold" : "text-muted-foreground"
                }`}
              >
                {value === null ? "" : Math.round(value / 10000).toLocaleString("ja-JP")}
              </span>
              {value === null ? (
                <span className="text-muted-foreground/60 flex h-(--bar-max) items-end text-[0.65rem]">
                  なし
                </span>
              ) : (
                <span
                  className={`w-full rounded-t-sm ${i === latest ? "bg-primary" : "bg-chart-1 dark:bg-chart-3"}`}
                  style={{ height: `calc(var(--bar-max) * ${Math.max(0.02, value / max).toFixed(4)})` }}
                />
              )}
            </div>
          );
        })}
      </div>
      {/* 年のラベルは棒と同じ割り付け（`flex-1 basis-0`）にしないと1本ずつずれる。 */}
      <div className="flex gap-1.5" role="presentation">
        {history.years.map((year) => (
          <span
            key={year}
            className="text-muted-foreground min-w-0 flex-1 basis-0 text-center text-[0.65rem] tabular-nums @xl:text-xs"
          >
            {/* 西暦は4桁のまま出す（アートボード 4b）。下2桁だと「17」が何を指すか読めない。 */}
            {year}
          </span>
        ))}
      </div>

      <ul className="sr-only">
        {history.years.map((year, i) => (
          <li key={year}>
            {year}年 {values[i] === null ? "データなし" : formatManYen(values[i]!)}
          </li>
        ))}
      </ul>

      <figcaption className="text-muted-foreground text-xs">
        {summary ? `${summary} ` : ""}横軸は報告書の提出年です。
      </figcaption>
    </figure>
  );
}
