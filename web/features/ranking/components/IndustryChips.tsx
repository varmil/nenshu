"use client";

import type { MouseEvent } from "react";
import { Badge } from "@/design-system/ui/badge";
import { formatInt } from "../lib/format";

/**
 * 業種33件へのチップ（アートボード 5a 下部）。
 *
 * **`<a href="/?ind=…">` の実体を持たせる。** クローラにとってはここが業種別の
 * 一覧への唯一の経路になる（ADR-0006 で `/industry/[x]` を作らないと決めたので、
 * `?ind=` のURLに辿り着ける道が要る）。U8 が予定していたリンクハブはこれで足りる。
 *
 * **ただし読者のクリックでは遷移させない。** 素直に辿らせると RSC ペイロードの
 * 再取得が走り、「操作でネットワークが発生しない」（AC-7）を壊す。左クリックだけを
 * 横取りして状態を更新し、修飾キー付き（新しいタブで開く）はブラウザに任せる。
 *
 * **社数を併記する**（U13）。33件が同じ大きさで並ぶと、7社の海運業と212社の
 * 情報・通信業が同じ重みに見える。押す前に母数が分かるほうが選びやすい。
 */
export function IndustryChips({
  industries,
  counts,
  current,
  onSelect,
}: {
  industries: string[];
  /** `industries` と同じ並びの社数。 */
  counts: number[];
  current: string | null;
  onSelect: (industry: string | null) => void;
}) {
  const handleClick = (industry: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    // 修飾キー・中クリックは「新しいタブで開く」なので触らない。
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    onSelect(industry === current ? null : industry);
  };

  return (
    <nav
      aria-label="業種から見る"
      className="bg-muted flex flex-col gap-2 rounded-lg p-4"
    >
      <h2 className="text-sm font-bold">業種から見る</h2>
      <ul className="flex flex-wrap gap-1.5">
        {industries.map((industry, index) => (
          <li key={industry}>
            <Badge
              variant={industry === current ? "default" : "outline"}
              className={`h-7.5 gap-1.5 rounded-full px-2.5 ${
                industry === current ? "" : "bg-background text-primary"
              }`}
              render={
                <a
                  href={`/?ind=${encodeURIComponent(industry)}`}
                  onClick={handleClick(industry)}
                  aria-current={industry === current ? "true" : undefined}
                />
              }
            >
              {industry}
              {/*
                社数は読み上げに載せる（「電気機器 150社」）。`aria-hidden` に
                しないのは、これが装飾ではなく選ぶための情報だから。
              */}
              <span
                className={
                  industry === current
                    ? "text-primary-foreground/80 text-[0.7rem]"
                    : "text-muted-foreground text-[0.7rem]"
                }
              >
                {formatInt(counts[index] ?? 0)}社
              </span>
            </Badge>
          </li>
        ))}
      </ul>
    </nav>
  );
}
