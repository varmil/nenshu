"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { Input } from "@/design-system/ui/input";
import { pushRankingQuery } from "@/features/ranking/lib/queryBroadcast";

/**
 * 共通ヘッダの会社名検索（アートボード 4a）。ランキングページの中にあった検索欄を
 * ここへ引き上げた。
 *
 * **`/` の上では遷移しない。** URL を `pushState` で書き換えて合図を投げ、
 * `useRankingState` に読み直させる（`features/ranking/lib/queryBroadcast.ts`）。
 * ネットワークを発生させないための仕組みで、AC-7 を守る。
 *
 * **`/` 以外では素の `<form action="/">` として振る舞う。** `/about` や
 * `/company/[id]` から検索したら `/?q=…` へページ遷移するのが正しく、これは
 * 離散的な操作なのでネットワークを許容してよい（CLAUDE.md）。JS が動かない
 * 環境でも同じ経路で動く。
 *
 * `usePathname` は現在のパスを読むだけで、RSC ペイロードの再取得を起こさない
 * （禁じているのは `useRouter` と `useSearchParams`）。
 */
export function HeaderSearch() {
  const pathname = usePathname();
  const isRanking = pathname === "/";
  const [value, setValue] = useState("");

  // 直接 `/?q=…` を開いた場合や、戻る/進むで `q` が変わった場合に欄を合わせる。
  useEffect(() => {
    if (!isRanking) return;
    const sync = () => setValue(new URLSearchParams(window.location.search).get("q") ?? "");
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [isRanking]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!isRanking) return; // 素の GET 送信に任せる
    event.preventDefault();
    pushRankingQuery(value);
  };

  return (
    <form action="/" method="get" onSubmit={handleSubmit} role="search">
      {/*
        `value` は常に渡して制御コンポーネントに統一する。`/` かどうかで
        `value` と `defaultValue` を出し分けると、React が「非制御から制御へ
        変わった」と警告する（実際に出した）。
      */}
      <Input
        type="search"
        name="q"
        aria-label="会社名で検索"
        placeholder="会社名で検索"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          // ランキングの上では打つそばから絞り込む（従来の検索欄と同じ挙動）。
          if (isRanking) pushRankingQuery(e.target.value);
        }}
        className="h-8 w-32 sm:w-48"
      />
    </form>
  );
}
