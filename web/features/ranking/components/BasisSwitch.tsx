"use client";

import { ToggleGroup, ToggleGroupItem } from "@/design-system/ui/toggle-group";
import type { TargetAge } from "../types";
import { TAB_TOGGLE_SELECTED_CLASS } from "./tabToggleClass";

/**
 * 表示基準の切替。「実測値」＝有報の平均年間給与そのまま（既定）と、
 * 「年齢そろえ」＝業種の賃金カーブで目標年齢に補正した推定年収（ADR-0007）。
 *
 * `value` は `RankingState.targetAge` そのもの。`null` が実測値で、数値なら
 * 年齢そろえ。モードと年齢を1つの値で持つ理由は `features/ranking/types.ts`。
 *
 * 「年齢そろえ」を押したときにどの年齢にするかは呼び出し側が決める
 * （ランキングは直前の年齢を覚えていないので `DEFAULT_TARGET_AGE`）。
 */
export function BasisSwitch({
  value,
  onChange,
  label,
}: {
  value: TargetAge | null;
  onChange: (basis: "raw" | "age") => void;
  /** 「並べ方」（ランキング）か「見せ方」（企業詳細）。文脈で語が変わる。 */
  label: string;
}) {
  const current = value === null ? "raw" : "age";

  return (
    <ToggleGroup
      aria-label={label}
      value={[current]}
      onValueChange={(values) => {
        const next = values[0];
        // 選択中をもう一度押すと空配列が来る。表示基準は必ずどちらかなので無視する。
        if (next === "raw" || next === "age") onChange(next);
      }}
    >
      <ToggleGroupItem value="raw" className={TAB_TOGGLE_SELECTED_CLASS}>
        実測値
      </ToggleGroupItem>
      <ToggleGroupItem value="age" className={TAB_TOGGLE_SELECTED_CLASS}>
        年齢そろえ
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
