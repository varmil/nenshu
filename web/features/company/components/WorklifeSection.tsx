import type {
  WorklifeMetricView,
  WorklifeValueRow,
  WorklifeView,
} from "../lib/worklife";

/**
 * 「残業・有給・男女の賃金の差異」の節（W1・Issue #150・アートボード 6b / 6c）。
 *
 * **見出しに「働きやすさ」の語を使わない。** 3指標がそれを代表しているわけでは
 * なく（残業と有給は労働時間、賃金の差異は処遇の話）、まとめ名を付けると
 * 3つの数字が総合評価の材料に見える。**指標名をそのまま並べる**
 * （spec.md 5. の未決事項に対する W1 の答え）。
 *
 * **表示基準（実測値 / 年齢そろえ）と独立**（AC-11）。年齢補正を通さない値なので
 * `CompanyView.byBasis` の外から渡す——推移（timeseries）と同じ扱いにしてある。
 */
export function WorklifeSection({ view }: { view: WorklifeView }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">残業・有給・男女の賃金の差異</h2>
      {/*
        **「推定」とも「実測値」とも呼ばない。「自己申告値」**（AC-9・glossary）
        ——「実測値」は有報の平均年間給与を指す語で、同じ画面にある以上ぶつかる。
        時点も**有報の決算期とは別物**なので `lib/data/period.ts` には相乗りさせない。
      */}
      <p className="text-muted-foreground text-xs">
        厚生労働省「女性の活躍推進企業データベース」の公表値
        {view.asOf === "" ? "（自己申告値）" : `（${view.asOf}・自己申告値）`}
        。上の「見せ方」とは関係なく、登録された数字のままです。
      </p>

      <dl className="border-border divide-border flex flex-col divide-y border-t border-b">
        {view.metrics.map((metric) => (
          <WorklifeMetricRow key={metric.key} metric={metric} />
        ))}
      </dl>

      {/*
        会社が登録した注釈・説明（716社）はそのまま出す（AC-8）。**要約も編集も
        しない。** 改行を含む自由記述なので `whitespace-pre-line` で行を保つ。
      */}
      {view.note !== "" && (
        <div className="bg-muted flex flex-col gap-1 rounded-lg p-3">
          <p className="text-xs font-semibold">会社が登録した説明</p>
          <p className="text-muted-foreground text-xs leading-relaxed whitespace-pre-line">
            {view.note}
          </p>
        </div>
      )}

      <p className="text-muted-foreground text-xs leading-relaxed">
        取得率は繰越分の消化により100%を超えることがあります。賃金の差異は職種構成や勤続年数の差が主因であることが多い値です
        {view.wageGapPeriod === "" ? "" : `（対象期間 ${view.wageGapPeriod}）`}。
        {view.listed
          ? "データベースへの掲載は任意で、値は監査を経ていません。"
          : "この会社はデータベースに掲載がありません。掲載は任意です。"}
      </p>
    </section>
  );
}

/**
 * 1指標＝1行。**PC は2カラム（左にラベル、右に値）、モバイルは上下**
 * （アートボード 6b / 6c）。左カラムの中身は同じで、並ぶ向きだけが変わる。
 */
function WorklifeMetricRow({ metric }: { metric: WorklifeMetricView }) {
  const hasBar = metric.rows.some((row) => row.ratio !== null);
  return (
    <div className="grid gap-1.5 py-3 sm:grid-cols-[13rem_1fr] sm:gap-4">
      {/*
        モバイルは「ラベル …… 単位」の1行、PC はラベルの下に単位（アートボード 6c / 6b）。
        **`justify-between` を PC でも効かせない**——縦積みになると左カラムの高さ
        （区分5件ぶん）いっぱいに引き離され、単位が5行下の行末に落ちる（実測）。
      */}
      <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:justify-start sm:gap-0.5">
        <dt className="text-sm font-semibold">{metric.label}</dt>
        {/* 単位は**行ごとに繰り返さず**ここに1回だけ置く（アートボード 6c）。 */}
        {metric.unit !== "" && (
          <span className="text-muted-foreground text-xs">{metric.unit}</span>
        )}
        {metric.definition !== "" && (
          <span className="text-muted-foreground text-xs">{metric.definition}</span>
        )}
      </div>
      <dd className="min-w-0">
        {metric.rows.length === 0 ? (
          /*
            **項目ごと消さない**（AC-10）。消すと「残業が少ない会社」と
            見分けがつかなくなる。
          */
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">掲載なし</span>
            <span className="text-muted-foreground text-xs">{metric.emptyNote}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {metric.rows.map((row) => (
              <WorklifeRowLine
                key={row.label}
                row={row}
                hasBar={hasBar}
                valueSuffix={metric.valueSuffix}
              />
            ))}
          </div>
        )}
      </dd>
    </div>
  );
}

/**
 * 長い区分名は**字を一段落として行内に収める。省略しない**（AC-12）。
 * `技術系　無期雇用（フルタイム）` のような16文字級が実在し、`truncate` で
 * 切ると「技術系…」だけが残って何の区分か読めなくなる。
 */
function labelClass(label: string): string {
  return label.length > 10 ? "text-[0.65rem] leading-tight" : "text-xs";
}

function WorklifeRowLine({
  row,
  hasBar,
  valueSuffix,
}: {
  row: WorklifeValueRow;
  hasBar: boolean;
  valueSuffix: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`min-w-0 flex-1 ${labelClass(row.label)}`}>{row.label}</span>
      {hasBar && <WorklifeBar ratio={row.ratio} />}
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {row.value.toFixed(1)}
        {valueSuffix !== "" && (
          <span className="text-muted-foreground ml-0.5 text-xs font-normal">
            {valueSuffix}
          </span>
        )}
      </span>
    </div>
  );
}

/** バーのメモリ数。**1メモリ＝10時間・10%**（アートボード 6c）。 */
const TICKS = 10;

/**
 * 値そのものは丸めずに出し、**棒の長さだけ上限100で止める**（AC-7）。
 *
 * 塗られていないメモリは**描かない**——10個の空セルを敷くと、値の小さい会社ほど
 * 灰色の帯が目立ち、棒が短いことより器の長さが先に目に入る。
 */
function WorklifeBar({ ratio }: { ratio: number | null }) {
  if (ratio === null) return <span className="w-16 shrink-0" aria-hidden="true" />;
  const filled = ratio * TICKS;
  return (
    <span className="flex h-1.5 w-16 shrink-0 gap-px" aria-hidden="true">
      {Array.from({ length: TICKS }, (_, i) => {
        const width = Math.min(Math.max(filled - i, 0), 1);
        return (
          <span key={i} className="flex-1 overflow-hidden rounded-[1px]">
            {width > 0 && (
              <span
                className="bg-primary block h-full"
                style={{ width: `${width * 100}%` }}
              />
            )}
          </span>
        );
      })}
    </span>
  );
}
