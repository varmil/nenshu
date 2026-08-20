import { formatManYen } from "@/features/ranking/lib/format";
import type { TargetAge } from "@/features/ranking/types";
import type { CompanyAgeStats } from "../types";

const WIDTH = 720;
const HEIGHT = 270;
// 左右の余白は端の点のラベル幅ぶん要る。中央揃えのラベルが viewBox の外に
// はみ出すと、そこだけ切れて表示される（「2,213」で右に14ユニット出ていた）。
const PADDING = { top: 34, right: 40, bottom: 40, left: 40 };
// viewBox は固定なので、狭い画面ではSVG全体が縮む。375px幅では約0.48倍になり、
// 13px で書くと実効7px弱で読めない。22 にすると実効10〜11pxになる。
const FONT_SIZE = 22;

/**
 * 25〜60歳の推定年収の折れ線。
 *
 * 依存を足さずインラインSVGで描く。rechartsはクライアントJSを大きく増やすが、
 * 描くのは8点の折れ線1本で、SSRされた `<svg>` で足りる（JSが動く前から見える）。
 *
 * **縦軸は0起点にしない。** 8点の最小〜最大に余白を足した範囲にする。0起点だと
 * 差が潰れて読めない。目盛りの取り方で誤読させないよう、各点の金額を数値でも
 * 併記する。数値は「万円」を付けず万単位の整数だけにする——8点ぶんの
 * 「2,178万円」は狭い画面で隣と重なるため。単位は figcaption に書く。
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
  const min = Math.min(...values);
  const max = Math.max(...values);
  // 全点が同額でも高さ0で割らないようにする。
  const span = max - min || Math.max(max, 1);
  const low = min - span * 0.15;
  const high = max + span * 0.15;

  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = (i: number) => PADDING.left + (innerWidth * i) / (byAge.length - 1);
  const y = (v: number) => PADDING.top + innerHeight * (1 - (v - low) / (high - low));

  const line = byAge.map((s, i) => `${x(i)},${y(s.salary)}`).join(" ");

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`年齢別の推定年収。${byAge
          .map((s) => `${s.targetAge}歳 ${formatManYen(s.salary)}`)
          .join("、")}`}
      >
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
              <text
                x={x(i)}
                y={y(s.salary) - 14}
                textAnchor="middle"
                fontSize={FONT_SIZE}
                fontWeight={isSelected ? 700 : 400}
                fill={isSelected ? "var(--color-primary)" : "var(--color-muted-foreground)"}
              >
                {Math.round(s.salary / 10000).toLocaleString("ja-JP")}
              </text>
              <text
                x={x(i)}
                y={HEIGHT - 10}
                textAnchor="middle"
                fontSize={FONT_SIZE}
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
        横軸は年齢（歳）、数値は推定年収（万円）です。縦軸は0からではなく、8点が収まる範囲で描いています。
        このカーブは1社の中の年齢ごとの水準であって、同じ人が歳を取っていく軌跡ではありません。
      </figcaption>
    </figure>
  );
}
