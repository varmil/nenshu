"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/design-system/ui/sheet";
import { Button } from "@/design-system/ui/button";
import { SlidersHorizontalIcon } from "lucide-react";
import { activeFilters } from "../lib/activeFilters";
import { RankingFilters, type FilterPanelProps } from "./RankingFilters";

/**
 * モバイルの絞り込み（アートボード 2a）。PC ではサイドバーに同じ中身が常設される
 * ので、`md` 以上では出さない。
 *
 * 開閉の状態はこのコンポーネントの中だけで持つ。**URL に載せない**——シートが
 * 開いているかどうかは絞り込みの結果に影響せず、共有された URL で勝手にパネルが
 * 開くほうが不自然である。
 */
export function RankingFilterSheet({ state, onChange, industries }: FilterPanelProps) {
  const [open, setOpen] = useState(false);
  const count = activeFilters(state).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          /*
            並び替えチップと同じ丸い形にして1行に並べる（アートボード 5c）。
            件数は括弧付きだと 390px で行から溢れるので数字だけにした。
          */
          <Button
            variant="outline"
            size="sm"
            aria-label={count > 0 ? `絞り込み（${count}件適用中）` : "絞り込み"}
            className="h-7.5 shrink-0 rounded-full px-2.5 text-xs md:hidden"
          >
            <SlidersHorizontalIcon />
            絞り込み
            {count > 0 && <span className="text-primary font-bold">{count}</span>}
          </Button>
        }
      />
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>絞り込み</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          <RankingFilters state={state} onChange={onChange} industries={industries} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
