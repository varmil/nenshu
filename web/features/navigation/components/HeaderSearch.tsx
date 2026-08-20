"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Button } from "@/design-system/ui/button";
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
    /*
      **入力欄と虫めがねボタンを1つの丸い帯にする**（U13、アートボード 5a）。
      2つの角丸を突き合わせて境界の罫線を1本にするので、`Input` の右罫線を
      落としてボタン側の罫線に寄せている。

      ボタンは `/` の上では押しても何も起きない（打つそばから絞り込んでいるため
      submit しても同じ結果になる）。それでも置くのは、**検索欄だと分かる形**に
      するためと、`/about`・`/company/[id]` からは実際にこれが送信ボタンになるため。
      モバイルでは横幅が足りないので帯の右半分を落とし、入力欄だけを残す。
    */
    <form action="/" method="get" onSubmit={handleSubmit} role="search" className="flex min-w-0">
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
        className="h-9 min-w-0 flex-1 rounded-full px-4 sm:rounded-r-none sm:border-r-0"
      />
      <Button
        type="submit"
        variant="outline"
        aria-label="検索"
        className="bg-muted hidden h-9 w-14 rounded-l-none rounded-r-full sm:inline-flex"
      >
        <SearchIcon />
      </Button>
    </form>
  );
}
