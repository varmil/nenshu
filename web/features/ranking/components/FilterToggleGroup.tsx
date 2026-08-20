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
  /*
   * 3択が横に並ぶと 216px のサイドバーに収まらない。**プリミティブの既定は
   * `w-fit flex-row` で折り返さないため、はみ出したボタンが本文の表に重なり、
   * クリックが表側に吸われる**（U12 の E2E が実際に検出した）。
   *
   * U12 では折り返させていたが、モックは**縦積みの全幅ボタン**である
   * （U13、アートボード 5a）。折り返しだと「2個＋1個」の座りの悪い並びになり、
   * 選択肢の長さで段の切れ目が動く。縦なら幅に関係なく1列に決まる。
   */

  return (
    <div className="flex flex-col gap-1">
      <span aria-hidden="true" className="text-muted-foreground text-xs">
        {label}
      </span>
      <ToggleGroup
        aria-label={label}
        value={value ? [value] : []}
        onValueChange={(values) => onChange(values[0] ?? null)}
        className="w-full flex-col items-stretch"
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={option.label}
            className={`${TAB_TOGGLE_SELECTED_CLASS} border-border h-7.5 justify-start border px-2.5 data-[state=on]:border-transparent aria-pressed:border-transparent`}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
