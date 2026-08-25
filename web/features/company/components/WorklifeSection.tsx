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
    <div className="grid gap-1.5 py-3 sm:grid-cols-[14.375rem_1fr] sm:gap-4">
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
        {/*
          **1行に収める**（アートボード 6b）。既定のまま折ると `× 100` の
          `100` だけが2行目に落ち、式が割れて読めなくなる（実測）。
          230px に収まる字送りまで落としてから `nowrap` で固定する。
        */}
        {metric.definition !== "" && (
          <span className="text-muted-foreground text-[0.625rem] whitespace-nowrap">
            {metric.definition}
          </span>
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
  const sub = row.subordinate === true;
  return (
    <div className="flex items-center gap-2">
      {/*
        **ラベルの幅は固定**（アートボード 6b・6c の `width:96px`）。伸ばすと
        バーの左端が行ごとに動き、長さを見比べられなくなる。
      */}
      <span
        className={`${hasBar ? "w-24 shrink-0" : "min-w-0 flex-1"} ${labelClass(row.label)} ${
          sub ? "text-muted-foreground" : ""
        }`}
      >
        {row.label}
      </span>
      {hasBar && <WorklifeBar ratio={row.ratio} />}
      {/*
        **値の列は固定幅**（アートボード 6b の `min-width:56px`）。桁数で幅が
        変わると器の右端が行ごとに動き、**器の長さが違うので棒を見比べられない**
        （`10.5` と `3.3` で9pxずれていた・実測）。
      */}
      <span
        className={`min-w-14 shrink-0 text-right tabular-nums ${
          sub ? "text-sm font-normal" : "text-base font-semibold"
        }`}
      >
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

/**
 * 値そのものは丸めずに出し、**棒の長さだけ上限100で止める**（AC-7）。
 *
 * **器（グレーの下敷き）を敷き、その上に塗りと10等分の区切り線を重ねる**
 * （アートボード 6b・6c、Issue #191）。W1 は「空のメモリを描くと器の長さが
 * 先に目に入る」として塗られたメモリだけを並べていたが、**下敷きが無いと
 * 目盛りの基準が消え、10.5 と 26.0 の差が「どれだけのうちの差か」読めない。**
 * 区切り線は地の色で抜く——線を足すのではなく器を切る形にすると、塗りの上でも
 * 空の上でも同じ位置に出る。
 */
function WorklifeBar({ ratio }: { ratio: number | null }) {
  if (ratio === null) return <span className="h-[7px] flex-1" aria-hidden="true" />;
  return (
    <span
      className="bg-muted relative block h-[7px] flex-1 overflow-hidden rounded-[2px]"
      aria-hidden="true"
    >
      <span
        className="bg-primary absolute inset-y-0 left-0"
        style={{ width: `${ratio * 100}%` }}
      />
      {/* 1メモリ＝10時間・10%（上限100）。 */}
      <span
        className="absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(90deg, transparent 0 calc(10% - 2px), var(--background) calc(10% - 2px) 10%)",
        }}
      />
    </span>
  );
}
