import { formatDecimal1 } from "@/features/ranking/lib/format";
import type { TenureHistory } from "../types";
import { buildTenureChart } from "../lib/tenureHistory";
import { TEXT_TICK, TEXT_UNIT, TEXT_VALUE } from "./chartText";

/**
 * 在籍年数の10年ぶんの折れ線と、業種の中央値の点線（T4・#835、モック 1b）。
 *
 * **描き方は年齢別の折れ線（`SalaryCurveChart`）にそろえる。** 縦軸は0起点にせず、各点に値を
 * 書き、最新年の点だけ塗る。文字の大きさも同じ（`chartText.ts`）。
 *
 * **値の無い年は線をつながない**（AC-20）。平均年収の棒が欠損年を描かないのと同じで、
 * 内挿しない。年のラベルは10年ぶん残す。
 *
 * **会社の値の読み上げは下の表が担う**（平均年収の推移と同じ。同じ10件を読み上げる経路を
 * 2つ置かない）。表に無いのは中央値だけなので、`aria-label` はそちらを言う。
 */
export function TenureHistoryChart({
  history,
  industry,
}: {
  history: TenureHistory;
  industry: string;
}) {
  const chart = buildTenureChart(history);
  const { width, height, padding } = chart;
  const medians = history.years
    .map((year, i) => ({ year, value: history.industryMedian[i] }))
    .filter((m): m is { year: number; value: number } => m.value !== null);

  return (
    <figure className="@container flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={
          `在籍年数の推移（実線）と${industry}の中央値（点線）。中央値は` +
          medians.map((m) => `${m.year}年 ${formatDecimal1(m.value)}年`).join("、")
        }
      >
        {/* 単位は左端から書き出す（`SalaryCurveChart` と同じ。右揃えだと狭い器で左に切れる）。 */}
        <text x={2} y={padding.top - 18} className={TEXT_UNIT} fill="var(--color-muted-foreground)">
          （年）
        </text>
        {chart.ticks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={tick.y}
              y2={tick.y}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <text
              x={padding.left - 10}
              y={tick.y}
              textAnchor="end"
              dominantBaseline="central"
              className={TEXT_TICK}
              fill="var(--color-muted-foreground)"
            >
              {tick.value}
            </text>
          </g>
        ))}
        <path
          d={chart.medianLine}
          fill="none"
          stroke="var(--color-muted-foreground)"
          strokeWidth={1.75}
          strokeDasharray="5 5"
          data-testid="tenure-median-line"
        />
        {chart.medianLabel && (
          <text
            x={chart.medianLabel.x}
            y={chart.medianLabel.y}
            // 会社の線と反対側に置く（`buildTenureChart` が決める）。
            dy={chart.medianLabel.below ? "1.35em" : "-0.55em"}
            textAnchor="end"
            className={TEXT_UNIT}
            fill="var(--color-muted-foreground)"
          >
            業種の中央値 {formatDecimal1(chart.medianLabel.value)}
          </text>
        )}
        <path
          d={chart.line}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          data-testid="tenure-line"
        />
        {chart.points.map((point) => {
          const isFirst = point.index === 0;
          return (
            <g key={point.year}>
              <circle
                cx={point.cx}
                cy={point.cy}
                r={point.latest ? 6 : 3.5}
                fill={point.latest ? "var(--color-primary)" : "var(--color-background)"}
                stroke="var(--color-primary)"
                strokeWidth={2}
              />
              {/*
                **中央揃え。** 値は4文字（`12.4`）までで、最も大きい字（22）でも幅は約43と点の間隔
                （69）に収まり、右端も余白（36）の内側に収まる。年齢別の折れ線のように両端を内側へ
                寄せると、寄せたぶん隣のラベルに近づく（390px で先頭の2つが接していた）。
                **先頭だけ12右へずらす**——点は縦軸の上にあり、中央揃えのままだと目盛の数字に掛かる。
              */}
              <text
                x={isFirst ? point.cx + 12 : point.cx}
                y={point.cy}
                dy={point.labelBelow ? "1.45em" : "-0.85em"}
                textAnchor="middle"
                className={TEXT_VALUE}
                fontWeight={point.latest ? 700 : 400}
                fill={point.latest ? "var(--color-foreground)" : "var(--color-muted-foreground)"}
              >
                {formatDecimal1(point.value)}
              </text>
            </g>
          );
        })}
        {history.years.map((year, i) => (
          <text
            key={year}
            x={chart.xOf(i)}
            y={height - 14}
            textAnchor="middle"
            className={TEXT_TICK}
            fill="var(--color-muted-foreground)"
          >
            {year}
          </text>
        ))}
      </svg>
      <figcaption className="text-muted-foreground text-xs">
        横軸は報告書の提出年です。縦軸は0から始まりません。
      </figcaption>
    </figure>
  );
}
