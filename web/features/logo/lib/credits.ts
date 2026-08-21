import type { CompanyRow } from "@/features/ranking/types";

export type LogoEntry = {
  w: number;
  h: number;
  src: string;
  from: string;
  lic?: string;
  by?: string;
  attr?: boolean;
};

export type LogoCredit = { id: string; name: string; license: string; author: string; from: string };

/**
 * 帰属表示が要るロゴ（`/about` に出す。spec AC-14）。
 *
 * **パブリックドメインのものは出さない。** 帰属を求めていないものまで並べると、
 * 本当に帰属が要る44件が埋もれる。出典そのものは節の本文で示す。
 */
export function attributionCredits(
  rows: readonly CompanyRow[],
  byId: Record<string, LogoEntry>
): LogoCredit[] {
  const nameById = new Map(rows.map((row) => [row[0], row[1]] as const));
  return Object.entries(byId)
    .filter(([, entry]) => entry.attr === true)
    .map(([id, entry]) => ({
      id,
      name: nameById.get(id) ?? id,
      license: entry.lic ?? "",
      author: (entry.by ?? "").trim(),
      from: entry.from,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/** 出典ごとの件数（節の書き出しに使う）。 */
export function creditCounts(byId: Record<string, LogoEntry>) {
  let commons = 0;
  let site = 0;
  for (const entry of Object.values(byId)) {
    if (entry.src === "commons") commons++;
    else site++;
  }
  return { commons, site, total: commons + site };
}
