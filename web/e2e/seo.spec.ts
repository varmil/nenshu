import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./appTest";
import { formatInt } from "../features/ranking/lib/format";
import { PAGE_SIZE } from "../features/ranking/types";
import { fiscalPeriodLabel } from "../lib/data/period";
import { companies, pickCompanies, unranked } from "../testing/realData";

/**
 * U8（Issue #53）。ADR-0006 のインデックス戦略が、実際に返るHTMLと
 * `/sitemap.xml`・`/robots.txt` の中身として出ていることを固定する。
 *
 * **単体テスト（`lib/seo/ranking.test.ts`）では足りない。** あちらが固定するのは
 * 「どのURLへ寄せるか」という判断で、組み合わせの網羅もそちらに任せる。ここで見るのは
 * それが `<link rel="canonical">` として実際に初期HTMLに入るか、`absoluteUrl()` が効いて
 * 絶対URLになるか——`src/components/PageHead.astro` を通らないと分からないこと。
 */

const ORIGIN = "https://openreport.net";
const BANK = "%E9%8A%80%E8%A1%8C%E6%A5%AD";

/** 業種の絞り込みが無いランキングの最終ページ。社数はデータから数える。 */
const LAST_PAGE = Math.ceil(companies.rows.length / PAGE_SIZE);
/** 手で叩いた範囲外のページ。 */
const OUT_OF_RANGE_PAGE = LAST_PAGE + 1;

/** JS を実行する前の HTML の head。クローラが読むのはこれだけ。 */
async function headOf(request: APIRequestContext, path: string) {
  const response = await request.get(path);
  expect(response.status(), path).toBe(200);
  const html = await response.text();
  // 属性値なので `&` は `&amp;` としてHTMLに出る。実URLに戻してから比べる。
  const pick = (pattern: RegExp) => html.match(pattern)?.[1].replaceAll("&amp;", "&") ?? null;
  return {
    title: pick(/<title>([^<]*)<\/title>/),
    description: pick(/<meta name="description" content="([^"]*)"/),
    canonical: pick(/<link rel="canonical" href="([^"]*)"/),
  };
}

test.describe("検索エンジン向け導線（U8）", () => {
  /*
    インデックスさせる側（自己canonical）と寄せる側を、描き方の違うページ（ランキング・
    計算方法・企業詳細）から1つずつ。`&` を含む canonical（`?ind=X&page=2`）は、HTML の
    属性としてエスケープされたうえで正しいURLに戻ることも見ている。
  */
  test("canonical が初期HTMLに絶対URLで出る", async ({ request }) => {
    // `?ind=銀行業&page=2` を自己canonical と見るのは、銀行業が2ページ以上あるとき。
    // 満たさなくなったら、ここで落ちて知らせる。
    pickCompanies(
      "銀行業の会社",
      (row) => companies.industries[row[2]] === "銀行業",
      PAGE_SIZE + 1
    );
    const cases: [path: string, canonical: string][] = [
      // インデックスさせる側は自己canonical。ルートだけ末尾のスラッシュを落とす。
      ["/", ORIGIN],
      [`/?ind=${BANK}`, `${ORIGIN}/?ind=${BANK}`],
      ["/about", `${ORIGIN}/about`],
      ["/company/6861", `${ORIGIN}/company/6861`],
      // ページ2以降も自己canonical。`/?page=2` は `/` の複製ではなく別の30社が並ぶので、
      // 先頭へ寄せると他の会社への内部リンク経路（ページ2以降の中にしか無い）を細める。
      ["/?page=2", `${ORIGIN}/?page=2`],
      [`/?ind=${BANK}&page=2`, `${ORIGIN}/?ind=${BANK}&page=2`],
      // `?age=N` は年齢を取り除いて寄る（2026-10-03・ADR-0006 の追記）。`?age=N&ind=X` は業種側、
      // `?age=N&page=M` は `/?page=M` へ。
      ["/?age=35", ORIGIN],
      [`/?age=35&ind=${BANK}`, `${ORIGIN}/?ind=${BANK}`],
      ["/?age=35&page=2", `${ORIGIN}/?page=2`],
      // インデックスさせない絞り込みと、総ページ数を超えたページは `/` へ寄る。
      ["/?emp=1000-", ORIGIN],
      [`/?page=${OUT_OF_RANGE_PAGE}`, ORIGIN],
      // 企業ページは表示基準に関わらず素のURLへ（R1 で `?age=` は読まなくなった）。
      ["/company/6861?age=35", `${ORIGIN}/company/6861`],
    ];
    for (const [path, canonical] of cases) {
      expect((await headOf(request, path)).canonical, path).toBe(canonical);
    }
  });

  test("sitemap.xml に `/`・`/about`・業種・全社の URL が載り、canonical と同じ文字列になっている", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    const xml = await response.text();

    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    // `/` と `/about`、会社のいる業種ごとに1件、企業ページが全社ぶん（ADR-0006）。
    // 年齢（`/?age=N`）は載せない（2026-10-03・ADR-0006 の追記）。
    // 企業ページには、母集団から外れた会社（最後の有報から24か月）のぶんも入る（refresh の D9）。
    const industriesWithCompanies = new Set(companies.rows.map((row) => row[2])).size;
    expect(locs).toHaveLength(
      2 + industriesWithCompanies + companies.rows.length + unranked.rows.length
    );
    // 重複が無いこと。canonical と sitemap が食い違うと sitemap 全体の信頼が下がる。
    expect(new Set(locs).size).toBe(locs.length);

    // **各ページが申告する canonical と1文字も違わない。** 別々に組み立てると、載せる
    // URLと canonical が1文字ずれても気づけない（両者は `agePath()`・`industryPath()` を
    // 共有している）。
    for (const path of ["/", "/about", `/?ind=${BANK}`, "/company/6861"]) {
      const { canonical } = await headOf(request, path);
      expect(locs, path).toContain(canonical);
    }

    // 寄せる側のURLは1つも載せない。
    expect(locs.some((loc) => loc.includes("emp="))).toBe(false);
    expect(locs.some((loc) => loc.includes("page="))).toBe(false);
    // 年齢は `/?age=N` も組み合わせ（`?age=N&ind=X`）も企業ページ（`/company/[id]?age=N`）も
    // 1つも載せない。`/?age=N` の canonical は `/` へ寄せてある（上のテスト）。
    expect(locs.some((loc) => loc.includes("age="))).toBe(false);
  });

  test("robots.txt はクロールを止めず、sitemap の在り処だけ示す", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const text = await response.text();

    expect(text).toContain("User-Agent: *");
    expect(text).toContain("Allow: /");
    expect(text).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    // 絞り込みURLを Disallow にすると canonical が読まれなくなる（ADR-0006）。
    expect(text).not.toContain("Disallow");
  });

  /*
    文言の組み立ては `lib/seo/ranking.test.ts`・`lib/seo/about.test.ts`・
    `lib/seo/company.test.ts` が見る。ここで見るのは、実データで組んだ title と
    description が初期HTMLに入ること。

    **`/` の title はブランド先頭のまま**、有価証券報告書・社数・決算期を含む。決算期は
    末尾（S3・`docs/site-chrome/spec.md` 5.）——前に置くと、差別化要因の「有価証券報告書」が
    SERPで見える位置から押し出される。**「有価証券報告書」は全ページの description に入れる。**
  */
  test("title と description が初期HTMLに出て、有価証券報告書が全ページの description に入る", async ({
    request,
  }) => {
    // `/` の社数と決算期の幅はデータから引く。
    const rootTitle = `OpenReport | 有価証券報告書ベースの平均年収ランキング ${formatInt(companies.rows.length)}社【${fiscalPeriodLabel(companies.meta)}】`;
    const titles: [path: string, title: string | null][] = [
      ["/", rootTitle],
      // `?age=N` は canonical が `/` なので、title も寄せ先 `/` のもの（専用の title は無い）。
      ["/?age=35", rootTitle],
      [`/?ind=${BANK}`, "銀行業の平均年収ランキング | OpenReport"],
      // 文言は単体テストが持つので、ここでは出ていることだけ見る。
      ["/about", null],
      ["/company/6861", null],
    ];
    for (const [path, title] of titles) {
      const head = await headOf(request, path);
      if (title === null) expect(head.title, path).toBeTruthy();
      else expect(head.title, path).toBe(title);
      expect(head.description, path).toContain("有価証券報告書");
    }
  });

  test("ページ送りが範囲外のURLへリンクしない（無限のクロール空間を作らない）", async ({
    request,
  }) => {
    // `aria-disabled` と `pointer-events-none` はクローラに効かない。href が
    // 出ていないことで防ぐ。
    const pageLinks = async (path: string) => {
      const html = await (await request.get(path)).text();
      return [...html.matchAll(/href="\?[^"]*page=(\d+)"/g)].map((m) => Number(m[1]));
    };

    for (const page of await pageLinks("/")) {
      expect(page, "/").toBeGreaterThanOrEqual(1);
      expect(page, "/").toBeLessThanOrEqual(LAST_PAGE);
    }
    for (const page of await pageLinks(`/?page=${LAST_PAGE}`)) {
      expect(page, `/?page=${LAST_PAGE}`).toBeLessThanOrEqual(LAST_PAGE);
    }
    // 手で叩いた範囲外のURLからも、範囲外へは繋がない。
    for (const page of await pageLinks(`/?page=${OUT_OF_RANGE_PAGE}`)) {
      expect(page, `/?page=${OUT_OF_RANGE_PAGE}`).toBeLessThanOrEqual(LAST_PAGE);
    }
  });

  test("ページごとに別の企業が並び、企業ページへの内部リンクになっている", async ({ request }) => {
    const companyIds = async (path: string) => {
      const html = await (await request.get(path)).text();
      return new Set([...html.matchAll(/href="\/company\/([^"]+)"/g)].map((m) => m[1]));
    };

    const first = await companyIds("/");
    const second = await companyIds("/?page=2");
    expect(first.size).toBe(30);
    expect(second.size).toBe(30);
    // 1社も重ならない。だからページ2は `/` の複製ではない。
    expect([...second].filter((id) => first.has(id))).toHaveLength(0);
  });
});
