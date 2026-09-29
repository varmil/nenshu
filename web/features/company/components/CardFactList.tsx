import type { CardFact } from "../lib/cardFacts";

/**
 * 平均年収カードの1段（C14・#818）。
 *
 * **2段とも2列の器に入れる。** 2段とも2項目なので、同じ器にすれば従業員数と全体順位の
 * 左端がそろい、2つの段が1つの表に見える。C14 では2段目に偏差値があって3列だった
 * （#831 で外した）。**太字にしない**——カードの中で太いのは金額だけにする。
 *
 * **ラベルも値も1行に収める**（`whitespace-nowrap`）。3列だった頃は1つあたり 93px（1280px）しか
 * 無く、既定のままだと「38位 /1,867社」と「従業員数（単体）」が2行に折れていた（C3 の公開後に
 * 報告あり）。2列で 143px になり余裕ができたが、指定は残す。
 */
export function CardFactList({ facts }: { facts: CardFact[] }) {
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
