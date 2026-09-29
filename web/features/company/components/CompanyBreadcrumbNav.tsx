import { Fragment } from "react";
import type { BreadcrumbItem } from "@/lib/seo/jsonLd";

/**
 * 企業詳細のパンくず（C3）。母集団の会社（`CompanyDetail`）と、母集団から外れた会社
 * （`LapsedCompanyDetail`・D9）の両方が使う。
 */
export function CompanyBreadcrumbNav({ breadcrumb }: { breadcrumb: BreadcrumbItem[] }) {
  return (
    <>
      {/*
        段の並びは `features/company/lib/breadcrumb.ts` が持つ。**構造化データ
        （`BreadcrumbList`）が同じ配列を読む**ので、ここで書き足すと画面と
        JSON-LD が食い違う（S2・AC-14）。

        **常に1行で、収まらないぶんは器の中で横に送る。** 折り返すと社名の長い会社
        （2760 東京エレクトロンデバイス）で 390px のとき2行になり、h1 が 28px 下がって
        いた。社名は直下の h1 が全文を持つので、右端で切れて見えても読めなくなるものは無い。
        - `overflow-y-hidden` は縦の小窓を止める（`design-system/tableContainer.ts` と同じ理由）
        - スクロールバーは隠す。オーバーレイ型でない環境ではバーの高さぶん縦に伸び、
          縮めたい高さを食う
        - `p-1 -m-1` は外寸を変えずに、器の縁で切られるリンクのフォーカス枠の逃げ場を作る
      */}
      <nav className="text-muted-foreground -m-1 flex items-center gap-2 overflow-x-auto overflow-y-hidden p-1 text-sm whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {breadcrumb.map((item, index) =>
          index === breadcrumb.length - 1 ? (
            // パンくずの末尾は現在地なのでリンクにしない（アートボード 4b）。
            <span key={item.path} aria-current="page" className="text-foreground">
              {item.name}
            </span>
          ) : (
            <Fragment key={item.path}>
              <a href={item.path} className="text-primary underline">
                {item.name}
              </a>
              <span aria-hidden="true">/</span>
            </Fragment>
          )
        )}
      </nav>
    </>
  );
}
