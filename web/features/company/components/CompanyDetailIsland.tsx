"use client";

import { CompanyDetail } from "./CompanyDetail";
import { LogoIdsProvider } from "@/features/logo/components/LogoIdsProvider";
import type { CompanyPageData } from "../lib/pageData";

/**
 * 企業詳細ページの島（F1・Issue #209）。
 *
 * **島を1つに収める。** `LogoIdsProvider` と `CompanyDetail` を別々の
 * `client:load` にすると、Astro は**島ごとに props を直列化する**——調査の
 * プローブでランキングを2つの島にしたとき `/` の HTML が 733,979 B まで膨らんだ
 * （1つにまとめて 481,312 B。`docs/framework/intent.md`）。
 */
export function CompanyDetailIsland({ data }: { data: CompanyPageData }) {
  return (
    <LogoIdsProvider ids={data.logoIds}>
      <CompanyDetail
        view={data.view}
        radar={data.radar}
        worklife={data.worklife}
        history={data.history}
        profitHistory={data.profitHistory}
        summary={data.summary}
        fiscalPeriod={data.fiscalPeriod}
      />
    </LogoIdsProvider>
  );
}
