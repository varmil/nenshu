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
          <Button variant="outline" size="sm" className="md:hidden">
            <SlidersHorizontalIcon />
            絞り込み
            {count > 0 && <span className="text-muted-foreground">（{count}）</span>}
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
