"use client";

import { useEffect, useSyncExternalStore } from "react";
import { navProgress } from "../lib/navProgress";
import { isPageNavigation } from "../lib/navIntent";

/**
 * 遷移中に画面最上部へ細いバーを出す。**全ページのレイアウトに1つだけ置く。**
 *
 * **遷移の始まりは `document` で1本のリスナーとして拾う**（F1・Issue #209）。
 * `next/link` の `useLinkStatus()` を使っていたが、素の `a` 要素にはそれが無い。
 * リンク側に `onClick` を置く手もあるが、**島の外で描かれたリンク**——`/about` の
 * 本文にある「ランキングへ戻る」など、JS を1バイトも持たない部分——では拾えない。
 * 委譲なら描かれ方に依らない。
 *
 * **終わりは拾わない。** 素の HTML 取得なので、着いた先ではページごと作り直される
 * ——バーは次のページが来た時点で消え、それは「遷移が終わった」と同じ意味になる。
 * `navProgress.end()` は戻る/進むで復元されたときのために残してある。
 *
 * **要るかどうかは F2（#210）が測って決める。** ここでは壊れていない状態にする。
 */
export function NavProgressBar() {
  const phase = useSyncExternalStore(
    navProgress.subscribe,
    navProgress.getPhase,
    () => "idle" as const
  );

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const modified =
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
      if (
        !isPageNavigation({
          href: anchor.getAttribute("href"),
          target: anchor.target,
          hasDownload: anchor.hasAttribute("download"),
          modified,
          defaultPrevented: event.defaultPrevented,
          currentUrl: window.location.href,
        })
      ) {
        return;
      }
      navProgress.begin();
    };

    /*
      **バブリングで聞く。** `BrandLink` は `/` の上で `preventDefault()` して遷移を
      横取りするので、その判断が済んだ後に見たい（`defaultPrevented` を読む）。
    */
    document.addEventListener("click", onClick);
    /*
      **戻る/進むで復元されたときはバーを消す。** bfcache から戻ると DOM ごと
      復元されるので、遷移を始めた時点の「出ている」状態がそのまま見える。
    */
    const onPageShow = () => navProgress.reset();
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

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
