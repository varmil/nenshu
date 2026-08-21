import { Fetcher, sleep } from "./fetcher";

export type WikidataHit = { qid: string; logo?: string; site?: string };

const ENDPOINT = "https://query.wikidata.org/sparql";
const BATCH = 300;

/** 法人番号（P3225）から 項目・ロゴ（P154）・公式サイト（P856）を引く。 */
export async function lookupByHoujin(
  fetcher: Fetcher,
  houjinNumbers: readonly string[]
): Promise<Map<string, WikidataHit>> {
  const out = new Map<string, WikidataHit>();
  for (let i = 0; i < houjinNumbers.length; i += BATCH) {
    const batch = houjinNumbers.slice(i, i + BATCH);
    const values = batch.map((n) => `"${n}"`).join(" ");
    const query = `SELECT ?cn ?i ?logo ?site WHERE { VALUES ?cn { ${values} } ?i wdt:P3225 ?cn . OPTIONAL { ?i wdt:P154 ?logo } OPTIONAL { ?i wdt:P856 ?site } }`;
    const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
    const res = await fetcher.get(url, { timeoutMs: 90000 });
    if (res.status !== 200) {
      throw new Error(`Wikidata が ${res.status} を返しました（${i} 件目から）`);
    }
    const json = JSON.parse(res.body.toString("utf-8"));
    for (const b of json.results.bindings as Record<string, { value: string }>[]) {
      const cn = b.cn.value;
      const hit: WikidataHit = out.get(cn) ?? { qid: b.i.value.split("/").pop() ?? "" };
      if (b.logo) hit.logo = b.logo.value;
      if (b.site) hit.site = b.site.value;
      out.set(cn, hit);
    }
    await sleep(1000);
  }
  return out;
}
