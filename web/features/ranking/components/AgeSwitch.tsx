"use client";

import { ToggleGroup, ToggleGroupItem } from "@/design-system/ui/toggle-group";
import { TARGET_AGES, type TargetAge } from "../types";
import { TAB_TOGGLE_SELECTED_CLASS } from "./tabToggleClass";

export function AgeSwitch({
  value,
  onChange,
}: {
  value: TargetAge;
  onChange: (age: TargetAge) => void;
}) {
  return (
    <ToggleGroup
      aria-label="目標年齢"
      value={[String(value)]}
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
          className={TAB_TOGGLE_SELECTED_CLASS}
        >
          {age}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
