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
 * **寸法はアートボード 6a / 6b と同じにする**（Issue #191・2巡目）。
 *
 * `@container` を `<svg>` 自身に置いていたのが、図が小さかった原因だった。
 * `container-type: inline-size` は**その要素の縦横比を無かったことにする**ので、
 * `height: auto` が置換要素の既定（150px）に落ち、`preserveAspectRatio` が
 * 図全体を半分に縮めていた（実測: PC で 314×150・倍率 0.5）。**器のクエリは
 * 包む `<div>` に置く**——`SalaryCurveChart` が `<figure>` に置いているのと同じ形。
 *
 * 併せて viewBox をモックの値そのものにした。器の幅を 340px（PC の左列）と
 * 揃えてあるので、**モックと同じ倍率・同じ実効文字サイズで出る。**
 */
const WIDTH = 300;
const HEIGHT = 232;
const CX = 150;
const CY = 136;
const R = 70;
/** ラベルを外周からどれだけ離すか。 */
const LABEL_GAP = 20;
/** グリッドの同心5角形。外周を含む（アートボード 6a は 1/3・2/3・1）。 */
const GRID_STEPS = [1 / 3, 2 / 3, 1];

/*
 * **文字は user unit のまま置く。器のクエリで刻まない**（2巡目）。
 * 器の幅は PC が 340px 固定、モバイルが `max-w-[370px]` で頭打ちなので、
 * 倍率は 1.13〜1.23 に収まる。11 / 12 は実効 12.5〜14.8px になり、
 * これはモックがその幅で出している大きさそのものになる。
 */
const TEXT_LABEL = "text-[11px]";
const TEXT_VALUE = "text-[12px]";

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
 * ラベルの縦位置の微調整。**寄せは5軸とも中央**——左右の軸を `start`/`end` に
 * すると、「残業の少なさ」のような6文字のラベルが左端の外へ出る（viewBox の外は
 * 切れる）。中央寄せなら必要な余白が半分になり、そのぶん図を大きく取れる。
 *
 * 真上の軸だけ余計に上げる。値の行が外周の頂点に近づきすぎるため。
 */
function labelDy(index: number): number {
  return Math.abs(pointAt(index, 1)[0] - CX) < 1 ? -6 : -2;
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
      className="mx-auto block h-auto w-full max-w-[370px]"
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
      {axes.map((axis, i) => {
        const [x, y] = pointAt(i, 1);
        // **掲載なしの軸は軸線を破線にする**（アートボード 6a/6b/6d）。頂点が
        // 無いことは図から読み取りにくいので、線の側にも印を残す。
        const missing = axis.position === null;
        return (
          <line
            key={axis.key}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            className={
              missing ? "stroke-[var(--muted-foreground)]" : "stroke-[var(--border)]"
            }
            strokeWidth={1}
            strokeDasharray={missing ? "3 3" : undefined}
            opacity={missing ? 0.6 : undefined}
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
        return <circle key={axis.key} cx={x} cy={y} r={3} className="fill-[var(--chart-1)]" />;
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
