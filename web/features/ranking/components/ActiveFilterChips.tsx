"use client";

import { Badge } from "@/design-system/ui/badge";
import { Button } from "@/design-system/ui/button";
import { XIcon } from "lucide-react";
import { activeFilters, CLEAR_ALL_FILTERS } from "../lib/activeFilters";
import type { RankingState } from "../types";

/**
 * いま効いている絞り込みを並べ、1つずつ／まとめて解除できるようにする。
 *
 * サイドバーは PC でしか出ないが、このチップ列は**本文の上に置く**。モバイルでは
 * 絞り込みがシートの中に隠れるので、何が効いているかが画面から消えてしまう。
 */
export function ActiveFilterChips({
  state,
  onChange,
}: {
  state: RankingState;
  onChange: (patch: Partial<RankingState>) => void;
}) {
  const filters = activeFilters(state);
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs">適用中</span>
      {filters.map((filter) => (
        <Badge key={`${filter.group}:${filter.label}`} variant="secondary" className="gap-0.5 pr-1">
          {filter.label}
          <button
            type="button"
            aria-label={`${filter.group}の絞り込み「${filter.label}」を解除`}
            onClick={() => onChange(filter.patch)}
            className="hover:text-foreground text-muted-foreground rounded-full"
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <Button variant="ghost" size="xs" onClick={() => onChange({ ...CLEAR_ALL_FILTERS })}>
        すべて解除
      </Button>
    </div>
  );
}
