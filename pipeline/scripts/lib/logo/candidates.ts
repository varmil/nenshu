export type LogoSource = "commons" | "jsonld" | "header" | "icon";

export type Candidate = {
  source: LogoSource;
  url: string;
  /** 宣言されたサイズ（`sizes` 属性・manifest の `sizes`）。実寸ではない */
  declared?: { w: number; h: number };
};

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
