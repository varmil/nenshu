import { Fetcher, sleep } from "./fetcher";

export type CommonsInfo = {
  title: string;
  fileUrl: string;
  descriptionUrl: string;
  w: number;
  h: number;
  license: string;
  author: string;
  /** パブリックドメイン以外は帰属表示の対象にする */
  needsAttribution: boolean;
};

const API = "https://commons.wikimedia.org/w/api.php";
const BATCH = 25;

/** P154 の値（Special:FilePath 形式のURL）から File: タイトルを作る。 */
export function titleFromP154(url: string): string | null {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    if (!name) return null;
    return "File:" + name.replace(/_/g, " ");
  } catch {
    return null;
  }
}

export async function fetchInfo(
  fetcher: Fetcher,
  titles: readonly string[]
): Promise<Map<string, CommonsInfo>> {
  const out = new Map<string, CommonsInfo>();
  for (let i = 0; i < titles.length; i += BATCH) {
    const batch = titles.slice(i, i + BATCH);
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "imageinfo",
      iiprop: "size|url|extmetadata",
      titles: batch.join("|"),
    });
    const res = await fetcher.get(`${API}?${params}`, { timeoutMs: 60000 });
    if (res.status !== 200) continue;
    const json = JSON.parse(res.body.toString("utf-8"));
    const pages = json?.query?.pages ?? {};
    for (const page of Object.values(pages) as Record<string, unknown>[]) {
      const info = (page.imageinfo as Record<string, unknown>[] | undefined)?.[0];
      if (!info) continue;
      const ext = (info.extmetadata ?? {}) as Record<string, { value?: string }>;
      const license = strip(ext.LicenseShortName?.value ?? "");
      out.set(String(page.title), {
        title: String(page.title),
        fileUrl: String(info.url ?? ""),
        descriptionUrl: String(info.descriptionurl ?? ""),
        w: Number(info.width ?? 0),
        h: Number(info.height ?? 0),
        license,
        author: strip(ext.Artist?.value ?? ""),
        needsAttribution: !/^(public domain|pd|cc0)/i.test(license),
      });
    }
    await sleep(300);
  }
  return out;
}

function strip(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
