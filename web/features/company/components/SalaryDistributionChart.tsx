import { formatInt, formatManYen } from "@/features/ranking/lib/format";
import { formatBinLabel, formatTopPercent, positionPercent } from "../lib/stats";
import type { CompanyAgeStats } from "../types";

/**
 * 母集団の中での位置（spec 1.13）。位置バーと9ビンのヒストグラム。
 *
 * **平均との差だけでは、右に強く裾を引く分布の中で「やや上」なのか「裾のほう」なのか
 * が区別できない。** 偏差値が100を超える理由そのものがこの形にある。
 *
 * 依存を足さずCSSと`<div>`で描く（recharts は使わない）。9本の棒に SVG は要らない。
 */
export function SalaryDistributionChart({
  current,
  count,
  companyName,
}: {
  current: CompanyAgeStats;
  count: number;
  companyName: string;
}) {
  const { distribution, bin } = current;
  const maxCount = Math.max(...distribution.counts);
  const position = positionPercent(current.rankAll, count);
  const medianPosition = 50;

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="bg-muted relative h-2 w-full overflow-hidden rounded-full">
          <div
            className="from-muted to-chart-1 h-full bg-gradient-to-r"
            style={{ width: `${position.toFixed(1)}%` }}
          />
          <span
            aria-hidden="true"
            className="bg-primary absolute inset-y-0 w-1 rounded-full"
            style={{ left: `calc(${position.toFixed(1)}% - 2px)` }}
          />
          <span
            aria-hidden="true"
            className="bg-foreground/40 absolute inset-y-0 w-px"
            style={{ left: `${medianPosition}%` }}
          />
        </div>
        {/* 端は順位で言う（アートボード 5b）。「下位／上位」だけでは何位の話か分からない。 */}
        <div className="text-muted-foreground flex justify-between text-[0.65rem]">
          <span>{formatInt(count)}位</span>
          <span>中位 {formatManYen(current.populationMedian)}</span>
          <span>1位</span>
        </div>
      </div>

      <div className="flex items-end gap-1" role="presentation">
        {distribution.counts.map((n, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            {/*
              社数を棒の上に出す（C3、アートボード 4b）。**棒の高さは相対値でしか
              読めない**ので、9本の形だけでは「170社」なのか「17社」なのかが分からない。
            */}
            <span
              className={`text-[0.6rem] tabular-nums ${
                i === bin ? "text-primary font-bold" : "text-muted-foreground"
              }`}
            >
              {formatInt(n)}
            </span>
            <span
              className={`w-full rounded-t-sm ${i === bin ? "bg-primary" : "bg-chart-1 dark:bg-chart-3"}`}
              style={{ height: `${Math.max(2, (n / maxCount) * 72)}px` }}
            />
            <span
              className={`text-center text-[0.6rem] leading-tight ${
                i === bin ? "text-primary font-medium" : "text-muted-foreground"
              }`}
            >
              {formatBinLabel(distribution, i).replace("万円", "").replace("以上", "〜")}
            </span>
          </div>
        ))}
      </div>

      {/* 画像ではなく数値として読み上げられるようにする（spec 2. アクセシビリティ）。 */}
      <ul className="sr-only">
        {distribution.counts.map((n, i) => (
          <li key={i}>
            {formatBinLabel(distribution, i)} {n}社{i === bin ? `（${companyName}はここ）` : ""}
          </li>
        ))}
      </ul>

      <figcaption className="text-muted-foreground text-xs">
        全{count.toLocaleString("ja-JP")}社の分布（単位は万円）。色の濃い階級が{companyName}の位置で、
        {formatTopPercent(current.topPercent)}にあたります。両端の階級はそれより外側をすべて含みます。
      </figcaption>
    </figure>
  );
}
