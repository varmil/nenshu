"use client";

import { useSyncExternalStore } from "react";
import { navProgress } from "../lib/navProgress";

/**
 * 遷移中に画面最上部へ細いバーを出す。`app/layout.tsx` に1つだけ置く。
 *
 * `nextjs-toploader` などのライブラリは `history.pushState` を差し替えて遷移を
 * 検知するが、ここでは Next.js 公式の `useLinkStatus()`（`NavLink`）から受け取る。
 * この構成が要るのは、`<Link prefetch={false}>` かつ遷移先が動的レンダリングで、
 * クリックしてからRSCペイロードが届くまでの待ちが実際に見えるため
 * （`docs/company/company-page/design.md`）。
 */
export function NavProgressBar() {
  const phase = useSyncExternalStore(
    navProgress.subscribe,
    navProgress.getPhase,
    () => "idle" as const
  );

  if (phase === "idle") return null;

  return (
    <>
      <div
        aria-hidden="true"
        data-testid="nav-progress"
        className={phase === "finishing" ? "nav-progress is-finishing" : "nav-progress"}
      />
      <span role="status" className="sr-only">
        読み込み中
      </span>
    </>
  );
}
