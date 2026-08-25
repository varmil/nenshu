import type { WorklifeRecord, WorklifeUnit } from "@/lib/data/worklife";

/**
 * 「残業・有給・男女の賃金の差異」の節が描く形（W1・Issue #150）。
 *
 * **3指標を同じ形に揃える。** 値の有無・区分の有無で見た目が変わるのは
 * 行の中身だけにして、**「掲載なし」も同じ器の中に置く**——項目ごと消すと
 * 「残業が少ない会社」と見分けがつかない（spec 2.6・AC-10）。
 */

/** 1行ぶん。区分別も全体値も同じ形にする。 */
export interface WorklifeValueRow {
  /**
   * 行の名前。区分別なら**会社が登録した区分名そのまま**（spec 2.2b）。
   * 全体値なら残業は「公表する範囲」、有給は `全体`、賃金の差異は労働者の別。
   */
  label: string;
  value: number;
  /**
   * バーの塗り（0〜1）。**1メモリ＝10時間・10%で上限100**（アートボード 6c）。
   * バーを描かない指標（男女の賃金の差異）は `null`。
   */
  ratio: number | null;
  /**
   * その指標の**内訳の行**か（アートボード 6b・6c の `うち正規` / `うち非正規`）。
   * `true` の行はラベルを muted に、値を一段小さい通常体にする——**太字が
   * 3つ並ぶと、どれが会社全体の値なのかが読み取れない**（Issue #191）。
   */
  subordinate?: boolean;
}

export interface WorklifeMetricView {
  key: "overtime" | "paidLeave" | "wageGap";
  label: string;
  /**
   * 見出しの右端に1回だけ出す但し書き。無ければ空文字。
   *
   * **単位そのものはここに置かない**（運営者の指示）。3指標とも `valueSuffix` で
   * 値の隣に出すので、ここに単位を書くと同じものが2か所に出る。残業の `月あたり`
   * のように、**単位では表せない情報**（期間）だけが残る。
   */
  unit: string;
  /** 値の直後に付ける単位（`h` / `%`）。3指標とも持つ。 */
  valueSuffix: string;
  /** ラベルの下に置く定義。無ければ空文字。 */
  definition: string;
  rows: WorklifeValueRow[];
  /** 行が1つも無いときに出す文。 */
  emptyNote: string;
}

export interface WorklifeView {
  /**
   * 女性活躍データベースにこの会社の掲載があるか。**`false` でも節は出す**
   * （AC-10）。掲載が任意である旨を書くかどうかがこれで決まる。
   */
  listed: boolean;
  metrics: WorklifeMetricView[];
  /** データ集計時点（`2026年3月時点`）。掲載が無ければ空文字。 */
  asOf: string;
  /** 賃金の差異の対象期間（`2025年4月1日～2026年3月31日`）。無ければ空文字。 */
  wageGapPeriod: string;
  /** 会社が登録した注釈・説明。無ければ空文字。 */
  note: string;
}

/** バーの上限。1メモリ＝10で10メモリぶん（アートボード 6c）。 */
export const WORKLIFE_BAR_MAX = 100;

/**
 * 100超をそのまま出す（AC-7）。**丸めるのは棒の長さだけ**で、値そのものには
 * 触らない——繰越分の消化で有給取得率が100%を超えるのは正しい記録である。
 */
function barRatio(value: number): number {
  return Math.min(Math.max(value, 0) / WORKLIFE_BAR_MAX, 1);
}

/**
 * 区分別の値を行にする。**並べ替えない**（spec 2.2b）——会社が主たる区分を
 * 先に置いていることが多く、その並び自体が読者への情報になる。
 */
function unitRows(units: readonly WorklifeUnit[]): WorklifeValueRow[] {
  const out: WorklifeValueRow[] = [];
  for (const { unit, value } of units) {
    if (value === null) continue;
    out.push({ label: unit === "" ? "全体" : unit, value, ratio: barRatio(value) });
  }
  return out;
}

/**
 * 全体値と区分別を1つの並びにする。**両方ある会社は両方出す**（spec 2.2）。
 * 全体値を先に置くのは、それが会社の代表値として登録されているため。
 */
function withAll(
  all: number | null,
  allLabel: string,
  units: readonly WorklifeUnit[]
): WorklifeValueRow[] {
  const rows = unitRows(units);
  if (all === null) return rows;
  return [{ label: allLabel, value: all, ratio: barRatio(all) }, ...rows];
}

/** 男女の賃金の差異の3つ。**バーは描かない**（アートボード 6b・6c）。 */
function wageGapRows(record: WorklifeRecord): WorklifeValueRow[] {
  const out: WorklifeValueRow[] = [];
  const push = (label: string, value: number | null, subordinate = false) => {
    if (value !== null) out.push({ label, value, ratio: null, subordinate });
  };
  // **全労働者だけが会社全体の値。** `うち正規` / `うち非正規` はその内訳なので
  // 一段弱める（アートボード 6b・6c）。
  push("全労働者", record.wageGapAll);
  push("うち正規", record.wageGapRegular, true);
  push("うち非正規", record.wageGapNonRegular, true);
  return out;
}

/**
 * 1社ぶんの節を組む。**掲載が無い会社（`record === null`）でも同じ3指標を返す**
 * ——器を空のまま出すのが AC-10 の求める形で、呼び出し側に分岐を作らせない。
 */
export function buildWorklifeView(record: WorklifeRecord | null): WorklifeView {
  const metrics: WorklifeMetricView[] = [
    {
      key: "overtime",
      label: "平均残業時間",
      // 単位は値の隣（`28.5h`）。**見出しには期間だけを残す**——`h` が単位を
      // 持つので `時間 / 月` だと「時間」が2か所に出る（運営者の指示）。
      unit: "月あたり",
      valueSuffix: "h",
      definition: "",
      rows: record
        ? withAll(
            record.overtimeAll,
            record.overtimeScope === "" ? "全体" : record.overtimeScope,
            record.overtimeUnits
          )
        : [],
      emptyNote: "この会社は残業時間をデータベースに登録していません。",
    },
    {
      key: "paidLeave",
      label: "年次有給休暇の取得率",
      // **見出しの `%` は落とす。** 値の隣に出すので、同じ単位が2か所に出る。
      unit: "",
      valueSuffix: "%",
      definition: "",
      rows: record ? withAll(record.paidLeaveAll, "全体", record.paidLeaveUnits) : [],
      emptyNote: "この会社は有給休暇の取得率をデータベースに登録していません。",
    },
    {
      key: "wageGap",
      label: "男女の賃金の差異",
      unit: "",
      valueSuffix: "%",
      // **数字だけを単独で置かない**（spec 2.4）。55.7 が何の割合かは
      // ラベルの隣に無いと図の中で解けない（親 Issue #154 が賃金差をレーダーから
      // 降ろした理由のひとつがこれ）。
      definition: "女性の平均賃金 ÷ 男性の平均賃金 × 100",
      rows: record ? wageGapRows(record) : [],
      emptyNote: "この会社は男女の賃金の差異をデータベースに登録していません。",
    },
  ];

  return {
    listed: record !== null,
    metrics,
    asOf: record?.asOf ?? "",
    wageGapPeriod: record?.wageGapPeriod ?? "",
    note: record?.note ?? "",
  };
}
