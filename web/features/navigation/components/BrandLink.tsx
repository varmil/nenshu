"use client";

import type { MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { NavLink } from "./NavLink";
import { pushRankingReset } from "@/features/ranking/lib/queryBroadcast";

/**
 * 共通ヘッダのサイト名。`/` への導線であり、**絞り込みを解いて最初の状態に戻す**入口。
 *
 * `/` の上では遷移させず、URL を `/` に書き換えて合図を投げる。`<Link href="/">` に
 * 任せると、同じルートへの遷移なので `RankingApp` が作り直されず、**URL だけが `/`
 * になって表と絞り込みは変わらない**という食い違いが起きていた（報告あり）。
 *
 * `/` 以外のページでは素の `<Link>` として振る舞う。修飾キー付き（新しいタブで開く）
 * はブラウザに任せる——`IndustryChips` と同じ扱い。
 *
 * **色は `--primary`**（S4・Issue #163・`docs/site-chrome/spec.md` 6.3）。
 * 地の文と同じ色だと、ブランドと隣のナビゲーションの区別が付かない。
 * **画像にはしない**——文字のままのほうが選択・検索・拡大のどれでも勝り、
 * この要素が担っている「絞り込みを解く」振る舞いも変わらない。
 */
export function BrandLink() {
  const pathname = usePathname();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== "/") return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    pushRankingReset();
  };

  return (
    /*
      prefetch={false}。`/` は動的レンダリングで、返るのは1,867社ぶんを含む
      ページ（gzip 72KB）。全ページのヘッダから先読みさせる価値はない。
      理由の詳細は RankingTable.tsx。
    */
    <NavLink href="/" prefetch={false} onClick={handleClick} className="text-primary text-base font-bold sm:text-lg">
      OpenReport
    </NavLink>
  );
}
