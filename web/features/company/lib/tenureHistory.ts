import { formatDecimal1 } from "@/features/ranking/lib/format";
import type { TenureHistory } from "../types";
import { niceTicks } from "./stats";

/**
 * 在籍年数の推移（T4・#835、`docs/timeseries/spec.md` 2.7）。表・説明文・折れ線の座標を
 * ここで組み、コンポーネントは描くだけにする。
 *
 * **差も比べも、画面に出ている小数第1位の値どうしで取る**（`shown`）。有報の桁のまま
 * 引くと、表が「19.4年」「15.2年」と出している2行の差が「4.3年」になりうる（19.44 − 15.16）。
 * 読者が引き算した答えと文が食い違う——年齢別の到達年齢（C4）で `toManYen` を通すのと同じ理由。
 */
function shown(value: number): number {
  return Number(formatDecimal1(value));
}

/**
 * 年の差を ＋4.2年 / −0.3年 / ±0.0年 の形にする。符号は推移の他の列と同じ全角。
 * **丸めてから符号を決める**（`formatRate` と同じ）。
 */
export function formatYearsDiff(diff: number): string {
  const rounded = Math.round(diff * 10) / 10;
  const sign = rounded > 0 ? "＋" : rounded < 0 ? "−" : "±";
  return `${sign}${Math.abs(rounded).toFixed(1)}年`;
}

export interface TenureRow {
  year: number;
  /** その年の平均勤続年数（年）。有報が無い・表に勤続の列が無ければ `null`。 */
  value: number | null;
  /** 基準年からの差（年）。基準年の行と欠損の行は `null`。 */
  diff: number | null;
}

export interface TenureTable {
  rows: TenureRow[];
  /** 差の基準にした年（その会社で最初に値のある年）。 */
  baseYear: number | null;
}

/**
 * 表（年度 / 在籍年数 / 基準年との差）。**差は比ではなく年で出す**——在籍年数の % は
 * 意味が取りにくい（モック 1a の注記）。基準年は平均年収の推移（T2）と同じく、
 * **その会社で最初に値のある年**にする。固定の2017年にすると、その年を持たない会社で
 * 列が丸ごと空になる。
 */
export function buildTenureTable(history: TenureHistory): TenureTable {
  const baseIndex = history.values.findIndex((v) => v !== null);
  const base = baseIndex === -1 ? null : history.values[baseIndex];
  const rows = history.years.map((year, i) => {
    const value = history.values[i];
    return {
      year,
      value,
      diff: value === null || base === null || i === baseIndex ? null : shown(value) - shown(base),
    };
  });
  return { rows, baseYear: baseIndex === -1 ? null : history.years[baseIndex] };
}

/**
 * 節の末尾の説明文（モック 1b の文面）。
 *
 * **1文目は社名・値だけで閉じる**（モックの注記。検索結果の抜粋に引かれやすい形）。
 * **年は付けない**（運営者の指示。無くても意味が通じる——値は表の最新年の行と同じで、2文目が
 * 起点の年を言う）。**決算期（`2026年3月期`）も書かない**。企業詳細で決算期を出すのは
 * Q&A の説明（C16）と要約の説明の2か所だけ（`docs/site-chrome/spec.md` 5.1）。
 *
 * 2文目は業種の中央値との差と、最初の年からの動き。どちらかが言えなければその句だけ落とす。
 * 値が1つも無ければ `null`（節ごと出ない会社なので、ここには来ない）。
 */
export function buildTenureSummary(
  history: TenureHistory,
  name: string,
  industry: string
): string | null {
  const present = history.values
    .map((value, i) => ({ year: history.years[i], value, median: history.industryMedian[i] }))
    .filter((p): p is { year: number; value: number; median: number | null } => p.value !== null);
  if (present.length === 0) return null;

  const first = present[0];
  const last = present[present.length - 1];
  const lead = `${name}の平均勤続年数は、単体（提出会社）で${formatDecimal1(last.value)}年です。`;

  // 中央値との差の句。後ろに動きの句が続くときの形（`cont`）と、そこで文を閉じるときの形（`end`）。
  let versus: { cont: string; end: string } | null = null;
  if (last.median !== null) {
    const gap = Math.round((shown(last.value) - shown(last.median)) * 10) / 10;
    const median = `${industry}の中央値（${formatDecimal1(last.median)}年）`;
    const longer = gap > 0 ? "長く" : "短く";
    versus =
      gap === 0
        ? { cont: `${median}と同じで`, end: `${median}と同じです` }
        : {
            cont: `${median}より${Math.abs(gap).toFixed(1)}年${longer}`,
            end: `${median}より${Math.abs(gap).toFixed(1)}年${longer}なっています`,
          };
  }

  // 最初の年からの動き。値が1年だけなら言えない。
  let moved: string | null = null;
  if (present.length >= 2) {
    const diff = Math.round((shown(last.value) - shown(first.value)) * 10) / 10;
    const from = `${first.year}年の${formatDecimal1(first.value)}年から${last.year - first.year}年で`;
    moved =
      diff === 0
        ? `${from}変わっていません`
        : `${from}${Math.abs(diff).toFixed(1)}年${diff > 0 ? "伸びています" : "短くなっています"}`;
  }

  if (versus !== null && moved !== null) return `${lead}${versus.cont}、${moved}。`;
  if (versus !== null) return `${lead}${versus.end}。`;
  if (moved !== null) return `${lead}${moved}。`;
  return lead;
}

/** 折れ線の1点。座標は viewBox の user unit。 */
export interface TenurePoint {
  index: number;
  year: number;
  value: number;
  cx: number;
  cy: number;
  /** 値のラベルを点の下に置くか。既定は上。 */
  labelBelow: boolean;
  /** 最新年（値のある最後の年）の点か。塗りつぶして太字にする。 */
  latest: boolean;
}

export interface TenureChartGeometry {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  /** 目盛（年）と、その y 座標。 */
  ticks: { value: number; y: number }[];
  xOf: (index: number) => number;
  points: TenurePoint[];
  /** 会社の折れ線。**欠損の年で切る**（`M` から始め直す）。内挿しない（AC-20）。 */
  line: string;
  /** 業種の中央値の点線。同じく値の無い年で切る。 */
  medianLine: string;
  /**
   * 中央値のラベル。`x` は値のある最後の年（右端をそろえる）、`y` はラベルが伸びる範囲で点線が
   * いちばん低い（`below`）／高いところ。`value` は最後の年の中央値。
   */
  medianLabel: { x: number; y: number; value: number; below: boolean } | null;
}

export const TENURE_CHART = {
  width: 720,
  height: 300,
  // 左は目盛（「15」「17.5」）の幅。下は年のラベル1行ぶん。上は最も高い点の上に置く値のラベルぶん。
  padding: { top: 38, right: 36, bottom: 44, left: 60 },
} as const;

/**
 * 中央値のラベル（「業種の中央値 16.5」）の幅の見積もり（user unit）。最も大きい字（器が狭いときの
 * 19）で約185。**点線は右肩上がり・下がりのことが多い**ので、右端の1点の上下だけで置くと、
 * 左へ伸びたラベルを点線が横切る（2117 で実際に横切った）。
 */
const MEDIAN_LABEL_WIDTH = 200;

/**
 * 値のラベルと中央値の点線の間に要る距離（user unit）。ラベルは器が狭いと 22 まで大きくなる
 * （`chartText.ts`）ので、それが点の上に収まる高さを取る。
 */
const LABEL_CLEARANCE = 30;

/**
 * 折れ線の座標（モック 1b）。**縦軸は0起点にしない**（`SalaryCurveChart` と同じ）——
 * 在籍年数は10年で数年しか動かず、0から描くと差が潰れる。その代わり各点に値を書き、
 * figcaption で0起点でないことを断る。
 *
 * **範囲は会社と中央値の両方を含める。** 片方だけに合わせると、もう片方が枠の外に出る。
 * 上下の余白は範囲の15%（少なくとも0.5年）——最も低い点の下にラベルを置くことがあり、
 * そこが年のラベルに重ならない高さが要る。
 */
export function buildTenureChart(history: TenureHistory): TenureChartGeometry {
  const { width, height, padding } = TENURE_CHART;
  const present = [...history.values, ...history.industryMedian].filter(
    (v): v is number => v !== null
  );
  const min = Math.min(...present);
  const max = Math.max(...present);
  const pad = Math.max(0.5, (max - min) * 0.15);
  const low = Math.floor(min - pad);
  const high = Math.ceil(max + pad);

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const n = history.years.length;
  const xOf = (i: number) => padding.left + (n === 1 ? innerWidth / 2 : (innerWidth * i) / (n - 1));
  const yOf = (v: number) => padding.top + innerHeight * (1 - (v - low) / (high - low));

  const latestIndex = history.values.reduce<number>((found, v, i) => (v === null ? found : i), -1);
  const points = history.values.flatMap((value, i): TenurePoint[] => {
    if (value === null) return [];
    const cy = yOf(value);
    const median = history.industryMedian[i];
    // 点線が点のすぐ上を通るなら、ラベルを点の下へ逃がす。点線の下を通る場合は、
    // 上に置いたラベルとぶつからない。
    const medianY = median === null ? null : yOf(median);
    const labelBelow = medianY !== null && medianY < cy && cy - medianY < LABEL_CLEARANCE;
    return [
      { index: i, year: history.years[i], value, cx: xOf(i), cy, labelBelow, latest: i === latestIndex },
    ];
  });

  const medianIndex = history.industryMedian.reduce<number>(
    (found, v, i) => (v === null ? found : i),
    -1
  );
  let medianLabel: TenureChartGeometry["medianLabel"] = null;
  if (medianIndex !== -1) {
    const median = history.industryMedian[medianIndex]!;
    const value = history.values[medianIndex];
    // 会社の線が点線より上にある（y が小さい）なら点線の下に、下にあるなら上に書く。
    // 会社の点のラベルは点線の反対側に出るので、2つが重ならない。
    const below = value === null || value >= median;
    // ラベルが左へ伸びる範囲（と、その1つ手前の点。線はそこから引かれてくる）で点線がいちばん
    // 低い／高いところの外側に置く。
    const reach = xOf(medianIndex) - MEDIAN_LABEL_WIDTH - innerWidth / Math.max(1, n - 1);
    const ys = history.industryMedian.flatMap((v, i) =>
      v !== null && i <= medianIndex && xOf(i) >= reach ? [yOf(v)] : []
    );
    const y = below ? Math.max(...ys) : Math.min(...ys);
    medianLabel = { x: xOf(medianIndex), y, value: median, below };
  }

  return {
    width,
    height,
    padding,
    // 刻みは 1・2・5 年。2.5 を許すと 7.5 / 12.5 の目盛になる。
    ticks: niceTicks(low, high, 4, [1, 2, 5]).map((value) => ({ value, y: yOf(value) })),
    xOf,
    points,
    line: pathOf(history.values, xOf, yOf),
    medianLine: pathOf(history.industryMedian, xOf, yOf),
    medianLabel,
  };
}

/** 値の無い年で線を切った SVG の path。1点だけ孤立した年は線にならない（点だけが描かれる）。 */
function pathOf(
  values: readonly (number | null)[],
  xOf: (i: number) => number,
  yOf: (v: number) => number
): string {
  let d = "";
  let drawing = false;
  values.forEach((v, i) => {
    if (v === null) {
      drawing = false;
      return;
    }
    d += `${drawing ? "L" : "M"}${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)} `;
    drawing = true;
  });
  return d.trim();
}
