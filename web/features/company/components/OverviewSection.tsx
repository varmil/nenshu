import { RADAR_LIST_ORDER, type RadarAxis } from "../lib/radar";
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

      {/*
        **左は 340px 固定、2カラムは `lg` から**（アートボード 6b の `340px 1fr`）。
        `1fr 1fr` で割ると器の幅が画面ごとに変わり、図の実効サイズと文字の
        大きさが一緒に動く。**`md` では2カラムにできない**——この画面は
        768px でサイドバーが出るので本文が 396px しかない（実測。652px になるのは
        1024px から）。
      */}
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-center lg:gap-4">
        <OverviewRadar axes={axes} />

        {/* 図の外にも値を出す（AC-9）。PC だけ——モバイルは図のラベルが持つ。 */}
        <dl className="hidden flex-col lg:flex">
          {RADAR_LIST_ORDER.map((key) => {
            const axis = axes.find((a) => a.key === key);
            if (axis === undefined) return null;
            return <OverviewAxisRow key={key} axis={axis} />;
          })}
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

/*
 * 1軸ぶんの行（アートボード 6b）。**縦を2本そろえる**（Issue #191）。
 *
 * - 値は固定幅で**右寄せ**（`min-w-[4.75rem]`＝76px）——桁数が違っても右端が動かない
 * - 順位も固定幅で**右寄せ**（`w-[5.75rem]`＝92px。運営者の指示。当初は左寄せだった）
 *   ——`1,867社中1位` と `895社中883位` で桁が違っても右端が動かない
 *
 * 掲載なしの軸も**同じ幅の空きを残す**。詰めると、その行だけ値の右端が
 * 右へ寄って列が折れる。
 *
 * **固定幅は最長の文字列より実測で1割以上広く取る。** 右寄せの文字が器を
 * 超えると**左へはみ出して隣のラベルを押す**ので、`text-align` では気づけない。
 * 84px にしていたときは `1,867社中1,468位`（実測83px）が1pxしか余らず、
 * フォントの違う環境で崩れた。右カラム296pxの内訳は
 * ラベル104 ＋ 8 ＋ 値76 ＋ 8 ＋ 順位92 ＝ 288px で、8pxが余白として残る。
 */
function OverviewAxisRow({ axis }: { axis: RadarAxis }) {
  const missing = axis.position === null;
  return (
    <div className="border-border flex items-baseline justify-between gap-2 border-b py-[7px] last:border-b-0">
      <dt className={`text-[13px] ${missing ? "text-muted-foreground" : ""}`}>
        {axis.label}
        {axis.subLabel !== "" && (
          // 稼ぐ力の注記だけは長いので**下に折る**（アートボード 6b）。
          <span
            className={`text-muted-foreground text-[0.7rem] ${
              axis.key === "profit" ? "mt-0.5 block whitespace-nowrap" : "ml-1.5"
            }`}
          >
            {axis.subLabel}
          </span>
        )}
      </dt>
      <dd className="shrink-0 text-right text-[13px] whitespace-nowrap">
        <span
          className={`inline-block min-w-[4.75rem] text-right ${
            missing ? "text-muted-foreground" : "font-semibold tabular-nums"
          }`}
        >
          {axis.valueText}
        </span>
        {/*
          **「上位◯%」は採らない。** アートボード 6b はそう書いているが、
          `上位82%` は上から82%の位置という意味で、日本語としては
          上位＝良いに読める。**順位で読ませる**——偏差値の隣の「上位◯%」を
          2026-08-20 に外したのと同じ線（CLAUDE.md）。
        */}
        <span className="text-muted-foreground ml-2 inline-block w-[5.75rem] text-right text-[0.65rem] tabular-nums">
          {axis.rankText}
        </span>
        {axis.note !== "" && (
          <span className="text-muted-foreground mt-0.5 block text-[0.7rem] font-normal">
            {axis.note}
          </span>
        )}
      </dd>
    </div>
  );
}
