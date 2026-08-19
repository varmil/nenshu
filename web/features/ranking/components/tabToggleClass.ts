/*
 * 選択中のタブ（年齢スイッチ・フィルタ）を Primary で塗りつぶすためのクラス。
 *
 * shadcn プリミティブの既定は `data-[state=on]:bg-muted` で、ごく薄いグレーのため
 * 選択中がひと目で分からなかった。`design-system/ui/` は CLI が生成するものを手で
 * 盛らない約束（design-system.md）なので、プリミティブ側は触らず呼び出し側で上書きする。
 * `ToggleGroupItem` の `className` は tailwind-merge で最後に適用されるため、
 * 同じバリアント接頭辞の `bg-*` はここでの指定が勝つ。
 *
 * `hover:` を別に持つのは、プリミティブが未選択向けに `hover:bg-muted` を持っており、
 * 選択中のタブにマウスを乗せた瞬間だけグレーに戻ってしまうため。
 * `aria-pressed:` と `data-[state=on]:` の両方を書くのは、プリミティブが両方に
 * 同じ既定を当てているのに合わせている。
 */
export const TAB_TOGGLE_SELECTED_CLASS = [
  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
  "data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground",
  "aria-pressed:bg-primary aria-pressed:text-primary-foreground",
  "aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground",
].join(" ");
