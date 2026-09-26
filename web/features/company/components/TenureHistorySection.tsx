import type { TenureHistory } from "../types";
import { buildTenureSummary } from "../lib/tenureHistory";
import { TenureHistoryChart } from "./TenureHistoryChart";
import { TenureHistoryTable } from "./TenureHistoryTable";

/**
 * 「在籍年数推移（過去10年間）」の節（T4・#835、Claude Design `在籍年数推移.dc.html` の 1b）。
 *
 * **平均年収推移と稼ぐ力の推移の間に置く。** どれも同じ10年・各年の有報から取った値で、
 * 在籍年数は平均年収と同じ書類の同じ表（提出会社単体）の数字になる。
 *
 * **チャート → 表 → 説明文**の順（推移の2節と同じ。運営者の指示）。
 *
 * **表示基準と独立。** 年齢そろえを選んでも過去の有報の在籍年数は変わらない。
 */
export function TenureHistorySection({
  history,
  name,
  industry,
}: {
  history: TenureHistory;
  name: string;
  industry: string;
}) {
  const summary = buildTenureSummary(history, name, industry);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">在籍年数推移（過去10年間）</h2>
      {/*
        **有報の語（平均勤続年数）で出典を書き、見出しと表は読者の語（在籍年数）にする**
        （glossary）。実測値の節の地の文も「平均勤続年数は…」と書いている。
      */}
      <p className="text-muted-foreground text-xs">
        各年の有価証券報告書に載った平均勤続年数の実測値（提出会社単体）。点線は{industry}の中央値です。
      </p>
      <TenureHistoryChart history={history} industry={industry} />
      <TenureHistoryTable history={history} />
      {summary !== null && <p className="text-sm">{summary}</p>}
    </section>
  );
}
