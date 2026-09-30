import type { SalaryHistory } from "../types";
import { historyBaseYear } from "../lib/historyTable";
import { buildHistoryPeak, buildHistorySummary } from "../lib/highlights";
import { YearlyBarChart } from "./YearlyBarChart";
import { SalaryHistoryTable } from "./SalaryHistoryTable";

/**
 * 平均年収推移（過去10年間。T1・T2・T3）。母集団の会社（`CompanyDetail`）と、母集団から外れた会社
 * （`UnrankedCompanyDetail`・D9・D11）の両方が使う。**表示基準と独立**（timeseries spec 2.2・AC-8）。
 */
export function SalaryHistorySection({ history }: { history: SalaryHistory }) {
  const historySummary = buildHistorySummary(history.years, history.values);
  const historyPeak = buildHistoryPeak(history.years, history.values);
  const historyBase = historyBaseYear(history);
  return (
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
        **チャート → 表 → 説明文**（運営者の指示。年齢別の推定年収も #846 で同じ順に
        そろえた）。推移で先に見たいのは10年ぶんの形で、値はその後に表で確かめるもの。
        増減の1文は figure と表の両方を受けた締めなので、2つの後ろに置く。
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
  );
}
