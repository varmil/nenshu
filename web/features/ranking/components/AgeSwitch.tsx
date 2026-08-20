"use client";

import { ToggleGroup, ToggleGroupItem } from "@/design-system/ui/toggle-group";
import { TARGET_AGES, type TargetAge } from "../types";
import { TAB_TOGGLE_SELECTED_CLASS } from "./tabToggleClass";

/**
 * 目標年齢の切替。
 *
 * **実測値モードでは `disabled` にするが、消さずに描画したままにする**（ADR-0007、
 * デザイン 5a）。消してしまうと「年齢そろえ」に切り替えたとき何が増えるのかが
 * 事前に分からず、切替そのものの意味が読めなくなる。
 *
 * `value` が `null`（実測値）のときはどの年齢も選択されていない状態にする。
 */
export function AgeSwitch({
  value,
  onChange,
  disabled = false,
}: {
  value: TargetAge | null;
  onChange: (age: TargetAge) => void;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      aria-label="目標年齢"
      value={value === null ? [] : [String(value)]}
      className={disabled ? "opacity-50" : undefined}
      onValueChange={(values) => {
        const next = values[0];
        if (next) onChange(Number(next) as TargetAge);
      }}
    >
      {TARGET_AGES.map((age) => (
        <ToggleGroupItem
          key={age}
          value={String(age)}
          aria-label={`${age}歳`}
          disabled={disabled}
          className={TAB_TOGGLE_SELECTED_CLASS}
        >
          {age}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
