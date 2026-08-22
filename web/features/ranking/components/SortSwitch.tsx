"use client";

import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/design-system/ui/toggle-group";
import {
  SORT_AXIS_LABEL,
  SORT_DEFAULT_ORDER,
  SORT_DIRECTION_LABEL,
  nextSortSelection,
} from "../lib/sort";
import { SORT_KEYS } from "../types";
import type { SortKey, SortSelection } from "../types";
import { TAB_TOGGLE_SELECTED_CLASS } from "./tabToggleClass";

/**
 * 並び替え（spec.md 1.10）。**順位の列はこれで変わらない。**
 *
 * **見出しは短く、方向は選択中にだけ添える**（U13、アートボード 5a / 5c）。
 * 「年収が高い順」「平均年齢が若い順」「従業員数が多い順」を3つ並べると、
 * 390px では1行に収まらず横スクロールが出ていた（U12 の実装）。読者が知りたいのは
 * 「いま何順か」なので、効いていない選択肢は軸の名前だけでよい。
 *
 * **選択中の軸をもう一度押すと向きが反転する**（U15・Issue #106）。3つのチップで
 * 6通りを操作するので、押すたびに何が起きるかは選択中かどうかで変わる——
 * 別の軸なら「その軸の既定の向きへ移る」、同じ軸なら「向きだけ入れ替える」。
 * 規則そのものは `lib/sort.ts` の `nextSortSelection` にある。
 *
 * **読み上げには方向まで載せる。** `aria-label` を `${軸} ${方向}` にしてあり、
 * 見えている文字（軸だけ、または軸＋方向）は必ずその部分文字列になる
 * （WCAG 2.5.3 Label in Name）。**未選択のチップの `aria-label` は「押したら何順に
 * なるか」ではなく、その軸の既定の向き**——押した結果はその向きなので同じ文字列に
 * なるが、意味づけは「この軸はこう並ぶ」に置いている。
 *
 * 表示基準スイッチと同じで、選択中を押しても「未選択」にはならない。
 * 並びは必ずどれか1つである。
 */
export function SortSwitch({
  value,
  onChange,
}: {
  value: SortSelection;
  onChange: (next: SortSelection) => void;
}) {
  return (
    <ToggleGroup
      aria-label="並び替え"
      value={[value.key]}
      onValueChange={(values) => {
        /*
         * 単一選択の ToggleGroup は、選択中の項目を押すと空配列を寄こす
         * （`@base-ui/react` の `setGroupValue`）。**この空こそが「同じ軸をもう一度
         * 押した」の合図**なので、捨てずに向きの反転に使う。項目ごとの `onClick` で
         * 拾うと、同じクリックで2回状態が動く。
         */
        const axis = (values[0] as SortKey | undefined) ?? value.key;
        onChange(nextSortSelection(value, axis));
      }}
      className="min-w-0 flex-wrap"
    >
      {SORT_KEYS.map((key) => {
        const selected = key === value.key;
        const order = selected ? value.order : SORT_DEFAULT_ORDER[key];
        const direction = SORT_DIRECTION_LABEL[key][order];
        // 矢印は値の向き（下＝大きい順・上＝小さい順）。「若い順」は昇順なので上を向く。
        const Chevron = order === "asc" ? ChevronUpIcon : ChevronDownIcon;
        return (
          <ToggleGroupItem
            key={key}
            value={key}
            aria-label={`${SORT_AXIS_LABEL[key]} ${direction}`}
            className={`${TAB_TOGGLE_SELECTED_CLASS} border-border h-7.5 rounded-full border px-2.5 text-xs whitespace-nowrap data-[state=on]:border-transparent aria-pressed:border-transparent`}
          >
            {SORT_AXIS_LABEL[key]}
            {selected && (
              <>
                {/*
                  **方向の語はPCだけ**（U13）。390px では3つのチップと「絞り込み」が
                  1行に収まらず、横スクロールが出る。モバイルでは選択中を表す塗りと
                  この矢印が向きの手がかりになり（U15 で矢印が向きを表すようになった）、
                  読み上げには `aria-label` が方向まで載せている。
                */}
                <span className="hidden sm:inline"> {direction}</span>
                <Chevron aria-hidden="true" />
              </>
            )}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
