import type { ProfitHistory } from "../types";
import { buildProfitSummary } from "../lib/profitHistory";
import { YearlyBarChart } from "./YearlyBarChart";
import { ProfitHistoryTable } from "./ProfitHistoryTable";

/**
 * 「稼ぐ力の推移（過去10年間）」の節（P2・Issue #168・アートボード 6e）。
 *
 * **「平均年収推移（過去10年間）」の直後に置く。** どちらも同じ10年の縦棒で、
 * 並べると「給与が増えた年に利益も増えたのか」を目で追える。
 *
 * **チャート → 表 → 説明文**の順（平均年収推移と同じ。運営者の指示）。推移で
 * 先に見たいのは10年ぶんの形で、値はその後に表で確かめるもの。
 *
 * **表示基準と独立**（AC-11）。年齢そろえを選んでも過去の経常利益は変わらない。
 */
export function ProfitHistorySection({ history }: { history: ProfitHistory }) {
  const summary = buildProfitSummary(history);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">稼ぐ力の推移（過去10年間）</h2>
      {/*
        **分子と分母の範囲が年収と違うことを断る。** 年収は提出会社（単体）、
        稼ぐ力はグループ全体（連結）で、パート・アルバイトは従業員数に入らない
        （spec 2.4）。上の節が「提出会社単体」と書いているので、ここで
        言い直さないと同じ画面の2つの数字が同じ範囲に見える。
      */}
      <p className="text-muted-foreground text-xs">
        各年の有価証券報告書から算出した、従業員1人当たりの経常利益（連結の経常利益 ÷ 連結の従業員数）。パート・アルバイトは従業員数に含まれません。
      </p>
      <YearlyBarChart
        years={history.years}
        values={history.profit}
        caption="横軸は報告書の提出年です。単位は万円。"
      />
      <ProfitHistoryTable history={history} />
      {/* 増減の1文は図と表の両方を受けた締めなので末尾に置く（T2 と同じ）。 */}
      {summary !== null && <p className="text-sm">{summary}</p>}
    </section>
  );
}
