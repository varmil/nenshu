"use client";

import { ToggleGroup, ToggleGroupItem } from "@/design-system/ui/toggle-group";
import type { SortKey } from "../types";
import { TAB_TOGGLE_SELECTED_CLASS } from "./tabToggleClass";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "salary", label: "年収が高い順" },
  { value: "age", label: "平均年齢が若い順" },
  { value: "employees", label: "従業員数が多い順" },
];

/**
 * 並び替え（spec.md 1.10）。**順位の列はこれで変わらない。**
 *
 * 表示基準スイッチと同じで、選択中をもう一度押して「未選択」にはできない。
 * 並びは必ずどれか1つである。
 */
export function SortSwitch({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (sort: SortKey) => void;
}) {
  return (
    // モバイルでは3つ並ぶと横幅を超えるので、この列だけ横に送れるようにする
    // （ページ全体に横スクロールを出さない。U3 で踏んだ）。
    <div className="-mx-1 overflow-x-auto px-1">
      <ToggleGroup
        aria-label="並び替え"
        value={[value]}
        onValueChange={(values) => {
          const next = values[0] as SortKey | undefined;
          if (next) onChange(next);
        }}
        className="w-max"
      >
        {SORT_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className={`${TAB_TOGGLE_SELECTED_CLASS} whitespace-nowrap`}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
