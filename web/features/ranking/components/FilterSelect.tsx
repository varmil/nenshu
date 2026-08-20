"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/design-system/ui/select";

const ALL = "__all__";

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "すべて",
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span aria-hidden="true" className="text-muted-foreground text-xs">
        {label}
      </span>
      <Select
        value={value ?? ALL}
        onValueChange={(next) => onChange(next === ALL ? null : next)}
      >
        <SelectTrigger aria-label={label}>
          {/*
            **表示する文字列は自分で決める**（Issue #72）。`placeholder` に任せると、
            未選択のときトリガーに `__all__` という内部値がそのまま出る——
            `placeholder` は「値が無いとき」のもので、センチネル値を入れている以上
            値はある、という扱いになるため。
          */}
          <SelectValue>{(current) => (current === ALL ? placeholder : String(current))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
