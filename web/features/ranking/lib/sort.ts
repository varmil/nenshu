import type { SortKey, SortOrder, SortSelection } from "../types";

/**
 * 軸ごとの「既定の向き」（spec.md 1.10）。**3軸とも降順＝大きい順で揃えてある。**
 *
 * 軸を選んだときに最初に出る向きであり、URL でも省略される向き。U15 では
 * 平均年齢だけを昇順（若い順）にしていた——U15 より前の3通りがそうだったため——が、
 * **1つの軸だけ向きが違うと、チップを押したときに何が起きるかを軸ごとに覚えることに
 * なる**（運営者の指摘）。矢印もその軸だけ上を向く。既定は「大きい順」で統一し、
 * 若い順は逆向き（`?sort=age-asc`）として出す。
 */
export const SORT_DEFAULT_ORDER: Record<SortKey, SortOrder> = {
  salary: "desc",
  age: "desc",
  employees: "desc",
};

/** チップに出る軸の名前。 */
export const SORT_AXIS_LABEL: Record<SortKey, string> = {
  salary: "平均年収",
  age: "平均年齢",
  employees: "従業員数",
};

/**
 * 向きの言い方は軸ごとに違う。**`昇順 / 降順` とは書かない**——読者が読むのは
 * 「若い順」「多い順」であって、値がどちらに並ぶかではない。
 *
 * 平均年齢の `desc` は「高い順」で、年収の `desc`（高い順）と字面が同じになる。
 * 軸の名前と必ず並べて出すので取り違えようがない（`平均年齢 高い順`）。
 */
export const SORT_DIRECTION_LABEL: Record<SortKey, Record<SortOrder, string>> = {
  salary: { desc: "高い順", asc: "低い順" },
  age: { asc: "若い順", desc: "高い順" },
  employees: { desc: "多い順", asc: "少ない順" },
};

/**
 * チップを押したときに次に来る選択（Issue #106）。
 *
 * **同じ軸なら向きを反転し、別の軸ならその軸の既定の向きから始める。** 向きを引き継が
 * ないのは、軸ごとに「まず見たい端」が違うため——従業員数を押した読者が見たいのは
 * 大きい会社であって、直前に年収を低い順で見ていたかどうかとは関係がない。
 *
 * コンポーネントではなくここに置いてあるのは、この規則が押した回数に依存する唯一の
 * 部分だからである（Unit テストで固定する）。
 */
export function nextSortSelection(current: SortSelection, axis: SortKey): SortSelection {
  if (axis !== current.key) return { key: axis, order: SORT_DEFAULT_ORDER[axis] };
  return { key: axis, order: current.order === "asc" ? "desc" : "asc" };
}
