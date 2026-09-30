import type { ReactNode } from "react";
import { Card, CardContent } from "@/design-system/ui/card";
import { formatManYen } from "@/features/ranking/lib/format";
import { CompanyLogo } from "@/features/logo/components/CompanyLogo";
import { LogoIdsProvider } from "@/features/logo/components/LogoIdsProvider";
import { companyBreadcrumb } from "../lib/breadcrumb";
import { unrankedCardFacts, unrankedCardLead, unrankedNotice } from "../lib/unranked";
import type { UnrankedPageData } from "../lib/pageData";
import { CardFactList } from "./CardFactList";
import { CompanyBreadcrumbNav } from "./CompanyBreadcrumbNav";
import { CompanySummaryText } from "./CompanySummaryText";
import { NeighborCompanies } from "./NeighborCompanies";
import { ProfitHistorySection } from "./ProfitHistorySection";
import { SalaryHistorySection } from "./SalaryHistorySection";
import { TenureHistorySection } from "./TenureHistorySection";
import { WorklifeSection } from "./WorklifeSection";

/**
 * ランキングの外の会社の企業詳細（refresh の D9・#879・D11・#903・spec 1.16・AC-7）。最後の有報から
 * 24か月を過ぎた会社と、単体従業員の線を割った会社で、**ランキングにも順位・偏差値・母集団の統計にも
 * 入らない**が、ページは残す（ADR-0018 とその 2026-09-30 の追記）。どちらの理由かは年収カードの直下の
 * 断りとカードの1文だけが出し分け、節の並びは同じ。
 *
 * **器は通常の企業詳細（`CompanyDetail`）と同じ2カラム**（PC は本文＋右サイドバー、モバイルは1カラム）。
 * D9 の初版はサイドバーを持たない1カラムで、PC で本文だけが左に寄っていた（運営者の指摘）。
 *
 * **島（JS）を持たない。** 母集団の会社の画面で操作するのは表示基準と年齢だけで、どちらもこの画面には
 * 無い。`[id].astro` がサーバーで描いて静的な HTML として配る。
 *
 * **残す節と外す節**（`docs/refresh/lapsed-pages/design.md`・`docs/refresh/below-line/design.md`）:
 * - 残す: 有報の実測値（金額・平均年齢・従業員数）、働きやすさ、推移3つ、説明文、給与の決定方針、
 *   Q&A、出典。どれも母集団と関係なく、その会社の有報や自己申告の値だけで決まる
 * - サイドバー: 「水準が近い会社」の代わりに、**同じ業種の実測値の上位10社**（`topOfIndustry`）。
 *   この会社は母集団にいないので「近い」を測れない。便宜的に業種の1位から並べる（運営者の指示）
 * - 外す: 順位・偏差値・位置と分布・レーダー・ランキングで比べる（母集団に依存する）、
 *   表示基準と年齢別の推定年収（順位の無い推定値だけを残す理由が無い）、分析「現状と今後」と要約
 *   （提出が途切れた会社では書いた時点の見立てを「今後」として読ませない。線を割った会社では分析を
 *   書き直さない（D11）。要約は分析と対）
 */
export function UnrankedCompanyDetail({
  data,
  payPolicy,
  qa,
  sources,
}: {
  data: UnrankedPageData;
  /** 「{社名}の給与の決定方針」。母集団の会社と同じく静的な HTML として届く。無い会社では `undefined`。 */
  payPolicy?: ReactNode;
  /** 「{社名}の年収に関するQ&A」。数字の有報の実測値の4項目。 */
  qa?: ReactNode;
  /** 「このページの出典」。 */
  sources?: ReactNode;
}) {
  const { company, worklife, history, tenureHistory, profitHistory, summary } = data;
  const notice = unrankedNotice(company, data.minEmployees);
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
        </header>

        {/* PC は本文＋右サイドバー、モバイルは1カラム（通常の企業詳細と同じ器）。 */}
        <div className="flex flex-col gap-4 md:grid md:grid-cols-[1fr_19.75rem] md:items-start md:gap-6">
          <div className="flex min-w-0 flex-col gap-12">
            {/*
              **断りは年収カードの直下**（運営者の指示・2026-09-30。D9 の初版は社名の直下）。カードと
              1つの塊にして間を詰める——金額を読んだ直後に、ランキングにいない理由と、その金額が
              どの有報の・誰の平均かが続く。役割は通知なので `role="note"`。**`aside` にしない**
              ——`aside` はサイドバーで、E2E もそれで引いている。
            */}
            <div className="flex flex-col gap-4">
              <Card>
                <CardContent className="flex flex-col gap-4 p-5">
                  <div>
                    <span className="text-muted-foreground mb-1 block text-sm">
                      平均年収（有価証券報告書・単体）
                    </span>
                    <p className="text-4xl font-bold tabular-nums">
                      {formatManYen(company.avgSalary)}
                    </p>
                    <p className="text-muted-foreground mt-1 mb-1 text-sm">
                      {unrankedCardLead(company)}
                    </p>
                  </div>
                  <CardFactList facts={unrankedCardFacts(company)} />
                </CardContent>
              </Card>
              <div
                role="note"
                data-testid="company-unranked-notice"
                data-reason={company.reason}
                className="border-border bg-muted flex flex-col gap-1 rounded-md border p-4"
              >
                <p className="font-bold">{notice.heading}</p>
                <p className="text-muted-foreground text-sm leading-relaxed">{notice.body}</p>
              </div>
            </div>

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

          <aside className="flex flex-col gap-4 md:sticky md:top-4">
            <NeighborCompanies
              neighbors={data.industryTop}
              industry={company.tse33}
              industryCount={data.industryCount}
              title={`${company.tse33}で平均年収が高い会社`}
            />
          </aside>
        </div>
      </div>
    </LogoIdsProvider>
  );
}
