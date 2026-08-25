import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { collectPageRequests } from "./network";

/**
 * U16（Issue #135・親 #130）。**画面の中で状態を切り替えたあとのメタデータ**を固定する。
 *
 * サーバーが返す時点のメタデータは `e2e/seo.spec.ts` が見ている。こちらが見るのは
 * その先で、操作はすべて `history.pushState`（AC-7）なので Next.js のメタデータは
 * 初回描画の1回きりしか出ない。**URL だけが変わってタイトルが取り残される**のが
 * 直そうとしている壊れ方である（`docs/ranking/spec.md` AC-16）。
 *
 * **判定は「同じURLを直接開いたときの値と一致するか」にしてある。** 文言をここに
 * 書き写すと、文言を直すたびにこのテストも直すことになり、そのとき何も守らない。
 * 文言そのものは `lib/seo/ranking.test.ts`・`lib/seo/company.test.ts` が持つ。
 */

interface Meta {
  title: string;
  description: string | null;
  canonical: string | null;
  /** S2（Issue #116）。**canonical と同じ文字列でなければならない**（AC-11）。 */
  ogUrl: string | null;
  /** `<title>` と同じ文字列でなければならない（AC-12）。 */
  ogTitle: string | null;
  ogDescription: string | null;
}

/** 属性値としてHTMLに出ている `&` などを実文字に戻す。 */
function unescapeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

/** JS を実行せずに取った、そのURLのメタデータ（＝サーバーが返したもの）。 */
async function metaFromServer(request: APIRequestContext, url: string): Promise<Meta> {
  const response = await request.get(url);
  expect(response.status()).toBe(200);
  const html = await response.text();
  const pick = (pattern: RegExp) => {
    const match = html.match(pattern);
    return match === null ? null : unescapeHtml(match[1]);
  };
  return {
    title: pick(/<title>([^<]*)<\/title>/) ?? "",
    description: pick(/<meta name="description" content="([^"]*)"/),
    canonical: pick(/<link rel="canonical" href="([^"]*)"/),
    ogUrl: pick(/<meta property="og:url" content="([^"]*)"/),
    ogTitle: pick(/<meta property="og:title" content="([^"]*)"/),
    ogDescription: pick(/<meta property="og:description" content="([^"]*)"/),
  };
}

/** いま画面に出ているメタデータ（＝読者のタブに出ている見出し）。 */
async function metaFromDom(page: Page): Promise<Meta> {
  return page.evaluate(() => {
    const content = (selector: string) =>
      document.head.querySelector(selector)?.getAttribute("content") ?? null;
    return {
      title: document.title,
      description: content('meta[name="description"]'),
      canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
      ogUrl: content('meta[property="og:url"]'),
      ogTitle: content('meta[property="og:title"]'),
      ogDescription: content('meta[property="og:description"]'),
    };
  });
}

/**
 * 操作したあとの画面のメタデータが、いま名乗っているURLを直接開いたときのものと
 * 一致していること。**この Unit の受け入れ基準そのもの**（AC-16）。
 */
async function expectMetaMatchesUrl(page: Page, request: APIRequestContext) {
  const url = new URL(page.url());
  const [dom, server] = await Promise.all([
    metaFromDom(page),
    metaFromServer(request, url.pathname + url.search),
  ]);
  expect(dom).toEqual(server);
  // `og:` は canonical・title・description と同じ文字列（S2・AC-11・AC-12）。
  // **操作のあとも同じ**であること——`usePageMeta` が3つとも書き換えている。
  expect(dom.ogUrl).toBe(dom.canonical);
  expect(dom.ogTitle).toBe(dom.title);
  expect(dom.ogDescription).toBe(dom.description);
  return dom;
}

test.describe("メタデータと表示状態の一致（AC-16）", () => {
  test("表示基準を切り替えるとタイトルが年齢そろえのものになる", async ({ page, request }) => {
    await page.goto("/");
    expect((await metaFromDom(page)).title).toContain("1,867社");

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);

    const meta = await expectMetaMatchesUrl(page, request);
    expect(meta.title).toBe("35歳年収ランキング | OpenReport");
    expect(meta.canonical).toBe("https://openreport.net/?age=35");
  });

  test("年齢を選び直すとタイトルの年齢も変わる", async ({ page, request }) => {
    await page.goto("/?age=35");
    await page.getByRole("button", { name: "40歳", exact: true }).click();
    await expect(page).toHaveURL(/[?&]age=40/);

    const meta = await expectMetaMatchesUrl(page, request);
    expect(meta.title).toContain("40歳");
    expect(meta.description).toContain("40歳");
  });

  test("業種チップを押すとタイトルに業種名が入る", async ({ page, request }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "業種から見る" })
      .getByRole("link", { name: "海運業 7社", exact: true })
      .click();
    await expect(page).toHaveURL(/ind=/);

    const meta = await expectMetaMatchesUrl(page, request);
    expect(meta.title).toContain("海運業");
  });

  test("ページ送りでタイトルにページ番号が入る", async ({ page, request }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "次のページへ" }).click();
    await expect(page).toHaveURL(/[?&]page=2/);

    const meta = await expectMetaMatchesUrl(page, request);
    expect(meta.title).toContain("2ページ目");
  });

  /**
   * `?q=` と `?emp=` は canonical を `/` へ寄せる（ADR-0006）。**寄せた先の文言に
   * 戻る**ことまで含めて、直接開いたときと同じであることを見る。
   */
  test("インデックスさせない絞り込みでは `/` のメタデータに戻る", async ({ page, request }) => {
    await page.goto("/?age=35");
    await page.getByRole("banner").getByRole("searchbox", { name: "会社名で検索" }).fill("商船三井");
    await expect(page).toHaveURL(/q=/);

    const meta = await expectMetaMatchesUrl(page, request);
    expect(meta.canonical).toBe("https://openreport.net");
    expect(meta.title).toContain("1,867社");
  });

  test("メタデータの更新でネットワークリクエストは発生しない（AC-7）", async ({ page }) => {
    await page.goto("/");
    const requests = collectPageRequests(page);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);
    await page.getByRole("button", { name: "25歳" }).click();
    await expect(page).toHaveURL(/[?&]age=25/);

    expect(await page.title()).toContain("25歳");
    expect(requests).toHaveLength(0);
  });
});

test.describe("企業詳細ページのメタデータ（AC-16）", () => {
  /**
   * **表示基準を切り替えてもメタデータは動かない**（R1・ADR-0012）。`?age=` を
   * 無くしたので URL が動かず、1つのURLに対してメタデータは1つしか存在しない。
   * U16 がここで直していた食い違い（親 Issue #130）は起きようが無くなった。
   */
  test("表示基準を切り替えてもタイトルと canonical が変わらない", async ({ page, request }) => {
    await page.goto("/company/6861");
    const raw = await metaFromDom(page);
    expect(raw.title).toContain("有価証券報告書は2,178万円");

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("button", { name: "25歳" }).click();
    await expect(page.getByText("25歳時点の推定年収")).toBeVisible();

    const meta = await expectMetaMatchesUrl(page, request);
    expect(meta).toEqual(raw);
    expect(meta.canonical).toBe("https://openreport.net/company/6861");
  });

  // タイトルに出るのは有報の実測値だけなので、「推定」の語はどの状態でも出ない（AC-9）。
  test("タイトルにも description にも推定の語が出ない（AC-9）", async ({ page }) => {
    await page.goto("/company/6861");
    const meta = await metaFromDom(page);
    expect(meta.title).not.toContain("推定");
    expect(meta.description).not.toContain("推定");

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
    expect((await metaFromDom(page)).title).not.toContain("推定");
  });
});

/**
 * AC-15 と同じ経路。**戻るで復元されるのは状態だけではない。** Next.js は
 * ルーターキャッシュの RSC ツリーをそのまま返すので、メタデータは「そのツリーを
 * 作ったときのURL」のものになりうる。状態が URL を正として直る規則
 * （`lib/history/useLocationSyncedState.ts`）と対になっている。
 */
test.describe("ページを跨いだ戻る/進むの後（AC-15・AC-16）", () => {
  test("戻ったあとのタイトルが復元された状態のものになる", async ({ page, request }) => {
    await page.goto("/?age=40");
    await page.getByRole("table").getByRole("link").first().click();
    await expect(page).toHaveURL(/\/company\//);

    await page.goBack();
    await expect(page).toHaveURL(/[?&]age=40/);

    const meta = await expectMetaMatchesUrl(page, request);
    expect(meta.title).toContain("40歳");
  });

  test("進むで企業詳細に戻ってもタイトルはその会社のもの", async ({ page, request }) => {
    await page.goto("/?age=40");
    await page.getByRole("table").getByRole("link").first().click();
    await expect(page).toHaveURL(/\/company\//);
    const detail = await metaFromDom(page);

    await page.goBack();
    await expect(page).toHaveURL(/[?&]age=40/);
    await page.goForward();
    await expect(page).toHaveURL(/\/company\//);

    expect(await metaFromDom(page)).toEqual(detail);
    await expectMetaMatchesUrl(page, request);
  });
});
