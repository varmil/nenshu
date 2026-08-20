"use client";

import type { MouseEvent } from "react";
import { Badge } from "@/design-system/ui/badge";

/**
 * 業種33件へのチップ（アートボード 4a 下部）。
 *
 * **`<a href="/?ind=…">` の実体を持たせる。** クローラにとってはここが業種別の
 * 一覧への唯一の経路になる（ADR-0006 で `/industry/[x]` を作らないと決めたので、
 * `?ind=` のURLに辿り着ける道が要る）。U8 が予定していたリンクハブはこれで足りる。
 *
 * **ただし読者のクリックでは遷移させない。** 素直に辿らせると RSC ペイロードの
 * 再取得が走り、「操作でネットワークが発生しない」（AC-7）を壊す。左クリックだけを
 * 横取りして状態を更新し、修飾キー付き（新しいタブで開く）はブラウザに任せる。
 */
export function IndustryChips({
  industries,
  current,
  onSelect,
}: {
  industries: string[];
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
    <nav aria-label="業種から見る" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">業種から見る</h2>
      <ul className="flex flex-wrap gap-1.5">
        {industries.map((industry) => (
          <li key={industry}>
            <Badge
              variant={industry === current ? "default" : "outline"}
              render={
                <a
                  href={`/?ind=${encodeURIComponent(industry)}`}
                  onClick={handleClick(industry)}
                  aria-current={industry === current ? "true" : undefined}
                />
              }
            >
              {industry}
            </Badge>
          </li>
        ))}
      </ul>
    </nav>
  );
}
