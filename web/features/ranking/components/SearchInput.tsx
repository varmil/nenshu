"use client";

import { Input } from "@/design-system/ui/input";

export function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span aria-hidden="true" className="text-muted-foreground text-xs">
        会社名で検索
      </span>
      <Input
        type="search"
        aria-label="会社名で検索"
        placeholder="例: 商船三井"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-40"
      />
    </div>
  );
}
