"use client";

import { CheckIcon } from "lucide-react";
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
 *
 * **枠と地を持つセグメントにする**（U13、アートボード 5a）。選択中にチェックを
 * 添えるのは、2つのうちどちらが効いているかを色だけに頼らないため——`--primary`
 * の塗りはダークでは背景との差が小さく、色覚特性によっては読み取りにくい。
 * **モバイルでは全幅の2分割**にする（5c）。ページの主題を決めるスイッチなので、
 * 他のチップと同じ大きさで並べると押し損ねる。
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
      className="bg-background border-border w-full rounded-lg border p-0.75 sm:w-fit"
    >
      {(
        [
          { value: "raw", label: "実測値" },
          { value: "age", label: "年齢そろえ" },
        ] as const
      ).map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className={`${TAB_TOGGLE_SELECTED_CLASS} h-8 flex-1 px-3 font-semibold sm:flex-none`}
        >
          {current === option.value && <CheckIcon aria-hidden="true" />}
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
