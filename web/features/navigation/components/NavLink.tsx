"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect, type ComponentProps } from "react";
import { navProgress } from "../lib/navProgress";

/**
 * `useLinkStatus()` は `<Link>` の子孫でしか読めないので、何も描画しない子として
 * 差し込み、遷移待ちを共有ストアへ渡す。
 *
 * プリフェッチ済みのリンクでは pending が立たないまま遷移が終わる（公式ドキュメント）。
 * このサイトは `/company/[id]` へのリンクを `prefetch={false}` にしているため
 * （Workerの起動を増やさないため。理由は RankingTable.tsx）、ここが実際に効く。
 */
function PendingReporter() {
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (!pending) return;
    navProgress.begin();
    return () => navProgress.end();
  }, [pending]);

  return null;
}

/**
 * `next/link` に遷移中の表示を足しただけのもの。ページ間の遷移はすべてこれを使う。
 * props は `<Link>` と同じ（`prefetch` もそのまま渡る）。
 */
export function NavLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <PendingReporter />
    </Link>
  );
}
