import type { ReactNode } from "react";

/**
 * ラベルと説明文を持つ操作の帯（U13、アートボード 5a / 5b）。
 *
 * 表示基準スイッチと年齢スイッチは、単体で置くと「何を選ぶ列なのか」が読み取れない
 * ——U12 ではトグルだけが地に浮いていて、実測値と年齢そろえが**並び替えの選択肢**に
 * 見えていた。ラベル（何の列か）とヒント（いま何が起きているか）を同じ帯に入れる。
 *
 * `tone` は帯の地。`solid` は muted の塗りで「いま効いている」、`dashed` は破線＋
 * 減光で「いまは使えない」を表す。**無効なほうを消さずに減光で残す**のが AC-11 の
 * 要求なので、無効の見た目をここに持たせている。
 */
export function ControlBand({
  label,
  hint,
  tone = "solid",
  children,
}: {
  label: string;
  hint?: ReactNode;
  tone?: "solid" | "dashed";
  children: ReactNode;
}) {
  const base = "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3.5 py-3";
  const skin =
    tone === "solid"
      ? "bg-muted"
      : "border-border border border-dashed opacity-60 py-2.5";

  return (
    <div className={`${base} ${skin}`}>
      {/*
        `aria-hidden`。中のスイッチは `aria-label` で自分が何かを名乗っており、
        この見出しを読み上げに載せると同じ語を二度言うことになる。
      */}
      <span aria-hidden="true" className="shrink-0 text-xs font-bold">
        {label}
      </span>
      {children}
      {hint !== undefined && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
  );
}
