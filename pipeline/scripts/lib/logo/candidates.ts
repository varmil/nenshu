export type LogoSource = "commons" | "jsonld" | "header" | "icon";

export type Candidate = {
  source: LogoSource;
  url: string;
  /** 宣言されたサイズ（`sizes` 属性・manifest の `sizes`）。実寸ではない */
  declared?: { w: number; h: number };
};

/**
 * 会社ごとに「この候補を使う」と決めた指定。**優先順（`sortCandidates`）より先に置く。**
 *
 * **`image.ts` の判定では選び直せないものだけを置く。** あちらが落とすのは画像として
 * 壊れているものと、明るい器で消えるものの2つで、**「絵としては正しいが、この器に置く
 * ロゴとしては不適当」はどちらにも当たらない**。余白の割合で機械的に落とす線も引けなかった
 * ——実測で、配っている 2,509枚のうち「インクの外接矩形が画像の半分未満」は52枚あり、
 * その大半は薄い色のワードマークを持つ正しいロゴだった。
 *
 * **指定として持つのは、次の全周でも同じ結論を再現するため。** `web/public/logos/` の
 * 画像を手で置き換えると、取り直した瞬間に元へ戻る。
 */
const PINNED: Record<string, Candidate> = {
  // 豊田通商（8015）。Wikidata の公式サイト（P856）が**英語版**を指しているので、
  // 候補が英語版のページから集まる。そこの JSON-LD の `Organization.logo` は
  // 1200×630 の共有用の絵で、ロゴは上端の帯にしか無く残りはグラデーションの余白
  // （`sharp` の `trim` は単色の縁しか落とせないため、器の中でロゴが上に寄って小さく出る）。
  // 英語版ヘッダの `TOYOTA TSUSHO CORPORATION` は 3828×192＝19.9:1 で、
  // 88×50 の器に入れると読めない。**日本語版ヘッダの 680×107 を指す。**
  "8015": { source: "header", url: "https://www.toyota-tsusho.com/app-files/img/cmn_logo01.svg" },
};

/** 指定がある会社では、その候補を先頭に置く（同じURLが候補にあれば1つに畳む）。 */
export function prioritize(id: string, candidates: readonly Candidate[]): Candidate[] {
  const pin = PINNED[id];
  if (!pin) return [...candidates];
  return [pin, ...candidates.filter((c) => c.url !== pin.url)];
}

/** 指定そのもの（テストが形を検める）。 */
export const pinnedCandidates: Readonly<Record<string, Candidate>> = PINNED;

const ORDER: Record<LogoSource, number> = { commons: 0, jsonld: 1, header: 2, icon: 3 };

/**
 * 出典の確からしさを解像度より優先する。
 * 同じ出典の中でだけ、宣言サイズの大きいものを先に試す。
 */
export function sortCandidates(candidates: readonly Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return [...candidates]
    .filter((c) => {
      if (seen.has(c.url)) return false;
      seen.add(c.url);
      return true;
    })
    .sort((a, b) => {
      if (ORDER[a.source] !== ORDER[b.source]) return ORDER[a.source] - ORDER[b.source];
      return area(b) - area(a);
    });
}

function area(c: Candidate): number {
  return c.declared ? c.declared.w * c.declared.h : 0;
}

/** `sizes="180x180 32x32"` から最大のものを読む。 */
export function parseSizes(sizes: string | undefined): { w: number; h: number } | undefined {
  if (!sizes) return undefined;
  let best: { w: number; h: number } | undefined;
  for (const token of sizes.trim().split(/\s+/)) {
    const m = /^(\d+)[xX](\d+)$/.exec(token);
    if (!m) continue;
    const size = { w: Number(m[1]), h: Number(m[2]) };
    if (!best || size.w * size.h > best.w * best.h) best = size;
  }
  return best;
}

/** gBizINFO は採用ページ等の深いURLを返すことがあるので、オリジンに寄せる。 */
export function toOrigin(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}/`;
  } catch {
    return null;
  }
}
