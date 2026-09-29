/**
 * 年収バー（spec.md 1.11）。
 *
 * **基準はそのページの1位**で、`max` として渡ってくる（`rank.ts` の `pageMaxSalary`）。
 * 上限を固定額に置かないので、ページ・フィルタ・並び替え・表示基準が変わるたびに
 * 縮尺が変わる。下位ページでも棒が潰れないことを優先した結果である。
 *
 * 数字は隣のセルに出ているので、この要素は装飾として `aria-hidden` にする。
 * 読み上げに同じ金額を二度言わせない。
 */

/**
 * 器の高さ。**モバイルの行だけ半分の3pxにする**（Issue #119）。PC の表では金額の
 * セルが1列を占めるので6pxが釣り合うが、モバイルの行では金額ブロックが88pxしかなく、
 * **同じ6pxだとバーのほうが金額より強く目に入る**（運営者の指摘）。行の中の強弱は
 * 社名 ＞ 金額 ＞ 順位 で、バーは金額に添える補助なので、そこには割り込ませない。
 */
const HEIGHT = { default: "h-1.5", row: "h-[3px]" } as const;

/**
 * 全体平均の縦線は**棒の上下にはみ出させる**。以前は棒の器の中（`overflow-hidden`）に
 * `--foreground` の40%で引いていたので、高さは棒と同じ6px（モバイルは3px）しかなく、
 * 平均を上回る会社——上位のページではほぼ全行——では塗りの上に重なって、ライトでは
 * ほとんど見えなかった（運営者の指摘）。はみ出したぶんは行の地に載るので、塗りの色に
 * よらず見える。色は不透明の `--foreground`。
 *
 * はみ出しは上下とも3pxで、PC とモバイルで同じ。モバイルの行は金額との間が4px
 * （`gap-1`）なので、それより伸ばすと金額の字に触れる。
 */
const MEAN_TICK = "-inset-y-[3px] w-0.5";

export function SalaryBar({
  value,
  max,
  mean,
  size = "default",
}: {
  value: number;
  max: number;
  /** 母集団の平均（円）。細い縦線で示す。 */
  mean: number | null;
  /** `row` はモバイルのランキング行（`CompanyLogo` の `size` と同じ語彙）。 */
  size?: keyof typeof HEIGHT;
}) {
  if (max <= 0) return null;
  // 小数第1位まで。`65.32109865321099%` のような値がそのままHTMLに載ると、
  // 1ページ200本ぶんで数KBになる（画面上の差は出ない）。
  const percent = (n: number) => Number(((n / max) * 100).toFixed(1));
  const width = Math.max(0, Math.min(100, percent(value)));
  // 全体平均がそのページの最大を超えるときは線を引かない。枠の外に描かない。
  const meanLeft = mean !== null && mean <= max ? percent(mean) : null;

  // 縦線を器の外へはみ出させるので、角を丸めて切り抜く `overflow-hidden` は内側の
  // 器（下敷き）にだけ掛ける。
  return (
    <div aria-hidden="true" className={`relative w-full ${HEIGHT[size]}`}>
      <div className="bg-muted h-full w-full overflow-hidden rounded-full">
        <div className="bg-primary h-full rounded-full" style={{ width: `${width}%` }} />
      </div>
      {meanLeft !== null && (
        <span
          data-mean-line
          className={`bg-foreground absolute -translate-x-1/2 rounded-full ${MEAN_TICK}`}
          style={{ left: `${meanLeft}%` }}
        />
      )}
    </div>
  );
}
