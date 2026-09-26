"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { companyPageMeta } from "@/lib/seo/company";
import { usePageMeta } from "@/lib/seo/usePageMeta";
import { shortIndustryLabel } from "@/lib/data/industry";
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
import { buildCardFacts, buildCardLead, type CardFact } from "../lib/cardFacts";
import { statsForBasis } from "../lib/stats";
import { SalaryCurveChart } from "./SalaryCurveChart";
import { SalaryDistributionChart } from "./SalaryDistributionChart";
import { YearlyBarChart } from "./YearlyBarChart";
import { SalaryHistoryTable } from "./SalaryHistoryTable";
import { historyBaseYear } from "../lib/historyTable";
import { ProfitHistorySection } from "./ProfitHistorySection";
import { AgeSalaryTable } from "./AgeSalaryTable";
import { WorklifeSection } from "./WorklifeSection";
import type { WorklifeView } from "../lib/worklife";
import { SUMMARY_SOURCE, type SummaryView } from "../lib/summary";
import { OverviewSection } from "./OverviewSection";
import { buildRadarAxes, type CompanyRadarInput } from "../lib/radar";
import { NeighborCompanies } from "./NeighborCompanies";
import { CompanyLogo } from "@/features/logo/components/CompanyLogo";
import { buildCurveSummary, buildHistoryPeak, buildHistorySummary } from "../lib/highlights";

/**
 * 表示基準（実測値／年齢そろえ）。**URL には出さない**（R1・ADR-0012）。
 *
 * 以前は `?age=N` として `useLocationSyncedState` で同期していた。やめた理由は2つ。
 *
 * 1. **このページを事前生成するため。** `force-static` のページは `searchParams` を
 *    読めない。読めるようにすると1,867枚がまた毎リクエストの描画に戻る（Issue #118）
 * 2. **年齢そろえで変わるのは推定年収まわりだけで、ページ全体ではない。** 実測値（Q&A）も
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
  summary,
  fiscalPeriod,
  analysis,
  digest,
  qa,
  sources,
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
   * 会社の説明文（C7・Issue #161）。**説明文の無い会社では `null`** で、そのとき
   * 節ごと出さない（AC-21。空の器・プレースホルダを出さない）。**`byBasis` の外に
   * 置く**——事業の記述なので表示基準でも年齢スイッチでも変わらない（AC-23）。
   */
  summary: SummaryView | null;
  /**
   * 掲載データの決算期（`2026年3月期`）。**文字列にするのはサーバー側**
   * （`app/company/[id]/page.tsx` が `lib/data/period.ts` を通す）で、ここは
   * 受け取って置くだけにする——`companies.meta` をクライアントへ渡す理由が
   * これ1つでは無いのと同じ理由で、渡すのは使う形だけにしておく。
   */
  fiscalPeriod: string;
  /**
   * 「{社名}の現状と今後」と「{社名}の有価証券報告書の要約」（C10・Issue #242）。
   * **静的な HTML として届く**（`CompanyDetailIsland` の名前付きスロット）。置く場所だけを
   * ここが決め、中身には触らない。**2つは対**（AC-28）で、両方あるか両方無いか。
   */
  analysis?: ReactNode;
  digest?: ReactNode;
  /**
   * 「{社名}の年収に関するQ&A」（C16・Issue #838）。実測値の4項目と EDINET の帯。**同じく
   * 静的な HTML として届く**——表示基準でも年齢でも変わらない。要約の後ろ・出典の前に置く。
   */
  qa?: ReactNode;
  /**
   * 「このページの出典」（C12・Issue #805）。**同じく静的な HTML として届く。** 本文の
   * 末尾（Q&A の後ろ）に置く。
   */
  sources?: ReactNode;
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
  const cardFacts = buildCardFacts(view, current);
  const cardLead = buildCardLead(view);
  const isRaw = targetAge === null;
  const breadcrumb = companyBreadcrumb(view);
  // 年齢別チャートは実測値モードでも出す。実測値には年齢の概念が無いので、
  // 8年齢ぶんだけを渡して選択中の点は無しにする。
  const byAge = view.byBasis.filter((s) => s.targetAge !== null);
  const historySummary = history
    ? buildHistorySummary(history.years, history.values)
    : null;
  const historyPeak = history ? buildHistoryPeak(history.years, history.values) : null;
  const historyBase = history ? historyBaseYear(history) : null;
  const curveSummary = buildCurveSummary(byAge, view.name);
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
      // 鉱業と陸運業で30.7倍開く。**値の下に右寄せで置く**（アートボード 6b）。
      //
      // **ここだけ業種名を略称にする**（`lib/data/industry.ts`）。行の2行目に
      // 収まらないと中央値だけが次の行へ落ち、その会社の行だけ3行になる
      // （`証券、商品先物取引業` で実測）。**同じ画面のパンくず・見出し・
      // 業界内順位は原文のまま**なので、突き合わせる先は同じ画面にある。
      profit:
        radar.profitIndustryMedian === null
          ? ""
          : `${shortIndustryLabel(view.tse33)}の中央値 ${formatManYen(radar.profitIndustryMedian)}`,
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
              <a href={item.path} className="text-primary underline">
                {item.name}
              </a>
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
        {/*
          **grid で組む**（アートボード 4b・2b）。説明文の左端が画面幅で変わる
          ——PC は社名にそろえてロゴの右から、モバイルはロゴの下を全幅で使う。
          flex を入れ子にすると出し分けられず、**同じ文を2つ書いて `hidden` で
          切り替えることになる**（CLAUDE.md「同じ文言を2つ書いて出し分けない」）。
        */}
        <div className="grid grid-cols-[auto_1fr] items-start gap-x-3.5 gap-y-3">
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
          {/*
            会社の説明文（C7・Issue #161、アートボード 4b・2b が3行の紹介文を描いている
            位置）。**説明文の無い会社では丸ごと出ない**——空の器を出さない（AC-21）。

            **順位行の直後・見せ方の帯より前に置く。** ここは「どの会社を見ているか」を
            answer する段で、下の2つの帯からは「その数字をどう見るか」に変わる。
            モバイルで年齢スイッチが押し下がるが、**押し下がるのは1回きりで、押し下げて
            いるのは読者が最初に読む文**になる（`docs/company/summary-display/design.md`）。

            **`max-w-2xl` で行長を止める**（アートボード 4b）。本文カラムは PC で
            1,024px あり、そこいっぱいに流すと1行が長すぎて次の行頭を見失う。
          */}
          {summary !== null && (
            <div className="col-span-2 flex max-w-2xl flex-col gap-1 sm:col-span-1 sm:col-start-2">
              <p className="text-muted-foreground text-sm leading-relaxed">{summary.text}</p>
              {/*
                要約であることと出典（AC-22）。**決算期を書かない**——企業詳細の決算期は
                下の「年収に関するQ&A」の説明と要約の節の説明の2か所と決まっている（S3・#134。
                C7 の時点では「有価証券報告書の実測値（2026年3月期）」の見出しと重なった）。
                **同じ断りも1画面に2回置かない**ので、下の Q&A にはこの文を重ねていない
                （Issue #128 と同じ扱い）。
              */}
              <p className="text-muted-foreground text-xs">
                {SUMMARY_SOURCE}（
                <a href="/about#company-summary" className="text-primary underline">
                  要約の作り方
                </a>
                ）
              </p>
            </div>
          )}
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
            **本文の先頭に置く**（C15・#821、spec 1.21）。検索からの流入の語は「年収」
            「年収ランキング」で占められており、読者が探している答えはこの金額になる。
            P1 からはレーダーが先頭で、金額は PC でも最初の画面の外にあった。

            **カードは2カラム**（C3、アートボード 5b）。左が「いくらか」、右が
            「その額が母集団のどこか」。C2 は全部を縦に積んでいたため、金額と位置の
            間に順位4件が挟まり、同じことを言う数字が離れていた。
            モバイルでは縦に積まれ、読み順は 金額 → 平均年齢・従業員数 → 順位 → 位置 →
            分布 になる（C14）。
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
                  <span className="text-muted-foreground mb-1 block text-sm">
                    {isRaw ? "平均年収（有価証券報告書・単体）" : `${targetAge}歳時点の推定年収`}
                  </span>
                  <p className="text-4xl font-bold tabular-nums">
                    {formatManYen(current.salary)}
                  </p>
                  {/*
                    **有報の値を1文で言い直す。全体平均との差は置かない**（位置はこのカードの
                    順位・偏差値・分布が持っている）。表示基準では変わらない（`buildCardLead`）。
                  */}
                  <p className="text-muted-foreground mt-1 mb-1 text-sm">{cardLead}</p>
                </div>

                {/*
                  **金額の下は2段**（C14・#818、spec 1.4）。1段目が「どういう会社の金額か」
                  （平均年齢・従業員数）、2段目が全体順位と業界内順位。**在籍年数はカードに
                  出さない**（下の「年収に関するQ&A」の平均勤続年数とレーダーの定着の軸にある）。
                  **偏差値も出さない**（#831）——右の位置バーの見出しの隣にある。平均年齢と
                  従業員数は下の節と重複するが、**金額の隣に無いと「35.0歳の会社の2,178万円」
                  という読み方ができない**（C3）。
                */}
                <CardFactList facts={cardFacts.profile} />
                <CardFactList facts={cardFacts.standing} />
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
            **カードの直後に置く**（C15・#821。P1 から C14 までは本文の先頭だった）。5軸を
            1枚にまとめた図なので、カードの金額を5軸の1本として含み、下の節（働きやすさ・
            年齢別・推移）の要約にもなる。
          */}
          <OverviewSection axes={radarAxes} />

          {/*
            **AI 分析はカードとレーダーの後ろ**（C10、アートボード 8a / 8b）。「◯◯ 年収」で
            来た読者の答え（カード）を押し下げず、数字を見た直後に「この会社はいまどうなのか」
            が続く。C10 の時点ではカードの直後だったが、C15 でカードとレーダーを入れ替えた
            ので、いまはレーダーの直後になる。
          */}
          {analysis}

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
            {/*
              **年齢補正の手順はこの1行だけ**（C12・#805）。以前は本文の末尾に
              「この数字の作り方」として3枚のカードで並べていたが、推定値はこの節
              （と年齢そろえの金額）にしか無く、既定の実測値では関係が薄い。見出しに
              「推定」があるので、この行では同じ語を重ねない（Issue #128）。
              **見出しと包まない**——既存の E2E は見出しの親をこの節として引いている。
            */}
            <p className="text-muted-foreground -mt-1.5 text-xs">
              実測値を業種の賃金カーブ（賃金構造基本統計調査）で各年齢の水準に置き換えた値です（
              <a href="/about" className="text-primary underline">
                計算方法
              </a>
              ）
            </p>
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

          {/*
            **推移は年齢別の推定年収の後ろ**（アートボード 4b）。C15 までは間に「有価証券報告書の
            実測値」（今年の1点）があり、この節がその10年ぶんだった。C16（#838）でその節を Q&A に
            作り替えて要約の後ろへ移した——同じ金額が本文の先頭のカードにあり、推移は節の説明
            （各年の有報の実測値）で自立している。
          */}
          {history && (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-bold">平均年収推移（過去10年間）</h2>
              {/*
                表示基準の切替と独立（timeseries spec 2.2・AC-8）。出典は AC-9。
                **比の断りは累積の列に付ける**（T3・#827 で前年比の列を平均年齢に置き換えた）。
                列の見出しと同じ基準年を名乗る——値のある年が無い会社はこの節ごと出ない。
              */}
              <p className="text-muted-foreground text-xs">
                各年の有価証券報告書に載った平均年間給与と平均年齢の実測値（提出会社単体）。
                {historyBase !== null &&
                  `${historyBase}年比は会社の平均が動いた幅で、個人の昇給率ではありません。`}
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

          {/*
            **有報の要約は稼ぐ力の推移の後ろ**（C10、アートボード 8a / 8b）。1文目が事業の
            説明になりやすく、ページ上部の説明文（C7）と内容が重なるので離して置く。
            分析と離れていることも、2つを取り違えにくくしている（AC-29）。
          */}
          {digest}

          {/*
            **要約の直後・出典の直前**（C16・#838、Claude Design の 1d）。実測値の4項目を1問ずつの
            質問と回答にした節で、EDINET の帯（C13）が下辺に付く。金額の答えは本文の先頭のカードが
            持っているので、ここはページ末尾のまとめになる。
          */}
          {qa}

          {/*
            **本文の末尾**（C12・#805）。ページに出ているデータを加工の度合いで6区分に分け、
            区分ごとに該当するものと出典を並べる。フッタの出典の行はこれに移した。
          */}
          {sources}
        </div>

        {/*
          **サイドバーは「水準が近い会社」の1枚だけ**（C11・#799）。以前は上に
          「この会社の要点」があったが、中身はカードの数値の繰り返しで、サイドバーを
          画面より高くしていた（`md:sticky` なので下端が本文の最後まで見えない）。
          要約の置き場所にもしない（C10 で決める）。
        */}
        <aside className="flex flex-col gap-4 md:sticky md:top-4">
          <NeighborCompanies
            neighbors={current.neighbors}
            industry={view.tse33}
            industryCount={view.industryCount}
          />
        </aside>
      </div>

      <footer className="text-muted-foreground flex flex-col gap-1 text-xs">
        {/*
          **出典はここに書かない**（C12・#805）。本文の末尾の「このページの出典」が
          ページ全体の出典を持っている。ここに以前あった1行は EDINET と賃金構造基本統計
          調査の2つしか挙げておらず、女性活躍DBが抜けていた。残すのは表示基準ごとの
          断り（AC-9）と「本社のみ」の断り（AC-6）。
        */}
        <p>
          {isRaw
            ? "実測値モードでは補正を行っていません。年齢別の推定年収だけが推定値です。"
            : "推定年収は年齢補正後の推定値です。実際の年収を保証するものではありません。"}
          <a href="/about" className="text-primary ml-1 underline">
            計算方法と限界
          </a>
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

/**
 * 平均年収カードの1段（C14・#818）。
 *
 * **2段とも2列の器に入れる。** 2段とも2項目なので、同じ器にすれば従業員数と業界内順位の
 * 左端がそろい、2つの段が1つの表に見える。C14 では2段目に偏差値があって3列だった
 * （#831 で外した）。**太字にしない**——カードの中で太いのは金額だけにする。
 *
 * **ラベルも値も1行に収める**（`whitespace-nowrap`）。3列だった頃は1つあたり 93px（1280px）しか
 * 無く、既定のままだと「38位 /1,867社」と「従業員数（単体）」が2行に折れていた（C3 の公開後に
 * 報告あり）。2列で 143px になり余裕ができたが、指定は残す。
 */
function CardFactList({ facts }: { facts: CardFact[] }) {
  return (
    <dl className="border-border grid grid-cols-2 gap-2 border-t pt-3">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt className="text-muted-foreground text-[0.7rem] whitespace-nowrap">{fact.label}</dt>
          <dd className="whitespace-nowrap tabular-nums">
            {fact.value}
            {fact.total && (
              <span className="text-muted-foreground text-[0.7rem]"> {fact.total}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
