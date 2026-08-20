"use client";

import { NavLink } from "@/features/navigation/components/NavLink";
import { useEffect, useState } from "react";
import { Badge } from "@/design-system/ui/badge";
import { Card, CardContent } from "@/design-system/ui/card";
import { AgeSwitch } from "@/features/ranking/components/AgeSwitch";
import { ControlBand } from "@/features/ranking/components/ControlBand";
import { BasisSwitch } from "@/features/ranking/components/BasisSwitch";
import { DEFAULT_TARGET_AGE } from "@/features/ranking/lib/urlState";
import {
  formatDecimal1,
  formatInt,
  formatManYen,
} from "@/features/ranking/lib/format";
import { TARGET_AGES, type TargetAge } from "@/features/ranking/types";
import type { CompanyView, SalaryHistory } from "../types";
import {
  formatDeviation,
  formatDiffFromMean,
  statsForBasis,
} from "../lib/stats";
import { SalaryCurveChart } from "./SalaryCurveChart";
import { SalaryDistributionChart } from "./SalaryDistributionChart";
import { SalaryHistoryChart } from "./SalaryHistoryChart";
import { AgeSalaryTable } from "./AgeSalaryTable";
import { NeighborCompanies } from "./NeighborCompanies";
import { HowItWorks } from "./HowItWorks";
import { CompanyLogoMark } from "@/features/ranking/components/CompanyLogoMark";
import {
  buildCurveSummary,
  buildHighlights,
  buildHistorySummary,
} from "../lib/highlights";

function parseAge(raw: string | null): TargetAge | null {
  const n = Number(raw);
  return (TARGET_AGES as readonly number[]).includes(n)
    ? (n as TargetAge)
    : null;
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
  const historySummary = history
    ? buildHistorySummary(history.years, history.values)
    : null;
  const curveSummary = buildCurveSummary(byAge, view.name);

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
        {/*
          ロゴマークを大きくし、社名と位置をその右に積む（C3、アートボード 4b）。
          C2 では h1 の中に小さなマークが並んでいて、社名の一部のように見えていた。
        */}
        <div className="flex items-start gap-3.5">
          <CompanyLogoMark name={view.name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {/* 390px では 28px だと社名が2行に折れる（実測）。モバイルは1段落とす。 */}
              <h1 className="text-2xl font-bold sm:text-3xl">{view.name}</h1>
              {view.hasBadge && <Badge variant="outline">本社のみ</Badge>}
            </div>
            {/*
              順位を h1 の直下に置く（アートボード 4b）。カードの中まで読まなくても位置が分かる。
              **上位◯%は出さない**（運営者の指示）。モックの言い回しに揃えてある。
            */}
            <p className="text-muted-foreground text-sm">
              {`${view.tse33} ・業界${formatInt(view.industryCount)}社中${formatInt(current.rankIndustry)}位` +
                ` ・全体${formatInt(view.totalCount)}社中${formatInt(current.rankAll)}位`}
            </p>
          </div>
        </div>
        {/* 器はランキングと同じ（U13 の ControlBand）。同じ操作を2ページで別の形にしない。 */}
        <ControlBand
          label="見せ方"
          hint={
            isRaw
              ? `有価証券報告書の数値そのまま（平均年齢 ${formatDecimal1(view.avgAge)}歳の会社全体の平均）`
              : `業種の賃金カーブで${targetAge}歳の水準に置き換えた推定値`
          }
        >
          <BasisSwitch
            value={targetAge}
            onChange={(basis) =>
              setTargetAge(basis === "raw" ? null : DEFAULT_TARGET_AGE)
            }
            label="見せ方"
          />
        </ControlBand>
        <ControlBand
          label="年齢"
          tone={isRaw ? "dashed" : "solid"}
          hint={isRaw ? "「年齢そろえ」のときだけ使います" : undefined}
        >
          {/* 実測値のときも消さずに無効化する（ADR-0007）。理由は AgeSwitch.tsx。 */}
          <AgeSwitch
            value={targetAge}
            onChange={setTargetAge}
            disabled={isRaw}
          />
        </ControlBand>
      </header>

      {/* PC は本文＋右サイドバー、モバイルは1カラム（アートボード 4b / 2b）。 */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[1fr_19.75rem] md:items-start md:gap-6">
        <div className="flex min-w-0 flex-col gap-12">
          {/*
            **カードは2カラム**（C3、アートボード 5b）。左が「いくらか」、右が
            「その額が母集団のどこか」。C2 は全部を縦に積んでいたため、金額と位置の
            間に順位4件が挟まり、同じことを言う数字が離れていた。
            モバイルでは縦に積まれ、読み順は 金額 → 順位 → 位置 → 分布 になる。
          */}
          <Card>
            <CardContent className="grid gap-6 p-5 md:grid-cols-2">
              <div className="flex flex-col gap-4">
                <div>
                  {/* 実測値では「推定」バッジも「推定」の語も出さない（spec AC-9）。 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-sm">
                      {isRaw
                        ? "平均年収（有価証券報告書・単体）"
                        : `${targetAge}歳時点の推定年収`}
                    </span>
                    {!isRaw && <Badge variant="secondary">推定</Badge>}
                  </div>
                  <p className="text-4xl font-bold tabular-nums">
                    {formatManYen(current.salary)}
                  </p>
                  <p className="text-muted-foreground mt-1 mb-1 text-sm">
                    全体平均 {formatManYen(current.populationMean)} に対して{" "}
                    <span className="text-foreground font-medium">
                      {formatDiffFromMean(current.diffFromMean)}
                    </span>
                  </p>
                </div>

                {/*
                  **3つとも1行に収める。** ラベルも値も `whitespace-nowrap` にしてある——
                  カードを2カラムにしたぶん1つあたり 110px ほどしか無く、既定のままだと
                  「38位 /1,867社」と「従業員数（単体）」が2行に折れていた（報告あり）。
                  偏差値に上位◯%は添えない（モックに無いものを足さない）。
                */}
                <dl className="border-border grid grid-cols-3 gap-2 border-t pt-3">
                  <div>
                    <dt className="text-muted-foreground text-[0.7rem] whitespace-nowrap">
                      全体順位
                    </dt>
                    <dd className="font-semibold whitespace-nowrap tabular-nums">
                      {formatInt(current.rankAll)}位
                      <span className="text-muted-foreground text-[0.7rem] font-normal">
                        {" "}
                        /{formatInt(view.totalCount)}社
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-[0.7rem] whitespace-nowrap">
                      業界内順位
                    </dt>
                    <dd className="font-semibold whitespace-nowrap tabular-nums">
                      {formatInt(current.rankIndustry)}位
                      <span className="text-muted-foreground text-[0.7rem] font-normal">
                        {" "}
                        /{formatInt(view.industryCount)}社
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-[0.7rem] whitespace-nowrap">
                      年収偏差値
                    </dt>
                    <dd className="font-semibold whitespace-nowrap tabular-nums">
                      {formatDeviation(current.deviation)}
                    </dd>
                  </div>
                </dl>

                {/*
                  平均年齢・在籍年数・従業員数はカードの中にも出す（アートボード 5b）。
                  下の「有価証券報告書の実測値」と重複するが、**金額の隣に無いと
                  「35.0歳の会社の2,178万円」という読み方ができない**。
                */}
                <dl className="border-border grid grid-cols-3 gap-2 border-t pt-3">
                  <div>
                    <dt className="text-muted-foreground text-[0.7rem] whitespace-nowrap">
                      平均年齢
                    </dt>
                    <dd className="whitespace-nowrap tabular-nums">
                      {formatDecimal1(view.avgAge)}歳
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-[0.7rem] whitespace-nowrap">
                      在籍年数
                    </dt>
                    <dd className="whitespace-nowrap tabular-nums">
                      {formatDecimal1(view.avgTenure)}年
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-[0.7rem] whitespace-nowrap">
                      従業員数（単体）
                    </dt>
                    <dd className="whitespace-nowrap tabular-nums">
                      {formatInt(view.employees)}人
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="flex flex-col justify-center gap-6">
                {/* 分布の中での位置（spec 1.13）。平均との差だけでは裾か中央かが分からない。 */}
                <SalaryDistributionChart
                  current={current}
                  count={view.totalCount}
                  companyName={view.name}
                />
              </div>
            </CardContent>
          </Card>

          {/*
            **表 → 説明文 → チャート**の順（C3、アートボード 4b）。C2 は図が先だったが、
            8点の金額を確かめたい読者は表を、形を掴みたい読者はチャートを見る。先に
            数値を出しておくと、図は「その形」を確かめるためだけのものになる。
          */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">年齢別の推定年収</h2>
            <AgeSalaryTable byAge={byAge} selectedAge={targetAge} />
            {/* 数値から機械的に導ける事実だけ（要点の箇条書きと同じ線）。 */}
            <div className="flex flex-col gap-0.5">
              {curveSummary.map((sentence) => (
                <p key={sentence} className="text-sm">
                  {sentence}
                </p>
              ))}
            </div>
            <p className="text-muted-foreground text-center text-sm font-semibold mt-4">
              年齢別の推定年収の推移
            </p>
            <SalaryCurveChart byAge={byAge} selectedAge={targetAge} />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">有価証券報告書の実測値</h2>
            <p className="text-muted-foreground text-xs">
              {isRaw
                ? "補正していない実際の数字です。提出会社（単体）のもので、連結子会社の従業員は入りません。"
                : "ここから下は補正していない実際の数字です。提出会社（単体）のもので、連結子会社の従業員は入りません。"}
            </p>
            {/*
              罫線で仕切った4セル（アートボード 4b）。地のまま並べると、上のカードの
              数値との境目が無く、どこからが「補正していない数字」なのかが分からない。
              `gap-px` と背景色で1本ずつの罫線を作る（内側の罫線を各セルに書くと角で重なる）。
            */}
            <dl className="bg-border border-border grid grid-cols-2 gap-px overflow-hidden rounded-lg border sm:grid-cols-4">
              <div className="bg-background p-3">
                <dt className="text-muted-foreground text-xs">平均年収</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatManYen(view.avgSalary)}
                </dd>
              </div>
              <div className="bg-background p-3">
                <dt className="text-muted-foreground text-xs">平均年齢</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatDecimal1(view.avgAge)}歳
                </dd>
              </div>
              <div className="bg-background p-3">
                <dt className="text-muted-foreground text-xs">在籍年数</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatDecimal1(view.avgTenure)}年
                </dd>
              </div>
              <div className="bg-background p-3">
                <dt className="text-muted-foreground text-xs">
                  従業員数（単体）
                </dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatInt(view.employees)}人
                </dd>
              </div>
            </dl>
          </section>

          {/*
            **推移は「有価証券報告書の実測値」の下**（アートボード 4b）。どちらも
            補正していない数字で、上の節が今年の1点、この節がその10年ぶんになる。
            C2 は推定年収の節と実測値の節の間に挟んでいたため、実測の数字が
            2か所に分かれていた。
          */}
          {history && (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-bold">平均年収推移（過去10年間）</h2>
              {/* 表示基準の切替と独立（timeseries spec 2.2・AC-8）。出典は AC-9。 */}
              <p className="text-muted-foreground text-xs">
                各年の有価証券報告書に載った平均年間給与の実測値（提出会社単体）。単位は万円。
              </p>
              <SalaryHistoryChart history={history} summary={historySummary} />
            </section>
          )}

          <HowItWorks />
        </div>

        {/* サイドバーは2枚のカード（アートボード 5b）。地のままだと本文の続きに見える。 */}
        <aside className="flex flex-col gap-4 md:sticky md:top-4">
          <section className="bg-muted flex flex-col gap-2 rounded-lg p-4">
            <h2 className="text-sm font-bold">この会社の要点</h2>
            {/* 数値から導ける事実だけ。会社ごとの解説文は書かない（spec 1.11）。 */}
            <ul className="text-muted-foreground flex list-disc flex-col gap-1.5 pl-4 text-xs leading-relaxed">
              {highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <NeighborCompanies
            neighbors={current.neighbors}
            industry={view.tse33}
            industryCount={view.industryCount}
          />
        </aside>
      </div>

      <footer className="text-muted-foreground flex flex-col gap-1 text-xs">
        <p>
          出典: 金融庁 EDINET
          の有価証券報告書（2026年6〜7月提出。推移は2017〜2026年の各年）、厚生労働省「賃金構造基本統計調査」。
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
