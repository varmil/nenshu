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
 *
 * **3カラム（ブランド / 検索 / 表示モード＋計算方法）で、検索が中央の余りを取る**
 * （U13、アートボード 5a）。U12 では右端に3つを寄せていたため、検索欄が幅 8rem の
 * 小さな入力欄になり、モバイルでは2段に折り返していた。`grid` にすると中央の列だけが
 * 伸び縮みするので、両脇の幅が変わっても検索欄の位置が動かない。
 */
export function SiteHeader() {
  return (
    <header className="border-border border-b">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4 sm:gap-6 lg:gap-15">
        {/*
          prefetch={false}。`/` は動的レンダリングで、返るのは1,867社ぶんを含む
          ページ（gzip 64KB）。全ページのヘッダから先読みさせる価値はない。
          理由の詳細は RankingTable.tsx。
        */}
        <NavLink href="/" prefetch={false} className="text-base font-bold sm:text-lg">
          OpenReport
        </NavLink>
        {/*
          会社名検索は全ページのヘッダに置く（U12）。`/` の上では状態を更新するだけ、
          それ以外のページでは `/?q=` への遷移になる。詳細は HeaderSearch.tsx。
        */}
        <HeaderSearch />
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <NavLink href="/about" className="text-primary text-sm whitespace-nowrap underline">
            計算方法
          </NavLink>
        </div>
      </div>
    </header>
  );
}
