import { ChevronRight } from "lucide-react";
import type { RankingLink } from "../lib/rankingLinks";

/**
 * 「ランキングで比べる」（C20・spec 1.24、Claude Design `企業詳細 ランキング導線.dc.html` の 1b）。
 *
 * **本文＋サイドバーの下、フッタの直前に全幅で置く。** 以前は出典で本文が終わり、ランキングへは
 * ヘッダのロゴか上のパンくずまで戻るしかなかった。モバイルでは「水準が近い会社」の直後になる。
 *
 * **1つの枠に2行、PC は2列**（768px 以上）。行全体を1つのリンクにして押せる高さを 44px 取る。
 * 順位は数値なので `text-primary` にせず muted で添える。
 */
export function RankingLinks({ links }: { links: RankingLink[] }) {
  return (
    <nav aria-label="ランキング" className="flex flex-col gap-2">
      <h2 className="text-sm font-bold">ランキングで比べる</h2>
      <div className="border-border grid rounded-lg border md:grid-cols-2">
        {links.map((link, index) => (
          <a
            key={link.path}
            href={link.path}
            className={`text-foreground flex min-h-11 items-center justify-between gap-3 px-4 py-2.5 md:py-3 ${
              index > 0 ? "border-border border-t md:border-t-0 md:border-l" : ""
            }`}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-primary text-sm font-semibold">{link.label}</span>
              <span className="text-muted-foreground text-xs tabular-nums">{link.note}</span>
            </span>
            <ChevronRight aria-hidden="true" className="text-muted-foreground size-4 flex-none" />
          </a>
        ))}
      </div>
    </nav>
  );
}
