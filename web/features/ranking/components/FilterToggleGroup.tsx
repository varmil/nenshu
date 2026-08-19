"use client";

import { ToggleGroup, ToggleGroupItem } from "@/design-system/ui/toggle-group";
import { TAB_TOGGLE_SELECTED_CLASS } from "./tabToggleClass";

export function FilterToggleGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span aria-hidden="true" className="text-muted-foreground text-xs">
        {label}
      </span>
      <ToggleGroup
        aria-label={label}
        value={value ? [value] : []}
        onValueChange={(values) => onChange(values[0] ?? null)}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={option.label}
            className={TAB_TOGGLE_SELECTED_CLASS}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
