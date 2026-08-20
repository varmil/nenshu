import { NavLink } from "./NavLink";
import { HeaderSearch } from "./HeaderSearch";
import { ThemeToggle } from "@/features/theme/components/ThemeToggle";

/**
 * 全ページ共通のヘッダ（Issue #68、`docs/site-chrome/spec.md` 2）。
 *
 * これを作るまで3ページとも独自のヘッダを持っていて（`/` は max-w-5xl、
 * `/about` と `/company/[id]` は 3xl）、全ページに出すものの置き場所が無かった。
 *
 * 地の色＋下罫線にして塗りつぶさないのは、ライト/ダークどちらでも破綻せず
 * コントラストの危険が無いため（spec.md 2.2）。中身の幅は一番広い `/` に合わせる。
 */
export function SiteHeader() {
  return (
    <header className="border-border border-b">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 p-4">
        {/*
          prefetch={false}。`/` は動的レンダリングで、返るのは1,867社ぶんを含む
          ページ（gzip 64KB）。全ページのヘッダから先読みさせる価値はない。
          理由の詳細は RankingTable.tsx。
        */}
        <NavLink href="/" prefetch={false} className="text-lg font-bold">
          OpenReport
        </NavLink>
        <div className="flex items-center gap-2">
          {/*
            会社名検索は全ページのヘッダに置く（U12）。`/` の上では状態を更新するだけ、
            それ以外のページでは `/?q=` への遷移になる。詳細は HeaderSearch.tsx。
          */}
          <HeaderSearch />
          <NavLink href="/about" className="text-primary text-sm underline">
            計算方法
          </NavLink>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
