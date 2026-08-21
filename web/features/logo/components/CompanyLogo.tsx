import { initialOf } from "../lib/initial";
import { useHasLogo } from "./LogoIdsProvider";

export type LogoSize = "sm" | "default" | "lg";

/**
 * 器の寸法。**高さはモックのまま（ランキング40px・企業詳細62px）で、幅だけ広げる。**
 * 実データの縦横比は中央値3.69で、正方形付近は1,636社中230社しかない（ADR-0008
 * 決定4）。40px角に3.69:1のワードマークを入れると高さ11pxの帯になる。
 *
 * 幅は場所ごとに変えてよい（spec 2.2）。変えないのは**収め方**——`object-contain`
 * で収め、拡大しない——のほうである。
 */
const BOX: Record<LogoSize, string> = {
  // 近傍5社（316pxの列）とモバイルの行。ここだけは幅を詰める
  sm: "h-9.5 w-12",
  // ランキングの表。モバイルは sm 相当に落とす
  default: "h-9.5 w-12 md:h-10 md:w-22",
  // 企業詳細の見出し（アートボード 4b の62px）
  lg: "h-15.5 w-34",
};

const RADIUS: Record<LogoSize, string> = { sm: "rounded-md", default: "rounded-md", lg: "rounded-lg" };

const INITIAL_TEXT: Record<LogoSize, string> = {
  sm: "text-sm",
  default: "text-sm md:text-base",
  lg: "text-2xl",
};

export function CompanyLogo({
  id,
  name,
  size = "default",
  hasLogo,
}: {
  id: string;
  name: string;
  size?: LogoSize;
  /** 省略するとコンテキストから引く（ランキング側）。企業詳細は直接渡す。 */
  hasLogo?: boolean;
}) {
  const fromContext = useHasLogo(id);
  const show = hasLogo ?? fromContext;

  if (!show) {
    return (
      <span
        aria-hidden="true"
        data-logo="initial"
        className={`border-border text-muted-foreground bg-muted flex shrink-0 items-center justify-center border border-dashed font-bold ${BOX[size]} ${RADIUS[size]} ${INITIAL_TEXT[size]}`}
      >
        {initialOf(name)}
      </span>
    );
  }

  return (
    /*
      **地は `--logo-surface` で明るいまま固定する。** ロゴは透明背景で、ダーク
      モードでは濃い色のワードマークが地に沈む（実測で読めなくなる）。色を反転
      させる加工は採らない（ADR-0008 決定1: 商標をそのままの形で出す）ので、
      器の側に明るい面を敷く。トークンの値と理由は tokens.css にある。
    */
    <span
      data-logo="image"
      className={`border-border flex shrink-0 items-center justify-center overflow-hidden border bg-logo-surface p-1 ${BOX[size]} ${RADIUS[size]}`}
    >
      {/*
        **`loading="lazy"`。** 1ページ30社ぶんの画像を初期表示で取りに行かない
        （spec 3.）。`alt` は空——社名は同じ行にテキストとしてあり、ロゴは装飾
        として扱う（spec 2.4）。
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/logos/${id}.webp`}
        alt=""
        loading="lazy"
        decoding="async"
        className="max-h-full max-w-full object-contain"
      />
    </span>
  );
}
