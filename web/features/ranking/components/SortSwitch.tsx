"use client";

import { ChevronDownIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/design-system/ui/toggle-group";
import type { SortKey } from "../types";
import { TAB_TOGGLE_SELECTED_CLASS } from "./tabToggleClass";

/**
 * 並び替え（spec.md 1.10）。**順位の列はこれで変わらない。**
 *
 * **見出しは短く、方向は選択中にだけ添える**（U13、アートボード 5a / 5c）。
 * 「年収が高い順」「平均年齢が若い順」「従業員数が多い順」を3つ並べると、
 * 390px では1行に収まらず横スクロールが出ていた（U12 の実装）。読者が知りたいのは
 * 「いま何順か」なので、効いていない選択肢は軸の名前だけでよい。
 *
 * **読み上げには方向まで載せる。** `aria-label` を `${軸} ${方向}` にしてあり、
 * 見えている文字（軸だけ、または軸＋方向）は必ずその部分文字列になる
 * （WCAG 2.5.3 Label in Name）。
 *
 * 表示基準スイッチと同じで、選択中をもう一度押して「未選択」にはできない。
 * 並びは必ずどれか1つである。
 */
export const SORT_OPTIONS: { value: SortKey; axis: string; direction: string }[] = [
  { value: "salary", axis: "平均年収", direction: "高い順" },
  { value: "age", axis: "平均年齢", direction: "若い順" },
  { value: "employees", axis: "従業員数", direction: "多い順" },
];

export function SortSwitch({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (sort: SortKey) => void;
}) {
  return (
    <ToggleGroup
      aria-label="並び替え"
      value={[value]}
      onValueChange={(values) => {
        const next = values[0] as SortKey | undefined;
        if (next) onChange(next);
      }}
      className="min-w-0 flex-wrap"
    >
      {SORT_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={`${option.axis} ${option.direction}`}
            className={`${TAB_TOGGLE_SELECTED_CLASS} border-border h-7.5 rounded-full border px-2.5 text-xs whitespace-nowrap data-[state=on]:border-transparent aria-pressed:border-transparent`}
          >
            {option.axis}
            {selected && (
              <>
                {/*
                  **方向の語はPCだけ**（U13）。390px では3つのチップと「絞り込み」が
                  1行に収まらず、横スクロールが出る。モバイルでは選択中を表す塗りと
                  この矢印が向きの手がかりになり、読み上げには `aria-label` が
                  方向まで載せている。
                */}
                <span className="hidden sm:inline"> {option.direction}</span>
                <ChevronDownIcon aria-hidden="true" />
              </>
            )}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
