"use client";

import type { ReactNode } from "react";
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
export function CompanyDetailIsland({
  data,
  analysis,
  digest,
  sources,
}: {
  data: CompanyPageData;
  /**
   * 有報の要約と AI 分析（C10・Issue #242）。**Astro の名前付きスロット**
   * （`slot="analysis"`・`slot="digest"`）で `[id].astro` から届く。中身はサーバーで
   * 描いた静的な HTML で、**props に直列化されない**——`data` に入れると同じ文章が
   * props と本文の2か所に入る（`lib/analysis.ts`）。無い会社では `undefined`。
   */
  analysis?: ReactNode;
  digest?: ReactNode;
  /**
   * 「このページの出典」（C12・Issue #805）。**同じく名前付きスロット**（`slot="sources"`）。
   * 表示基準で変わらない静的な節なので、島の JS に文言を持たせない。
   */
  sources?: ReactNode;
}) {
  return (
    <LogoIdsProvider ids={data.logoIds}>
      <CompanyDetail
        view={data.view}
        radar={data.radar}
        worklife={data.worklife}
        history={data.history}
        tenureHistory={data.tenureHistory}
        profitHistory={data.profitHistory}
        summary={data.summary}
        fiscalPeriod={data.fiscalPeriod}
        filingDocId={data.filingDocId}
        analysis={analysis}
        digest={digest}
        sources={sources}
      />
    </LogoIdsProvider>
  );
}
