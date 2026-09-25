import { test, expect } from "./appTest";
import type { APIRequestContext, Page } from "@playwright/test";

/**
 * U16（Issue #135・親 #130）。**画面の中で状態を切り替えたあとのメタデータ**を固定する。
 *
 * サーバーが返す時点のメタデータは `e2e/seo.spec.ts` が見ている。こちらが見るのは
 * その先で、操作はすべて `history.pushState`（AC-7）なので、サーバーが head に描いた
 * メタデータは初回の1回きりしか出ない（あとは `usePageMeta` が DOM を書き換える）。**URL だけが変わってタイトルが取り残される**のが
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
async function expectMetaMatchesUrl(page: Page, request: APIRequestContext, label = "") {
  const url = new URL(page.url());
  const where = `${label} ${url.pathname}${url.search}`.trim();
  const [dom, server] = await Promise.all([
    metaFromDom(page),
    metaFromServer(request, url.pathname + url.search),
  ]);
  expect(dom, where).toEqual(server);
  // `og:` は canonical・title・description と同じ文字列（S2・AC-11・AC-12）。
  // **操作のあとも同じ**であること——`usePageMeta` が3つとも書き換えている。
  expect(dom.ogUrl, where).toBe(dom.canonical);
  expect(dom.ogTitle, where).toBe(dom.title);
  expect(dom.ogDescription, where).toBe(dom.description);
  return dom;
}

test.describe("メタデータと表示状態の一致（AC-16）", () => {
  /*
   * 以前は操作ごとに1本（表示基準・年齢・業種チップ・ページ送り・インデックスさせない
   * 絞り込み）だった。**性質は1つ——操作したあとの DOM が、そのURLを直接開いた HTML と
   * 一致する——なので、1本の流れで続けて操作し、1手ごとに突き合わせる。**
   *
   * 文言そのもの（タイトルに年齢・業種名・ページ番号が入ること、寄せ先の文言を返すこと）は
   * `lib/seo/ranking.test.ts` の `rankingPageMeta` が持つ。ここでは書き写さない。
   * 代わりに**1手ごとにタイトルが前の手から変わる**ことを見る——サーバーもクライアントも
   * クエリを無視して `/` の文言を返す壊れ方だと、突き合わせだけでは通ってしまう。
   *
   * 手の並びは、寄せ方の違う URL を順に通るように選んだ。
   * - ページ送り: ページ2以降は自己canonical
   * - 表示基準・年齢: `?age=N` は自己canonical
   * - 業種チップ: `?age=N&ind=X` は業種側（`/?ind=X`）へ寄る
   * - ヘッダの検索: `?q=` はインデックスさせないので `/` へ寄る。**寄せた先の文言に
   *   戻る**ことまで含めて `/` を直接開いたときと同じであることを見る（ADR-0006）
   */
  test("操作するたびに、そのURLを直接開いたときと同じメタデータになる", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    let previous = await metaFromDom(page);

    const steps: [string, () => Promise<void>][] = [
      [
        "ページ送り",
        async () => {
          await page.getByRole("button", { name: "次のページへ" }).click();
          await expect(page).toHaveURL(/[?&]page=2/);
        },
      ],
      [
        "表示基準",
        async () => {
          await page.getByRole("button", { name: "年齢そろえ" }).click();
          await expect(page).toHaveURL(/[?&]age=35/);
        },
      ],
      [
        "年齢",
        async () => {
          await page.getByRole("button", { name: "40歳", exact: true }).click();
          await expect(page).toHaveURL(/[?&]age=40/);
        },
      ],
      [
        "業種チップ",
        async () => {
          await page
            .getByRole("navigation", { name: "業種から見る" })
            .getByRole("link", { name: "海運業 9社", exact: true })
            .click();
          await expect(page).toHaveURL(/ind=/);
        },
      ],
      [
        "ヘッダの検索",
        async () => {
          await page
            .getByRole("banner")
            .getByRole("searchbox", { name: "会社名で検索" })
            .fill("商船三井");
          await expect(page).toHaveURL(/q=/);
        },
      ],
    ];

    for (const [label, step] of steps) {
      await step();
      const meta = await expectMetaMatchesUrl(page, request, label);
      expect(meta.title, `${label}でタイトルが変わる`).not.toBe(previous.title);
      previous = meta;
    }

    // 最後の手（`?q=`）は `/` へ寄せる。寄せた先と同じメタデータに戻っている。
    expect(previous, "寄せ先").toEqual(await metaFromServer(request, "/"));
  });
});

test.describe("企業詳細ページのメタデータ（AC-16）", () => {
  /**
   * **表示基準を切り替えてもメタデータは動かない**（R1・ADR-0012）。`?age=` を
   * 無くしたので URL が動かず、1つのURLに対してメタデータは1つしか存在しない。
   * U16 がここで直していた食い違い（親 Issue #130）は起きようが無くなった。
   *
   * タイトルに出るのは有報の実測値だけなので、「推定」の語はどの状態でも出ない（AC-9）。
   */
  test("表示基準を切り替えてもタイトルと canonical が変わらず、推定の語が出ない", async ({
    page,
    request,
  }) => {
    await page.goto("/company/6861");
    const raw = await metaFromDom(page);
    expect(raw.title).toContain("有価証券報告書は2,178万円");
    expect(raw.title).not.toContain("推定");
    expect(raw.description).not.toContain("推定");

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("button", { name: "25歳" }).click();
    await expect(page.getByText("25歳時点の推定年収")).toBeVisible();

    const meta = await expectMetaMatchesUrl(page, request);
    expect(meta).toEqual(raw);
    expect(meta.canonical).toBe("https://openreport.net/company/6861");
  });
});

/**
 * AC-15 と同じ経路。**戻るで復元されるのは状態だけではない。** 戻ってきた文書の
 * メタデータは「それが作られたときのURL」のものになりうる。状態が URL を正として
 * 直る規則（`lib/history/useLocationSyncedState.ts`）と対になっている。
 *
 * **進むで企業詳細へ戻ったとき**が、実際に捕まえた壊れ方（CLAUDE.md）——
 * `usePageMeta` は DOM を直接書き換えるので、ランキングが書いた canonical と
 * description が企業詳細の `<head>` に残っていた。
 */
test.describe("ページを跨いだ戻る/進むの後（AC-15・AC-16）", () => {
  test("戻るとランキングの、進むと企業詳細のメタデータに戻る", async ({ page, request }) => {
    await page.goto("/?age=40");
    await page.getByRole("table").getByRole("link").first().click();
    await expect(page).toHaveURL(/\/company\//);
    const detail = await metaFromDom(page);

    await page.goBack();
    await expect(page).toHaveURL(/[?&]age=40/);
    const ranking = await expectMetaMatchesUrl(page, request, "戻った後");
    expect(ranking.title).toContain("40歳");

    await page.goForward();
    await expect(page).toHaveURL(/\/company\//);
    expect(await metaFromDom(page)).toEqual(detail);
    await expectMetaMatchesUrl(page, request, "進んだ後");
  });
});
