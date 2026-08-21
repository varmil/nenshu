import { existsSync, readFileSync } from "node:fs";
import { Fetcher, mapLimit } from "./fetcher";
import { toOrigin } from "./candidates";

/** トークンはリポジトリに入れない。既存の .edinet_key・.estat_key と同じ形。 */
export function readToken(keyPath: string): string | null {
  if (process.env.GBIZ_API_TOKEN) return process.env.GBIZ_API_TOKEN.trim();
  if (!existsSync(keyPath)) return null;
  const token = readFileSync(keyPath, "utf-8").trim();
  return token || null;
}

/**
 * 法人番号から company_url を引く。深いパスで返ることがあるのでオリジンに寄せる。
 * トークンが無ければ空の結果を返す（その工程だけ飛ばして動く）。
 */
export async function lookupUrls(
  fetcher: Fetcher,
  token: string | null,
  houjinNumbers: readonly string[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!token) return out;
  const results = await mapLimit(
    houjinNumbers,
    3,
    async (cn) => {
      const url = `https://info.gbiz.go.jp/hojin/v1/hojin/${cn}`;
      const res = await fetchWithToken(fetcher, url, token);
      if (!res) return null;
      const raw = res?.[0]?.company_url;
      const origin = typeof raw === "string" ? toOrigin(raw) : null;
      return origin ? ([cn, origin] as const) : null;
    },
    onProgress
  );
  for (const r of results) if (r) out.set(r[0], r[1]);
  return out;
}

type HojinInfo = { company_url?: unknown };

async function fetchWithToken(
  fetcher: Fetcher,
  url: string,
  token: string
): Promise<HojinInfo[] | null> {
  // トークンをキャッシュキーに含めないため、ヘッダ付きの取得はここで直接行う
  try {
    const r = await fetch(url, {
      headers: { "X-hojinInfo-api-token": token, Accept: "application/json" },
      signal: AbortSignal.timeout(25000),
    });
    if (r.status !== 200) return null;
    const json = (await r.json()) as { "hojin-infos"?: HojinInfo[] };
    return json["hojin-infos"] ?? null;
  } catch {
    return null;
  }
}
