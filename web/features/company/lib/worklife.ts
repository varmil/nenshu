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
}

export interface WorklifeMetricView {
  key: "overtime" | "paidLeave" | "wageGap";
  label: string;
  /**
   * 見出しの右端に1回だけ出す単位。**行ごとに繰り返さない**（アートボード 6c）。
   * 定義文を持つ指標（男女の賃金の差異）はそちらが場所を取るので空にし、
   * 代わりに `valueSuffix` で値の隣に付ける。
   */
  unit: string;
  /** 値の直後に付ける単位。`unit` を持つ指標では空。 */
  valueSuffix: string;
  /** ラベルの下に置く定義。無ければ空文字。 */
  definition: string;
  rows: WorklifeValueRow[];
  /**
   * 行が1つも無いときに出す文。**iPhone 12 Pro（横幅390px・本文幅358px）で
   * 1行に収める**（Issue #192）。12px の字で29文字までしか入らないので、
   * 指標名は**隣の `label` が持っているぶんを繰り返さない**——
   * `有給休暇の取得率` は `取得率`、`男女の賃金の差異` は `差異` と書く。
   */
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
  const push = (label: string, value: number | null) => {
    if (value !== null) out.push({ label, value, ratio: null });
  };
  push("全労働者", record.wageGapAll);
  push("うち正規", record.wageGapRegular);
  push("うち非正規", record.wageGapNonRegular);
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
      unit: "時間 / 月",
      valueSuffix: "",
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
      unit: "%",
      valueSuffix: "",
      definition: "",
      rows: record ? withAll(record.paidLeaveAll, "全体", record.paidLeaveUnits) : [],
      emptyNote: "この会社は取得率をデータベースに登録していません。",
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
      emptyNote: "この会社は差異をデータベースに登録していません。",
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
