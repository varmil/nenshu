"use client";

import { Fragment, useEffect, useState } from "react";
import { NavLink } from "@/features/navigation/components/NavLink";
import { companyPageMeta } from "@/lib/seo/company";
import { usePageMeta } from "@/lib/seo/usePageMeta";
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
import { type TargetAge } from "@/features/ranking/types";
import type { CompanyView, ProfitHistory, SalaryHistory } from "../types";
import { companyBreadcrumb } from "../lib/breadcrumb";
import {
  formatDeviation,
  formatDiffFromMean,
  statsForBasis,
} from "../lib/stats";
import { SalaryCurveChart } from "./SalaryCurveChart";
import { SalaryDistributionChart } from "./SalaryDistributionChart";
import { YearlyBarChart } from "./YearlyBarChart";
import { SalaryHistoryTable } from "./SalaryHistoryTable";
import { ProfitHistorySection } from "./ProfitHistorySection";
import { AgeSalaryTable } from "./AgeSalaryTable";
import { WorklifeSection } from "./WorklifeSection";
import type { WorklifeView } from "../lib/worklife";
import { OverviewSection } from "./OverviewSection";
import { buildRadarAxes, type CompanyRadarInput } from "../lib/radar";
import { NeighborCompanies } from "./NeighborCompanies";
import { HowItWorks } from "./HowItWorks";
import { CompanyLogo } from "@/features/logo/components/CompanyLogo";
import {
  buildActualsSummary,
  buildCurveSummary,
  buildHighlights,
  buildHistoryPeak,
  buildHistorySummary,
} from "../lib/highlights";

/**
 * 表示基準（実測値／年齢そろえ）。**URL には出さない**（R1・ADR-0012）。
 *
 * 以前は `?age=N` として `useLocationSyncedState` で同期していた。やめた理由は2つ。
 *
 * 1. **このページを事前生成するため。** `force-static` のページは `searchParams` を
 *    読めない。読めるようにすると1,867枚がまた毎リクエストの描画に戻る（Issue #118）
 * 2. **年齢そろえで変わるのは推定年収まわりだけで、ページ全体ではない。** 実測値の節も
 *    10年推移も変わらない。ページ全体にかかるパラメータとして持つと、後から項目が
 *    増えるほど「URLが指しているのは何なのか」が曖昧になる。いずれ推定年収の要素に
 *    付いたスイッチへ寄せる
 *
 * `useRankingState` を共用しないのは変わらない。あちらは7つの値とページ番号を持ち、
 * その大半は企業ページに存在しない概念になる。
 */
function useTargetAge() {
  const [targetAge, setTargetAge] = useState<TargetAge | null>(null);

  /*
   * 配ってしまった `?age=N` のリンクは掃除する。**読みはしない**——読むと 1. の
   * 「URLが正」に半分戻ることになる。落とさずに置くと、URL は35歳・画面は実測値、
   * という食い違いがそのまま残る（親 Issue #130 が報告したのはこの形の DOM だった）。
   * `replaceState` なので履歴は増えない。
   */
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("age")) return;
    url.searchParams.delete("age");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  return { targetAge, setTargetAge };
}

export function CompanyDetail({
  view,
  radar,
  worklife,
  history,
  profitHistory,
  fiscalPeriod,
}: {
  view: CompanyView;
  /**
   * レーダー4軸（P1・Issue #167）。**平均年収の軸は入っていない**——
   * 表示基準で変わるので、ここで `current` から作って5軸目に足す（AC-11）。
   */
  radar: CompanyRadarInput;
  /**
   * 残業・有給・男女の賃金の差異（W1・Issue #150）。**`byBasis` の外に置く**
   * ——年齢補正を通さない値で、表示基準を切り替えても1つも変わらない（AC-11）。
   * 推移（`history`）と同じ扱いにしてある。**掲載が無い会社でも `null` にならない**
   * （器を空のまま出すのが AC-10）。
   */
  worklife: WorklifeView;
  /** 10年推移。取れていない会社は `null`。 */
  history: SalaryHistory | null;
  /**
   * 稼ぐ力の10年推移（P2・Issue #168）。取れていない会社は `null`。
   * **`byBasis` の外に置く**——年齢そろえを選んでも過去の経常利益は変わらない。
   */
  profitHistory: ProfitHistory | null;
  /**
   * 掲載データの決算期（`2026年3月期`）。**文字列にするのはサーバー側**
   * （`app/company/[id]/page.tsx` が `lib/data/period.ts` を通す）で、ここは
   * 受け取って置くだけにする——`companies.meta` をクライアントへ渡す理由が
   * これ1つでは無いのと同じ理由で、渡すのは使う形だけにしておく。
   */
  fiscalPeriod: string;
}) {
  const { targetAge, setTargetAge } = useTargetAge();
  /*
   * **表示基準では動かない。この会社のメタデータは1組しかない**（R1・ADR-0012）。
   * それでも書くのは、**ランキングから遷移してきたときに前のページの canonical と
   * description が `<head>` に残るため**。`usePageMeta` は DOM を直接書き換えるので
   * React の管理外にあり、遷移しても元に戻らない（`<title>` だけは React が
   * 書き戻すので、書かないと「タイトルは会社・canonical は `/?age=40`」になる。
   * `e2e/metadata.spec.ts` の進む/戻るのテストが実際にこれを捕まえた）。
   */
  usePageMeta(companyPageMeta(view, fiscalPeriod));
  const current = statsForBasis(view, targetAge);
  const isRaw = targetAge === null;
  const breadcrumb = companyBreadcrumb(view);
  // 年齢別チャートは実測値モードでも出す。実測値には年齢の概念が無いので、
  // 8年齢ぶんだけを渡して選択中の点は無しにする。
  const byAge = view.byBasis.filter((s) => s.targetAge !== null);
  const highlights = buildHighlights(view, current);
  const historySummary = history
    ? buildHistorySummary(history.years, history.values)
    : null;
  const historyPeak = history ? buildHistoryPeak(history.years, history.values) : null;
  const curveSummary = buildCurveSummary(byAge, view.name);
  const actualsSummary = buildActualsSummary(view);
  /*
   * レーダーの5軸（P1）。**平均年収の軸だけが表示基準に追随する**（AC-11）——
   * 残り4軸は年齢補正を通さない値なので、`radar` に確定したまま渡ってくる。
   */
  const radarAxes = buildRadarAxes(
    {
      salary: {
        value: current.salary,
        rank: current.rankAll,
        population: view.totalCount,
      },
      ...radar,
    },
    {
      salary: formatManYen,
      paidLeave: (v) => `${formatDecimal1(v)}%`,
      tenure: (v) => `${formatDecimal1(v)}年`,
      profit: formatManYen,
      overtime: (v) => `${formatDecimal1(v)}時間`,
    },
    {
      // **業種の中央値を併記しないと読み違える**（spec 1.3）。稼ぐ力は
      // 海運業と輸送用機器で19倍開く。**値の下に右寄せで置く**（アートボード 6b）。
      profit:
        radar.profitIndustryMedian === null
          ? ""
          : `${view.tse33}の中央値 ${formatManYen(radar.profitIndustryMedian)}`,
    },
    { profit: "1人当たり経常利益" }
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      {/*
        段の並びは `features/company/lib/breadcrumb.ts` が持つ。**構造化データ
        （`BreadcrumbList`）が同じ配列を読む**ので、ここで書き足すと画面と
        JSON-LD が食い違う（S2・AC-14）。
      */}
      <nav className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
        {breadcrumb.map((item, index) =>
          index === breadcrumb.length - 1 ? (
            // パンくずの末尾は現在地なのでリンクにしない（アートボード 4b）。
            <span key={item.path} aria-current="page" className="text-foreground min-w-0 truncate">
              {item.name}
            </span>
          ) : (
            <Fragment key={item.path}>
              {/*
                prefetch={false}。`/` は動的レンダリングで、返るのは1,867社ぶんを含む
                ページ（gzip 72KB）。読むとは限らない導線を先読みさせる価値はない。
                理由の詳細は RankingTable.tsx。
              */}
              <NavLink href={item.path} prefetch={false} className="text-primary underline">
                {item.name}
              </NavLink>
              <span aria-hidden="true">/</span>
            </Fragment>
          )
        )}
      </nav>

      <header className="flex flex-col gap-3">
        {/*
          ロゴマークを大きくし、社名と位置をその右に積む（C3、アートボード 4b）。
          C2 では h1 の中に小さなマークが並んでいて、社名の一部のように見えていた。
        */}
        <div className="flex items-start gap-3.5">
          <CompanyLogo id={view.id} name={view.name} size="lg" />
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
              ? "有価証券報告書の数値そのまま"
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
            **本文の先頭に置く**（P1、アートボード 6b）。5軸を1枚にまとめた図なので、
            下の節（金額・働きやすさ・年齢別・推移）の要約として最初に来る。
          */}
          <OverviewSection axes={radarAxes} />

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
                  {/*
                    実測値では「推定」の語を出さない（spec AC-9）。年齢そろえの
                    ときは見出しが「35歳時点の推定年収」なので、**同じ語を繰り返す
                    バッジは置かない**（Issue #128）。
                  */}
                  <span className="text-muted-foreground text-sm">
                    {isRaw ? "平均年収（有価証券報告書・単体）" : `${targetAge}歳時点の推定年収`}
                  </span>
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
            **上のカードと「年齢別の推定年収」の間に置く**（W1、アートボード 6b）。
            上のカードまでが有報の数字、ここから下は別の出典・別の時点になるので、
            推定の話（年齢別）に入る前に区切りを1つ挟む形にしてある。
          */}
          <WorklifeSection view={worklife} />

          {/*
            **表 → 説明文 → チャート**の順（C3、アートボード 4b）。C2 は図が先だったが、
            8点の金額を確かめたい読者は表を、形を掴みたい読者はチャートを見る。先に
            数値を出しておくと、図は「その形」を確かめるためだけのものになる。
          */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">年齢別の推定年収</h2>
            <AgeSalaryTable byAge={byAge} selectedAge={targetAge} />
            {/*
              数値から機械的に導ける事実だけ（要点の箇条書きと同じ線）。**3文を1つの
              段落として続ける**（運営者の指示）——1文ずつ `<p>` に分けると、どれも
              同じ8点についての話なのに3つの話題が並んでいるように見える。改行は器の幅に
              任せる。和文なので句点のあとに空白は入れない（推移の説明と同じ扱い）。
            */}
            {curveSummary.length > 0 && <p className="text-sm">{curveSummary.join("")}</p>}
            <p className="text-muted-foreground text-center text-sm font-semibold mt-4">
              年齢別の推定年収の推移
            </p>
            <SalaryCurveChart byAge={byAge} selectedAge={targetAge} />
          </section>

          <section className="flex flex-col gap-2">
            {/*
              **決算期はここに置く**（S3・`docs/site-chrome/spec.md` 5.1）。この節の
              中身がその決算期の数字そのものなので、見出しに付くのがいちばん短い。
              **画面の他の場所には重ねない**（脚注にも出すと1画面に2回になる）。
            */}
            <h2 className="text-lg font-bold">有価証券報告書の実測値（{fiscalPeriod}）</h2>
            {/*
              **下の4セルを1文にしただけの地の文**（C4・spec 1.17）。数値は増やさない。
              `dl` に入れた数値は「ラベルと値の対」としてしか読めないので、同じ内容を
              文としても置く。決算期は見出しが持っているのでここには書かない（1画面に1回）。
            */}
            <p className="text-sm">{actualsSummary}</p>
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
                各年の有価証券報告書に載った平均年間給与の実測値（提出会社単体）。前年比は会社の平均が動いた幅で、個人の昇給率ではありません。
              </p>
              {/*
                **チャート → 表 → 説明文**（運営者の指示）。年齢別の推定年収は表が先だが、
                推移で先に見たいのは10年ぶんの形で、値はその後に表で確かめるもの。増減の
                1文は figure と表の両方を受けた締めなので、2つの後ろに置く。
              */}
              <YearlyBarChart
                years={history.years}
                values={history.values}
                caption="横軸は報告書の提出年です。"
              />
              <SalaryHistoryTable history={history} />
              {/*
                増減の1文に、最高値の年を足す（C4）。**最新年が最高値の会社では
                `buildHistoryPeak` が `null` を返す**——1文目と同じ数字になるため。
              */}
              {historySummary && (
                <p className="text-sm">
                  {/* 和文なので句点のあとに空白を入れない（2文で1段落）。 */}
                  {historySummary}
                  {historyPeak}
                </p>
              )}
            </section>
          )}

          {/*
            **平均年収推移の直後**（P2、アートボード 6e）。同じ10年の縦棒を並べると、
            給与が増えた年に利益も増えたのかを目で追える。
          */}
          {profitHistory && <ProfitHistorySection history={profitHistory} />}

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
        {/*
          **決算期はここに書かない。** 上の「有価証券報告書の実測値（{決算期}）」に
          出ているので、重ねると1画面に2回になる（spec 5.1）。推移の年は
          `history.json` の `years` から引く——手で書くと年1回のデータ更新で
          ここだけ古い範囲が残る。
        */}
        <p>
          出典: 金融庁 EDINET の有価証券報告書
          {history ? `（推移は${history.years[0]}〜${history.years[history.years.length - 1]}年の各年）` : ""}
          、厚生労働省「賃金構造基本統計調査」。
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
