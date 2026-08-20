import { formatManYen } from "@/features/ranking/lib/format";
import type { TargetAge } from "@/features/ranking/types";
import type { CompanyAgeStats } from "../types";
import { ESTIMATE_RANGE_RATIO, estimateRange, niceTicks } from "../lib/stats";

const WIDTH = 720;
// 縦を厚くする（公開後の指摘）。C3 までは 720×270 で、PC では高さ 244px しか
// 取れず、8点の折れ線が横に潰れていた。340 にすると PC で約 308px になる。
const HEIGHT = 340;
// 左右の余白は端の点のラベル幅ぶん要る。中央揃えのラベルが viewBox の外に
// はみ出すと、そこだけ切れて表示される（「2,213」で右に14ユニット出ていた）ので、
// **両端の金額だけは内側に寄せて揃える**（左端は start、右端は end）。
// 左は縦軸の目盛ラベルぶんを広げてある（C2 で目盛を足した）。
// 下の余白は「年齢の目盛」と「（歳）」の2行ぶん要る（C3）。1行に詰めると
// 右端の「60」と「（歳）」が重なる（実測）。
const PADDING = { top: 34, right: 40, bottom: 52, left: 84 };

/*
 * 文字の大きさは**画面の幅ではなく器の幅で決める**（コンテナクエリ）。
 *
 * viewBox が固定なのでSVG全体が器の幅に合わせて拡大縮小し、user unit で書いた
 * 文字も同じ倍率で伸び縮みする。C3 までは一律 22 で、**PC では実効 20px** になり
 * 本文（14px）より大きい数字が並んでいた（公開後の指摘）。かといって PC に
 * 合わせて 13 と書くと、375px 幅では実効 6px になって読めない。倍率の逆数で
 * 刻んで、どの幅でも実効 10〜13px に収める。
 *
 * **`md:` のような画面幅の変種は使えない。** 同じ 768px でも、サイドバーが出る
 * 直前（器 735px）と出た直後（器 396px）で幅が倍近く違う。見ているものが器の幅で
 * ある以上、条件も器の幅で書く。
 *
 * 金額のラベルだけは点の間隔（85ユニット）に収まる必要がある。「2,213万」は
 * 約3.75em ぶんの幅なので、22 を超えると隣と重なる。
 */
const TEXT_TICK = "text-[22px] @md:text-[18px] @lg:text-[16px] @xl:text-[14px] @2xl:text-[12px]";
const TEXT_VALUE = "text-[22px] @md:text-[19px] @lg:text-[17px] @xl:text-[15.5px] @2xl:text-[13.5px]";
const TEXT_UNIT = "text-[19px] @md:text-[16px] @lg:text-[14px] @xl:text-[12.5px] @2xl:text-[11px]";

/**
 * 25〜60歳の推定年収の折れ線。
 *
 * 依存を足さずインラインSVGで描く。rechartsはクライアントJSを大きく増やすが、
 * 描くのは8点の折れ線1本で、SSRされた `<svg>` で足りる（JSが動く前から見える）。
 *
 * **縦軸は0起点にしない。** 8点の最小〜最大に余白を足した範囲にする。0起点だと
 * 差が潰れて読めない。目盛りの取り方で誤読させないよう、各点の金額を数値でも
 * 併記し、縦軸に目盛を置く（C2・spec 1.14）。数値は「万円」を付けず万単位の
 * 整数だけにする——8点ぶんの「2,178万円」は狭い画面で隣と重なるため。単位は
 * figcaption に書く。
 *
 * **±20% の帯を重ねる。** 目安の幅であって統計的な信頼区間ではない（spec 1.14）。
 * 帯の意味は figcaption に必ず書く——帯だけを見ると信頼区間に見えるため。
 *
 * `role="img"` と `aria-label` に加えて、`sr-only` の一覧を置く。画像ではなく
 * 数値として読み上げられるようにする（`docs/company/spec.md` 2. アクセシビリティ）。
 */
export function SalaryCurveChart({
  byAge,
  selectedAge,
}: {
  byAge: CompanyAgeStats[];
  selectedAge: TargetAge | null;
}) {
  const values = byAge.map((s) => s.salary);
  // 帯の外側まで入る範囲にする。折れ線だけに合わせると帯が枠から出る。
  const min = Math.min(...values) * (1 - ESTIMATE_RANGE_RATIO);
  const max = Math.max(...values) * (1 + ESTIMATE_RANGE_RATIO);
  // 全点が同額でも高さ0で割らないようにする。
  const span = max - min || Math.max(max, 1);
  const low = min - span * 0.08;
  const high = max + span * 0.08;

  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = (i: number) => PADDING.left + (innerWidth * i) / (byAge.length - 1);
  const y = (v: number) => PADDING.top + innerHeight * (1 - (v - low) / (high - low));

  const line = byAge.map((s, i) => `${x(i)},${y(s.salary)}`).join(" ");
  // 上端を左→右、下端を右→左でなぞって閉じる（±20%の帯）。
  const band = [
    ...byAge.map((s, i) => `${x(i)},${y(estimateRange(s.salary).high)}`),
    ...[...byAge].reverse().map((s, i) => `${x(byAge.length - 1 - i)},${y(estimateRange(s.salary).low)}`),
  ].join(" ");

  /*
   * 目盛は**丸い数字**に寄せる（C3）。C2 は描画範囲を等分していたので
   * `422 / 1,430 / 2,439 / 3,448` という端数が縦軸に並び、物差しとして働いて
   * いなかった。0起点にしない方針は変えていない（`niceTicks` は範囲の内側だけを返す）。
   */
  const ticks = niceTicks(low, high);

  return (
    <figure className="@container flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`年齢別の推定年収。${byAge
          .map((s) => `${s.targetAge}歳 ${formatManYen(s.salary)}`)
          .join("、")}`}
      >
        {/*
          単位は左端から書き出す。右揃えにすると、器が狭くて文字が大きいときに
          「（万円）」の4文字が viewBox の左に出て切れる。
        */}
        <text x={2} y={PADDING.top - 14} className={TEXT_UNIT} fill="var(--color-muted-foreground)">
          （万円）
        </text>
        <text
          x={WIDTH - 4}
          y={HEIGHT - 6}
          textAnchor="end"
          className={TEXT_UNIT}
          fill="var(--color-muted-foreground)"
        >
          （歳）
        </text>
        {ticks.map((value) => (
          <g key={value}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y(value)}
              y2={y(value)}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            {/* 文字の大きさが器で変わるので、線への中心合わせは baseline に任せる。 */}
            <text
              x={PADDING.left - 10}
              y={y(value)}
              textAnchor="end"
              dominantBaseline="central"
              className={TEXT_TICK}
              fill="var(--color-muted-foreground)"
            >
              {Math.round(value / 10000).toLocaleString("ja-JP")}
            </text>
          </g>
        ))}
        <polygon points={band} fill="var(--color-primary)" fillOpacity={0.12} />
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {byAge.map((s, i) => {
          const isSelected = s.targetAge === selectedAge;
          const isFirst = i === 0;
          const isLast = i === byAge.length - 1;
          return (
            <g key={s.targetAge}>
              <circle
                cx={x(i)}
                cy={y(s.salary)}
                r={isSelected ? 6 : 3.5}
                fill={isSelected ? "var(--color-primary)" : "var(--color-background)"}
                stroke="var(--color-primary)"
                strokeWidth={2}
              />
              {/* 点からの距離は `dy` の em で取る。ユニット固定だと、文字が小さい幅で離れすぎる。 */}
              <text
                x={isFirst ? x(i) + 6 : x(i)}
                y={y(s.salary)}
                dy="-0.85em"
                textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
                className={TEXT_VALUE}
                fontWeight={isSelected ? 700 : 400}
                fill={isSelected ? "var(--color-primary)" : "var(--color-muted-foreground)"}
              >
                {Math.round(s.salary / 10000).toLocaleString("ja-JP")}
              </text>
              <text
                x={x(i)}
                y={HEIGHT - 28}
                textAnchor="middle"
                className={TEXT_TICK}
                fontWeight={isSelected ? 700 : 400}
                fill={isSelected ? "var(--color-primary)" : "var(--color-muted-foreground)"}
              >
                {s.targetAge}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="sr-only">
        {byAge.map((s) => (
          <li key={s.targetAge}>
            {s.targetAge}歳 {formatManYen(s.salary)}
          </li>
        ))}
      </ul>
      <figcaption className="text-muted-foreground text-xs">
        薄い帯は推定値の ±{Math.round(ESTIMATE_RANGE_RATIO * 100)}%
        の範囲で、目安の幅であって統計的な信頼区間ではありません。縦軸は0起点ではありません。
        1社の中の年齢ごとの水準であって、同じ人が歳を取っていく軌跡ではありません。
      </figcaption>
    </figure>
  );
}
