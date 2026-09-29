import type { ReactNode } from "react";
import { Card, CardContent } from "@/design-system/ui/card";
import { formatManYen } from "@/features/ranking/lib/format";
import { CompanyLogo } from "@/features/logo/components/CompanyLogo";
import { LogoIdsProvider } from "@/features/logo/components/LogoIdsProvider";
import { companyBreadcrumb } from "../lib/breadcrumb";
import { lapsedCardFacts, lapsedCardLead, lapsedNotice } from "../lib/lapsed";
import type { LapsedPageData } from "../lib/pageData";
import { CardFactList } from "./CardFactList";
import { CompanyBreadcrumbNav } from "./CompanyBreadcrumbNav";
import { CompanySummaryText } from "./CompanySummaryText";
import { ProfitHistorySection } from "./ProfitHistorySection";
import { SalaryHistorySection } from "./SalaryHistorySection";
import { TenureHistorySection } from "./TenureHistorySection";
import { WorklifeSection } from "./WorklifeSection";

/**
 * 母集団から外れた会社の企業詳細（refresh の D9・#879・spec 1.16・AC-7）。最後の有報から24か月を
 * 過ぎた会社で、**ランキングにも順位・偏差値・母集団の統計にも入らない**が、ページは残す（ADR-0018）。
 *
 * **島（JS）を持たない。** 母集団の会社の画面（`CompanyDetail`）で操作するのは表示基準と年齢だけで、
 * どちらもこの画面には無い。`[id].astro` がサーバーで描いて静的な HTML として配る。
 *
 * **残す節と外す節**（`docs/refresh/lapsed-pages/design.md`）:
 * - 残す: 最後の有報の実測値（金額・平均年齢・従業員数）、働きやすさ、推移3つ、説明文、給与の決定方針、
 *   Q&A、出典。どれも母集団と関係なく、その会社の有報や自己申告の値だけで決まる
 * - 外す: 順位・偏差値・位置と分布・レーダー・水準が近い会社・ランキングで比べる（母集団に依存する）、
 *   表示基準と年齢別の推定年収（順位の無い推定値だけを残す理由が無い）、分析「現状と今後」と要約
 *   （書いた時点の見立てを、提出が途切れた後に「今後」として読ませない。要約は分析と対）
 */
export function LapsedCompanyDetail({
  data,
  payPolicy,
  qa,
  sources,
}: {
  data: LapsedPageData;
  /** 「{社名}の給与の決定方針」。母集団の会社と同じく静的な HTML として届く。無い会社では `undefined`。 */
  payPolicy?: ReactNode;
  /** 「{社名}の年収に関するQ&A」。最後の有報の実測値の4項目。 */
  qa?: ReactNode;
  /** 「このページの出典」。 */
  sources?: ReactNode;
}) {
  const { company, worklife, history, tenureHistory, profitHistory, summary } = data;
  const notice = lapsedNotice(company);
  return (
    <LogoIdsProvider ids={data.logoIds}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
        <CompanyBreadcrumbNav breadcrumb={companyBreadcrumb(company)} />

        <header className="flex flex-col gap-3">
          <div className="grid grid-cols-[auto_1fr] items-start gap-x-3.5 gap-y-3">
            <CompanyLogo id={company.id} name={company.name} size="lg" />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold sm:text-3xl">{company.name}</h1>
              {/* 業種だけ。業界内順位は出さない（母集団の外）。 */}
              <p className="text-muted-foreground text-sm">{company.tse33}</p>
            </div>
            {summary !== null && <CompanySummaryText summary={summary} />}
          </div>
          {/*
            **社名の直下に置く**（spec 1.16）。ページの数字が最後の有報のものであることと、ランキングに
            いない理由を、金額より先に読ませる。役割は通知なので `role="note"`。**`aside` にしない**
            ——企業詳細の `aside` は「水準が近い会社」のサイドバーで、E2E もそれで引いている。
          */}
          <div
            role="note"
            data-testid="company-lapsed-notice"
            className="border-border bg-muted flex flex-col gap-1 rounded-md border p-4"
          >
            <p className="font-bold">{notice.heading}</p>
            <p className="text-muted-foreground text-sm leading-relaxed">{notice.body}</p>
          </div>
        </header>

        <div className="flex min-w-0 flex-col gap-12">
          <Card>
            <CardContent className="flex flex-col gap-4 p-5">
              <div>
                <span className="text-muted-foreground mb-1 block text-sm">
                  平均年収（有価証券報告書・単体）
                </span>
                <p className="text-4xl font-bold tabular-nums">{formatManYen(company.avgSalary)}</p>
                <p className="text-muted-foreground mt-1 mb-1 text-sm">{lapsedCardLead(company)}</p>
              </div>
              <CardFactList facts={lapsedCardFacts(company)} />
            </CardContent>
          </Card>

          <WorklifeSection view={worklife} />
          {history && <SalaryHistorySection history={history} />}
          {tenureHistory && (
            <TenureHistorySection
              history={tenureHistory}
              name={company.name}
              industry={company.tse33}
            />
          )}
          {profitHistory && <ProfitHistorySection history={profitHistory} />}
          {payPolicy}
          {qa}
          {sources}
        </div>
      </div>
    </LogoIdsProvider>
  );
}
