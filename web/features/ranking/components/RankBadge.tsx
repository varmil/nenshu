/**
 * 順位のバッジ（アートボード 3e・4d）。ロゴの左上に半分はみ出させて置く
 * ホームベース型（下向きの頂点を持つ5角形）。
 *
 * **順位カラムを廃止したのは、桁数で幅が変わるものに固定幅を与えていたため。**
 * 20px 弱のレーンに 1,866 のような4桁が入ると数字がレーンからあふれ、右隣の
 * ロゴ画像に重なっていた。バッジは `min-width` を下限に**数字ぶん右へ伸びる**
 * ので、1桁でも4桁でも左端・上端の位置が動かない（伸びる先はロゴの上だが、
 * 器のさらに内側にある画像には届かない）。
 *
 * **絶対配置のオフセットもここに持つ。** 呼び出し側は器を `relative` にするだけ。
 * 位置はサイズと対で決まる（sm は器に6px、md も6px だけ被る）ので、離して
 * 書くと片方だけ直したときに被り幅が変わってしまう。
 */

export type RankBadgeSize = "sm" | "md";

/** モバイル（sm）と PC（md）。**記号は同じで寸法だけを変える。** */
const SIZE: Record<RankBadgeSize, string> = {
  sm: "-left-3.5 -top-1 h-[21px] min-w-[22px] px-[3px] pt-[3px] text-[10.5px]",
  md: "-left-[19px] -top-[5px] h-6 min-w-[25px] px-1 pt-[3px] text-[12px]",
};

/*
 * 下辺の中央だけを下げた5角形。`clip-path` は Tailwind の任意値でも書けるが、
 * 座標にカンマを含むので `clip-path-[...]` にすると読めなくなる。
 */
const HOME_PLATE = "polygon(0 0, 100% 0, 100% 68%, 50% 100%, 0 68%)";

export function RankBadge({ rank, size }: { rank: number; size: RankBadgeSize }) {
  return (
    <span
      data-rank-badge=""
      style={{ clipPath: HOME_PLATE }}
      className={`bg-rank-badge text-rank-badge-foreground absolute box-border inline-flex items-start justify-center leading-none font-bold tabular-nums tracking-[-.03em] ${SIZE[size]}`}
    >
      {rank}
      {/*
        列見出しが「順位・会社名」になり、数字だけでは何の数かが音声で分からない。
        字面はモックのまま数字だけにして、読み上げにだけ「位」を足す。
      */}
      <span className="sr-only">位</span>
    </span>
  );
}
