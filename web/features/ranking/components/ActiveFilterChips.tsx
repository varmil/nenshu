"use client";

import { Badge } from "@/design-system/ui/badge";
import { Button } from "@/design-system/ui/button";
import { XIcon } from "lucide-react";
import { activeFilters, CLEAR_ALL_FILTERS } from "../lib/activeFilters";
import type { RankingState } from "../types";

/**
 * いま効いている絞り込みを並べ、1つずつ／まとめて解除できるようにする。
 *
 * **PC ではサイドバーの先頭に置く**（U13、アートボード 5a）。効いている条件と、
 * それを外す操作が、絞り込みそのものと同じ列に並ぶ。モバイルではサイドバーが
 * シートに隠れるため、この列だけが本文の上に残る（`RankingApp` 参照）。
 *
 * 見出しと「すべて解除」を1行に向かい合わせるのは、チップの数が増えても解除の
 * 位置が動かないようにするため。
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold">適用中</span>
        <Button
          variant="link"
          size="xs"
          className="h-auto p-0 text-xs"
          onClick={() => onChange({ ...CLEAR_ALL_FILTERS })}
        >
          すべて解除
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {filters.map((filter) => (
          <Badge key={`${filter.group}:${filter.label}`} variant="outline" className="bg-muted h-6 gap-1 pr-1.5">
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
      </div>
    </div>
  );
}
