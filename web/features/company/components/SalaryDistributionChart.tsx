import { formatInt, formatManYen } from "@/features/ranking/lib/format";
import { formatBinLabel, formatBinTick, formatDeviation, positionPercent } from "../lib/stats";
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
    <figure className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {/*
          帯が何の帯かを言う見出し（アートボード 5b）。カードの左側にある偏差値と
          同じ値をここにも置くのは、**帯の右端＝偏差値の大きさ**という対応を
          その場で見せるため。
        */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold">
            全体{formatInt(count)}社の中の位置
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            偏差値 {formatDeviation(current.deviation)}
          </span>
        </div>
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

      {/*
        `min-w-0` と `basis-0`。**ラベルの文字数で列が押し広げられ、棒の太さが
        階級ごとに違っていた**（報告あり）。`flex-1` だけでは中身の最小幅が効くので、
        基準を0に固定して9等分にする。
      */}
      <div className="flex items-end gap-1" role="presentation">
        {distribution.counts.map((n, i) => (
          <div key={i} className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1">
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
            {/*
              **軸のラベルは1行に収める。** 完全な範囲（「500〜600万円」）を9つ並べると
              折り返して2行になり、階級ごとに軸の高さが変わって棒の下端が揃わなかった。
              読み上げ用の完全な範囲は下の `sr-only` の一覧にある。
            */}
            <span
              className={`text-[0.6rem] whitespace-nowrap tabular-nums ${
                i === bin ? "text-primary font-bold" : "text-muted-foreground"
              }`}
            >
              {formatBinTick(distribution, i)}
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
        全{formatInt(count)}社の分布（単位は万円）。{companyName}は
        {formatBinLabel(distribution, bin)}の帯（{formatInt(distribution.counts[bin])}社）にいます。
        両端の階級はそれより外側をすべて含みます。
      </figcaption>
    </figure>
  );
}
