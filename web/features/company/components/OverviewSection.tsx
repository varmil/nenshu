import type { RadarAxis } from "../lib/radar";
import { OverviewRadar } from "./OverviewRadar";

/**
 * 「公開資料による全体像」の節（P1・Issue #167・アートボード 6a / 6b / 6d）。
 *
 * **ページの先頭に置く。** 5軸を1枚にまとめた図なので、下の節（金額・働きやすさ・
 * 年齢別・推移）の要約として最初に来る。
 *
 * **PC は図の右に指標リスト、モバイルは図だけ**（アートボード 6b / 6a）。
 * モバイルで値が読めなくなるわけではない——**軸ラベルに値が入っている**ので、
 * 図の中のテキストとして DOM に出る（AC-9）。
 */
export function OverviewSection({ axes }: { axes: RadarAxis[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">公開資料による全体像</h2>
      {/*
        **各軸の母集団が違うことを最初に断る。** 有給と残業はデータベースに
        登録している会社だけの中での位置で、1,867社の中での位置ではない。
      */}
      <p className="text-muted-foreground text-xs">
        各軸は、その指標を公表している会社の中での相対位置（外側ほど上位）を示します。
      </p>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-6">
        <OverviewRadar axes={axes} />

        {/* 図の外にも値を出す（AC-9）。PC だけ——モバイルは図のラベルが持つ。 */}
        <dl className="hidden flex-col gap-1.5 md:flex">
          {axes.map((axis) => (
            <div
              key={axis.key}
              className="border-border flex flex-wrap items-baseline justify-between gap-x-2 border-b pb-1.5 last:border-b-0"
            >
              <dt className="text-sm">{axis.label}</dt>
              <dd className="flex items-baseline gap-2">
                <span
                  className={
                    axis.position === null
                      ? "text-muted-foreground text-sm"
                      : "text-sm font-semibold tabular-nums"
                  }
                >
                  {axis.valueText}
                </span>
                {/*
                  **「上位◯%」は採らない。** アートボード 6b はそう書いているが、
                  `上位82%` は上から82%の位置という意味で、日本語としては
                  上位＝良いに読める。**順位で読ませる**——偏差値の隣の「上位◯%」を
                  2026-08-20 に外したのと同じ線（CLAUDE.md）。
                */}
                {axis.rankText !== "" && (
                  <span className="text-muted-foreground text-[0.7rem] tabular-nums">
                    {axis.rankText}
                  </span>
                )}
              </dd>
              {axis.note !== "" && (
                <p className="text-muted-foreground w-full text-[0.7rem]">{axis.note}</p>
              )}
            </div>
          ))}
        </dl>
      </div>

      <p className="text-muted-foreground text-xs leading-relaxed">
        {/*
          **稼ぐ力は分母の範囲が年収と違う。** 年収は提出会社（単体）、稼ぐ力は
          グループ全体（連結）で、臨時雇用人員は従業員数に入らない（spec 2.4）。
          **欠測軸の描き方もここで断る**——図を見ただけでは「頂点が無い」ことに
          気づけない読者がいる。
        */}
        稼ぐ力は、連結の経常利益（直近5期の中央値）を連結の従業員数で割った額です。パート・アルバイトは従業員数に含まれません。公表の無い指標は頂点を打たず、残りの点で閉じています。
      </p>
    </section>
  );
}
