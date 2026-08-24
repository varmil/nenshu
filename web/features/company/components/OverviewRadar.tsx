import { RADAR_AXES, type RadarAxis } from "../lib/radar";

/*
 * レーダーチャート「公開資料による全体像」（P1・Issue #167・アートボード 6a/6b/6d）。
 *
 * **依存を足さずインライン SVG で描く**（`SalaryCurveChart` と同じ）。描くのは
 * 5角形1枚で、SSR された `<svg>` で足りる（JSが動く前から見える）。
 *
 * **欠測軸は頂点を打たない**（AC-7）。中心まで引き込んで破線でつなぐと、
 * 「掲載なし」と書いてあっても形としては最低評価と同じに見える（#154）。
 */

/*
 * **余白を削って図を大きくする。** 400×330・R=88 では、図の直径が viewBox 幅の
 * 44% しかなく、器（PC の本文カラムの左半分＝約300px）に置くと5角形が
 * 130px ほどに縮んでいた（実測）。ラベルを**すべて中央寄せ**にすると左右の
 * 必要余白が半分で済むので、そのぶん R を上げられる。
 */
const WIDTH = 360;
const HEIGHT = 300;
const CX = WIDTH / 2;
const CY = 150;
const R = 105;
/** ラベルを外周からどれだけ離すか。2行ぶんの高さを見込む。 */
const LABEL_GAP = 20;
/** グリッドの同心5角形。外周を含む。 */
const GRID_STEPS = [0.4, 0.7, 1];

/*
 * 文字は**器の幅で決める**（`SalaryCurveChart` と同じ理由）。viewBox が固定なので
 * SVG ごと拡大縮小し、user unit で書いた文字も同じ倍率で伸びる。PC ではレーダーが
 * 本文カラムの左半分（器 約300px）に、モバイルでは幅いっぱい（器 約358px）に
 * 入るので、倍率の逆数で刻んで実効 11〜13px に収める。
 */
const TEXT_LABEL = "text-[15px] @sm:text-[14px] @md:text-[16px] @lg:text-[15px]";
const TEXT_VALUE = "text-[19px] @sm:text-[18px] @md:text-[20px] @lg:text-[19px]";

/** 12時から時計回り（アートボード 6a）。 */
function angleOf(index: number): number {
  return (-90 + index * (360 / RADAR_AXES.length)) * (Math.PI / 180);
}

function pointAt(index: number, ratio: number): [number, number] {
  const a = angleOf(index);
  return [CX + R * ratio * Math.cos(a), CY + R * ratio * Math.sin(a)];
}

function polygon(ratio: number): string {
  return RADAR_AXES.map((_, i) => pointAt(i, ratio).join(",")).join(" ");
}

/**
 * ラベルの縦位置。**寄せは5軸とも中央**——左右の軸を `start`/`end` にすると、
 * 「残業の少なさ」のような6文字のラベルが左端の外へ出る（viewBox の外は切れる）。
 * 中央寄せなら必要な余白が半分になり、そのぶん図を大きく取れる。
 */
function labelDy(index: number): number {
  const [, y] = pointAt(index, 1);
  if (Math.abs(pointAt(index, 1)[0] - CX) < 1) return y < CY ? -10 : 20;
  return y < CY ? 0 : 10;
}

export function OverviewRadar({ axes }: { axes: RadarAxis[] }) {
  // **頂点を打つ軸だけを結ぶ。** 欠測軸を飛ばして多角形を閉じるので、
  // 掲載なしの軸があっても面積が広がらない（AC-7・アートボード 6d）。
  const drawn = axes
    .map((axis, i) => ({ axis, i }))
    .filter(({ axis }) => axis.position !== null);
  const shape = drawn.map(({ axis, i }) => pointAt(i, axis.position as number).join(",")).join(" ");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="@container h-auto w-full"
      role="img"
      aria-label={axes.map((a) => `${a.label} ${a.valueText}`).join("、")}
    >
      {GRID_STEPS.map((step) => (
        <polygon
          key={step}
          points={polygon(step)}
          className="fill-none stroke-[var(--border)]"
          strokeWidth={1}
        />
      ))}
      {RADAR_AXES.map((_, i) => {
        const [x, y] = pointAt(i, 1);
        return (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            className="stroke-[var(--border)]"
            strokeWidth={1}
          />
        );
      })}

      {/* 3点未満では多角形にならないので、線だけを引く。 */}
      {drawn.length >= 3 && (
        <polygon
          points={shape}
          className="fill-[var(--chart-1)] stroke-[var(--chart-1)]"
          fillOpacity={0.25}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}
      {drawn.length === 2 && (
        <polyline
          points={shape}
          className="fill-none stroke-[var(--chart-1)]"
          strokeWidth={2}
        />
      )}
      {drawn.map(({ axis, i }) => {
        const [x, y] = pointAt(i, axis.position as number);
        return <circle key={axis.key} cx={x} cy={y} r={3.5} className="fill-[var(--chart-1)]" />;
      })}

      {axes.map((axis, i) => {
        const a = angleOf(i);
        const lx = CX + (R + LABEL_GAP) * Math.cos(a);
        const ly = CY + (R + LABEL_GAP) * Math.sin(a);
        const missing = axis.position === null;
        return (
          <text key={axis.key} x={lx} y={ly + labelDy(i)} textAnchor="middle">
            {/*
              **欠測軸もラベルは残し、グレーにする**（AC-7）。軸ごと消すと
              5角形が4角形になり、何が公表されていないのかが図から消える。
            */}
            <tspan className={`${TEXT_LABEL} fill-[var(--muted-foreground)]`}>{axis.label}</tspan>
            <tspan
              x={lx}
              dy="1.35em"
              className={`${TEXT_VALUE} font-bold ${
                missing ? "fill-[var(--muted-foreground)] font-normal" : "fill-[var(--foreground)]"
              }`}
            >
              {axis.valueText}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
