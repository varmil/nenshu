"use client";

import { NavLink } from "@/features/navigation/components/NavLink";
import { useEffect, useState } from "react";
import { Badge } from "@/design-system/ui/badge";
import { Card, CardContent, CardHeader } from "@/design-system/ui/card";
import { AgeSwitch } from "@/features/ranking/components/AgeSwitch";
import { BasisSwitch } from "@/features/ranking/components/BasisSwitch";
import { DEFAULT_TARGET_AGE } from "@/features/ranking/lib/urlState";
import { formatDecimal1, formatInt, formatManYen } from "@/features/ranking/lib/format";
import { TARGET_AGES, type TargetAge } from "@/features/ranking/types";
import type { CompanyView, SalaryHistory } from "../types";
import {
  formatDeviation,
  formatDiffFromMean,
  formatTopPercent,
  statsForBasis,
} from "../lib/stats";
import { SalaryCurveChart } from "./SalaryCurveChart";
import { SalaryDistributionChart } from "./SalaryDistributionChart";
import { SalaryHistoryChart } from "./SalaryHistoryChart";
import { AgeSalaryTable } from "./AgeSalaryTable";
import { NeighborCompanies } from "./NeighborCompanies";
import { HowItWorks } from "./HowItWorks";
import { CompanyLogoMark } from "@/features/ranking/components/CompanyLogoMark";
import { buildHighlights, buildHistorySummary } from "../lib/highlights";

function parseAge(raw: string | null): TargetAge | null {
  const n = Number(raw);
  return (TARGET_AGES as readonly number[]).includes(n) ? (n as TargetAge) : null;
}

/**
 * 表示基準と `?age=` の同期。`null` は実測値で、既定（ADR-0007）。
 *
 * `useRouter()` は使わない（RSCペイロード再フェッチによるネットワーク発生・競合状態。
 * U5 で踏んだ。`docs/ranking/url-sync/design.md`）。`window.history.pushState` を直接呼ぶ。
 *
 * `useRankingState` を共用しない。あちらは7つの値とページ番号を持ち、その大半は
 * 企業ページに存在しない概念になる。ここは値が1つなのでデバウンスも
 * `pushState`/`replaceState` の出し分けも要らない。
 */
function useTargetAge(initialAge: TargetAge | null) {
  const [targetAge, setTargetAge] = useState<TargetAge | null>(initialAge);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      setTargetAge(parseAge(params.get("age")));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    // 実測値（既定）は `age` を出さない。年齢そろえなら35歳でも出す——
    // `age` の有無そのものが表示基準を表しているため（ADR-0007）。
    const next = targetAge === null ? "" : `?age=${targetAge}`;
    if (next === window.location.search) return;
    window.history.pushState(null, "", `${window.location.pathname}${next}`);
  }, [targetAge]);

  return { targetAge, setTargetAge };
}

export function CompanyDetail({
  view,
  history,
  initialAge,
}: {
  view: CompanyView;
  /** 10年推移。取れていない会社は `null`。 */
  history: SalaryHistory | null;
  initialAge: TargetAge | null;
}) {
  const { targetAge, setTargetAge } = useTargetAge(initialAge);
  const current = statsForBasis(view, targetAge);
  const isRaw = targetAge === null;
  // 年齢別チャートは実測値モードでも出す。実測値には年齢の概念が無いので、
  // 8年齢ぶんだけを渡して選択中の点は無しにする。
  const byAge = view.byBasis.filter((s) => s.targetAge !== null);
  const highlights = buildHighlights(view, current);
  const historySummary = history ? buildHistorySummary(history.years, history.values) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <nav className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
        {/*
          prefetch={false}。`/` は動的レンダリングで、返るのは1,867社ぶんを含む
          ページ（gzip 72KB）。読むとは限らない導線を先読みさせる価値はない。
          理由の詳細は RankingTable.tsx。
        */}
        <NavLink href="/" prefetch={false} className="text-primary underline">
          ランキング
        </NavLink>
        <span aria-hidden="true">/</span>
        <NavLink
          href={`/?ind=${encodeURIComponent(view.tse33)}`}
          prefetch={false}
          className="text-primary underline"
        >
          {view.tse33}
        </NavLink>
        <span aria-hidden="true">/</span>
        {/* パンくずの末尾は現在地なのでリンクにしない（アートボード 4b）。 */}
        <span aria-current="page" className="text-foreground min-w-0 truncate">
          {view.name}
        </span>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CompanyLogoMark name={view.name} />
          <h1 className="text-2xl font-bold">{view.name}</h1>
          {view.hasBadge && <Badge variant="outline">本社のみ</Badge>}
        </div>
        {/* 順位を h1 の直下に置く（アートボード 4b）。カードの中まで読まなくても位置が分かる。 */}
        <p className="text-muted-foreground text-sm">
          {`${view.tse33}で${formatInt(current.rankIndustry)}位 / ${formatInt(view.industryCount)}社・` +
            `全体で${formatInt(current.rankAll)}位 / ${formatInt(view.totalCount)}社` +
            `（${formatTopPercent(current.topPercent)}）`}
        </p>
        <div className="flex flex-col gap-2">
          <BasisSwitch
            value={targetAge}
            onChange={(basis) => setTargetAge(basis === "raw" ? null : DEFAULT_TARGET_AGE)}
            label="見せ方"
          />
          <div className="overflow-x-auto">
            {/* 実測値のときも消さずに無効化する（ADR-0007）。理由は AgeSwitch.tsx。 */}
            <AgeSwitch value={targetAge} onChange={setTargetAge} disabled={isRaw} />
          </div>
        </div>
      </header>

      {/* PC は本文＋右サイドバー、モバイルは1カラム（アートボード 4b / 2b）。 */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[1fr_16rem] md:items-start md:gap-6">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              {/* 実測値では「推定」バッジも「推定」の語も出さない（spec AC-9）。 */}
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-sm">
                  {isRaw ? "平均年収（有価証券報告書・単体）" : `${targetAge}歳時点の推定年収`}
                </span>
                {!isRaw && <Badge variant="secondary">推定</Badge>}
              </div>
              <p className="text-4xl font-bold">{formatManYen(current.salary)}</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground text-xs">全体順位</dt>
                  <dd className="text-lg font-medium">
                    {formatInt(current.rankAll)}位
                    <span className="text-muted-foreground text-sm">
                      {" "}
                      / {formatInt(view.totalCount)}社（{formatTopPercent(current.topPercent)}）
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">業界内順位（{view.tse33}）</dt>
                  <dd className="text-lg font-medium">
                    {formatInt(current.rankIndustry)}位
                    <span className="text-muted-foreground text-sm">
                      {" "}
                      / {formatInt(view.industryCount)}社
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">年収偏差値</dt>
                  <dd className="text-lg font-medium">
                    {formatDeviation(current.deviation)}
                    <span className="text-muted-foreground text-sm">
                      {" "}
                      （{formatTopPercent(current.topPercent)}）
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">全体平均との差</dt>
                  <dd className="text-lg font-medium">
                    {formatDiffFromMean(current.diffFromMean)}
                    <span className="text-muted-foreground text-sm">
                      {" "}
                      （全体平均 {formatManYen(current.populationMean)}）
                    </span>
                  </dd>
                </div>
              </dl>

              {/* 分布の中での位置（spec 1.13）。平均との差だけでは裾か中央かが分からない。 */}
              <SalaryDistributionChart
                current={current}
                count={view.totalCount}
                companyName={view.name}
              />

              <p className="text-muted-foreground text-xs">
                年収の分布は右に裾を引くため、偏差値は100を超えることがあります。水準を読むときは
                「上位◯%」のほうが確かです。
              </p>
            </CardContent>
          </Card>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">年齢別の推定年収</h2>
            <SalaryCurveChart byAge={byAge} selectedAge={targetAge} />
            <AgeSalaryTable byAge={byAge} selectedAge={targetAge} />
          </section>

          {history && (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-bold">平均年収推移（過去10年間）</h2>
              <p className="text-muted-foreground text-sm">
                {/* 表示基準の切替と独立（timeseries spec 2.2・AC-8）。 */}
                各年の有価証券報告書に載った<strong>実測値</strong>です。
                「年齢そろえ」を選んでもここの数字は変わりません。
                {historySummary && <> {historySummary}</>}
              </p>
              <SalaryHistoryChart history={history} />
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">有価証券報告書の実測値</h2>
            <p className="text-muted-foreground text-xs">
              {isRaw
                ? "補正していない実際の数字です。提出会社（単体）のもので、連結子会社の従業員は入りません。"
                : "ここから下は補正していない実際の数字です。提出会社（単体）のもので、連結子会社の従業員は入りません。"}
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground text-xs">平均年収</dt>
                <dd className="font-medium">{formatManYen(view.avgSalary)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">平均年齢</dt>
                <dd className="font-medium">{formatDecimal1(view.avgAge)}歳</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">在籍年数</dt>
                <dd className="font-medium">{formatDecimal1(view.avgTenure)}年</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">従業員数（単体）</dt>
                <dd className="font-medium">{formatInt(view.employees)}人</dd>
              </div>
            </dl>
          </section>

          <HowItWorks />
        </div>

        <aside className="flex flex-col gap-6 md:sticky md:top-4">
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">この会社の要点</h2>
            {/* 数値から導ける事実だけ。会社ごとの解説文は書かない（spec 1.11）。 */}
            <ul className="text-muted-foreground flex list-disc flex-col gap-1.5 pl-4 text-sm">
              {highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <NeighborCompanies neighbors={current.neighbors} industry={view.tse33} />
        </aside>
      </div>

      <footer className="text-muted-foreground flex flex-col gap-1 text-xs">
        <p>
          出典: 金融庁 EDINET の有価証券報告書（2026年6〜7月提出。推移は2017〜2026年の各年）、厚生労働省「賃金構造基本統計調査」。
        </p>
        <p>
          {isRaw
            ? "実測値モードでは補正を行っていません。年齢別の推定年収だけが推定値です。"
            : "推定年収は年齢補正後の推定値です。実際の年収を保証するものではありません。"}
          <NavLink href="/about" className="text-primary ml-1 underline">
            計算方法と限界
          </NavLink>
        </p>
        {view.hasBadge && (
          <p>
            「本社のみ」は単体従業員数が連結の10%未満の会社に付けています。この数字はグループ全体を代表していません。
          </p>
        )}
      </footer>
    </div>
  );
}
