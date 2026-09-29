import type { Page } from "@playwright/test";
import { test, expect } from "./appTest";
import { collectPageRequests, waitForRankingReady } from "./network";
import { companies, logos, pickCompany, rowOf } from "../testing/realData";
import { rankingPageData } from "../features/ranking/lib/pageData";
import { companyPageData } from "../features/company/lib/pageData";
import { initialOf } from "../features/logo/lib/initial";
import { attributionCredits, type LogoEntry } from "../features/logo/lib/credits";
import type { RankingBootstrap } from "../features/ranking/types";

/**
 * L1 企業ロゴの表示（`docs/logo/spec.md` 2. AC-7〜AC-14）。
 *
 * **ロゴを持たない会社がある**（ADR-0008 決定3で解像度の下限を外し、明るい器で空白に
 * 見える白いロゴは落とす——#156）。混在した状態が崩れないことがこの Unit の眼目なので、
 * 両方が出るページで見る。
 *
 * **会社もページも名指ししない**（refresh の D0・Issue #870）。ロゴの有無は取り直すたびに、
 * `/` のどのページに載るかは金額が動くたびに入れ替わるので、`/` の組み立て
 * （`rankingPageData`）とロゴの表からその状態の会社・ページを選ぶ。
 */

/** `/` の既定の並びで `n` ページ目に載る会社（画面と同じ関数で組む）。 */
const rankingPage = (n: number): RankingBootstrap =>
  rankingPageData(new URLSearchParams(n === 1 ? "" : `page=${n}`)).bootstrap;

const rankingUrl = (n: number) => (n === 1 ? "/" : `/?page=${n}`);

/** 条件に合う `/` の最初のページ番号（`from` ページ目から探す）。無ければ落とす。 */
function pickRankingPage(what: string, pred: (b: RankingBootstrap) => boolean, from = 1): number {
  const first = rankingPage(1).page;
  const pages = Math.ceil(first.totalCount / first.companies.length);
  for (let n = from; n <= pages; n++) if (pred(rankingPage(n))) return n;
  throw new Error(`${what}が見つからない`);
}

/** 表（PC）の中で、その会社の行。社名は他の会社の社名に含まれうるので、リンク先で引く。 */
const tableRow = (page: Page, id: string) =>
  page.getByRole("row").filter({ has: page.locator(`a[href="/company/${id}"]`) });

/** `/` の1ページ目に載り、ロゴを持つ会社。 */
const FIRST_PAGE_LOGOS = new Set(rankingPage(1).pageLogoIds);
const WITH_LOGO = pickCompany("/ の1ページ目に載り、ロゴを持つ会社", ([id]) =>
  FIRST_PAGE_LOGOS.has(id)
);

test.describe("AC-7・AC-8 ロゴと頭文字の出し分け", () => {
  test("AC-7: ロゴを持つ会社は画像が出て、器からはみ出さず、引き伸ばされていない", async ({
    page,
  }) => {
    await page.goto("/");
    const row = tableRow(page, WITH_LOGO);
    const box = row.locator('[data-logo="image"]');
    const img = box.locator("img");
    await expect(img).toHaveAttribute("src", `/logos/${WITH_LOGO}.webp`);
    // 実際に読めていること（壊れた画像を「出ている」と数えない）
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);

    const size = await box.evaluate((el) => {
      const image = el.querySelector("img") as HTMLImageElement;
      const b = el.getBoundingClientRect();
      const i = image.getBoundingClientRect();
      return {
        boxW: b.width,
        boxH: b.height,
        imgW: i.width,
        imgH: i.height,
        naturalRatio: image.naturalWidth / image.naturalHeight,
        drawnRatio: i.width / i.height,
      };
    });
    expect(size.imgW).toBeLessThanOrEqual(size.boxW + 0.5);
    expect(size.imgH).toBeLessThanOrEqual(size.boxH + 0.5);
    // contain なので縦横比が変わらない
    expect(size.drawnRatio).toBeCloseTo(size.naturalRatio, 1);

    // 代替テキストは空。読み込みに失敗しても、社名の隣に同じ文字列が出ない。
    const alts = await page
      .locator('[data-logo="image"] img')
      .evaluateAll((els) => els.map((el) => (el as HTMLImageElement).alt));
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((alt) => alt === "")).toBe(true);
  });

  // **ランキングは検索で絞ってから見る。** どのページに載るかは金額が動くたびに変わるので、
  // 行の在処を社名の検索で固定する。
  test("AC-8: ロゴを持たない会社はランキングでも企業詳細でも頭文字マーク", async ({ page }) => {
    const id = pickCompany("ロゴを持たない会社", ([id]) => logos.byId[id] === undefined);
    const [, name] = rowOf(id);
    await page.goto(`/?q=${encodeURIComponent(name)}`);
    const row = tableRow(page, id);
    await expect(row.locator('[data-logo="initial"]')).toHaveText(initialOf(name));
    await expect(row.locator('[data-logo="image"]')).toHaveCount(0);

    await page.goto(`/company/${id}`);
    await expect(page.locator('header [data-logo="initial"]')).toHaveText(initialOf(name));
  });
});

/*
  器の高さは表示箇所ごとに決めてよい（ADR-0008 決定4は「収め方」を共通にすると
  決めているだけで、寸法は共通ではない）。ランキングの表だけモックの40pxより
  大きい50pxにしてある（運営者の指示・Issue #128）ので、値もここで固定する。
  高さが変わると行の高さも変わるため、CSS の一括変更で黙って戻るのを防ぐ。
*/
test.describe("AC-9 混在しても列が揃う", () => {
  test("ロゴ・頭文字が混ざっても社名の開始位置と行の高さが同じで、ロゴの器の高さが50pxで揃う", async ({
    page,
  }) => {
    const mixed = pickRankingPage(
      "ロゴを持つ会社と持たない会社が両方載るページ",
      (b) => b.pageLogoIds.length > 0 && b.pageLogoIds.length < b.page.companies.length
    );
    await page.goto(rankingUrl(mixed));
    const rows = page.getByRole("row");
    const measured = await rows.evaluateAll((els) =>
      els
        .map((el) => {
          const mark = el.querySelector('[data-logo="image"], [data-logo="initial"]');
          const name = el.querySelector("a[href^='/company/']");
          if (!mark || !name) return null;
          return {
            kind: mark.getAttribute("data-logo"),
            nameLeft: Math.round(name.getBoundingClientRect().left),
            markW: Math.round(mark.getBoundingClientRect().width),
            markH: Math.round(mark.getBoundingClientRect().height),
            rowH: Math.round(el.getBoundingClientRect().height),
          };
        })
        .filter(Boolean)
    );
    expect(measured.length).toBeGreaterThan(10);
    const kinds = new Set(measured.map((m) => m!.kind));
    // 両方が同じページに出ていないと、この検査は何も見ていないことになる
    expect(kinds).toEqual(new Set(["image", "initial"]));
    expect(new Set(measured.map((m) => m!.nameLeft)).size).toBe(1);
    expect(new Set(measured.map((m) => m!.markW)).size).toBe(1);
    expect([...new Set(measured.map((m) => m!.markH))]).toEqual([50]);
    expect(new Set(measured.map((m) => m!.rowH)).size).toBe(1);
  });
});

test.describe("AC-10 モバイル", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("360px で横スクロールが出ず、社名が読める幅を保ち、器の幅が揃う", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);

    // **表とカードは両方がDOMにある**（`hidden md:block`）。見えているほうを測る
    const nameWidth = await page.evaluate(() => {
      const link = [...document.querySelectorAll("a[href^='/company/']")].find(
        (el) => (el as HTMLElement).offsetParent !== null
      )!;
      return link.getBoundingClientRect().width;
    });
    expect(nameWidth).toBeGreaterThan(120);

    const widths = await page
      .locator('[data-logo="image"], [data-logo="initial"]')
      .evaluateAll((els) => [
        ...new Set(
          els
            .filter((el) => (el as HTMLElement).offsetParent !== null)
            .map((el) => Math.round(el.getBoundingClientRect().width))
        ),
      ]);
    expect(widths).toHaveLength(1);
  });
});

test.describe("AC-11 操作でページを取り直さない", () => {
  /*
    ページ送りで行が入れ替わっても、文書を取り直さず（ロゴ画像のリクエストは除く）、
    **ロゴがその行の会社のものであること**を見る。ロゴの有無はマスク（行1つにつき
    1文字）で配っており、ずれると別の会社のロゴを出す（`features/logo/lib/mask.ts`）。
  */
  test("ページを送ると、文書を取り直さずにロゴが行と一緒に入れ替わる", async ({ page }) => {
    // 送った先のページにロゴを持つ会社が載っていないと、行との対応を何も見ないことになる。
    const next = pickRankingPage(
      "ロゴを持つ会社が載る2ページ目以降",
      (b) => b.pageLogoIds.length > 0,
      2
    );
    await page.goto(rankingUrl(next - 1));
    await waitForRankingReady(page);
    await page.waitForLoadState("networkidle");
    const firstLink = page.locator("tbody tr a[href^='/company/']").first();
    const firstHref = await firstLink.getAttribute("href");

    const requests = collectPageRequests(page);
    await page.getByRole("button", { name: "次のページへ" }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]page=${next}(&|$)`));
    await expect(firstLink).not.toHaveAttribute("href", firstHref ?? "");

    const rows = await page.locator("tbody tr").evaluateAll((els) =>
      els.map((el) => ({
        href: el.querySelector("a[href^='/company/']")?.getAttribute("href") ?? null,
        src: el.querySelector('[data-logo="image"] img')?.getAttribute("src") ?? null,
      }))
    );
    const withLogo = rows.filter((row) => row.src !== null);
    // ロゴが出る行は、そのページでロゴを持つ会社と同じ（マスクで開いたものがデータと合う）。
    expect(withLogo.map(({ href }) => href?.replace("/company/", ""))).toEqual(
      rankingPage(next).pageLogoIds
    );
    for (const { href, src } of withLogo) {
      expect(src, href ?? "").toBe(`/logos/${href?.replace("/company/", "")}.webp`);
    }

    await page.waitForLoadState("networkidle");
    expect(requests).toHaveLength(0);
  });
});

test.describe("AC-12 レイアウトが動かない", () => {
  test("画像の読み込みが終わっても行の高さと社名の位置が変わらない", async ({ page }) => {
    // 画像を止めた状態で測り、通してから測り直す
    await page.route("**/logos/*.webp", (route) => route.abort());
    await page.goto("/");
    const before = await page.evaluate(() => {
      const name = document.querySelector("a[href^='/company/']")!;
      const row = name.closest("tr, div")!;
      return {
        left: name.getBoundingClientRect().left,
        height: row.getBoundingClientRect().height,
      };
    });

    await page.unroute("**/logos/*.webp");
    await page.reload();
    await page.waitForLoadState("networkidle");
    const after = await page.evaluate(() => {
      const name = document.querySelector("a[href^='/company/']")!;
      const row = name.closest("tr, div")!;
      return {
        left: name.getBoundingClientRect().left,
        height: row.getBoundingClientRect().height,
      };
    });

    expect(after.left).toBeCloseTo(before.left, 0);
    expect(after.height).toBeCloseTo(before.height, 0);
  });
});

test.describe("企業詳細ページ", () => {
  test("見出しと「水準が近い会社」にロゴが出る", async ({ page }) => {
    // 自身も、既定の表示基準（実測値）で並ぶ近い会社のどれかもロゴを持つ会社。
    const id = pickCompany("自身と近い会社のどれかがロゴを持つ会社", ([id]) => {
      if (logos.byId[id] === undefined) return false;
      const actual = companyPageData(id).view.byBasis.find((b) => b.targetAge === null)!;
      return actual.neighbors.some((n) => logos.byId[n.id] !== undefined);
    });
    await page.goto(`/company/${id}`);
    await expect(page.locator('header [data-logo="image"] img')).toHaveAttribute(
      "src",
      `/logos/${id}.webp`
    );
    const section = page.getByRole("heading", { name: /水準が近い会社/ }).locator("..");
    await expect(section.locator('[data-logo="image"] img').first()).toBeVisible();
  });
});

test.describe("AC-14 出典", () => {
  test("/about にロゴの出典とライセンスがある", async ({ page }) => {
    await page.goto("/about");
    const section = page.getByRole("heading", { name: "企業ロゴの出典" }).locator("..");
    await expect(section).toContainText("Wikimedia Commons");
    await expect(section).toContainText("ロゴは各社の商標です");
    // 帰属が要るものは作者とライセンスが読める
    const id = pickCompany("作者の表示が要り、作者の名前もあるロゴを持つ会社", ([id]) => {
      const entry = logos.byId[id] as LogoEntry | undefined;
      return entry?.attr === true && (entry.by ?? "").trim() !== "";
    });
    const credit = attributionCredits(companies.rows, logos.byId as Record<string, LogoEntry>).find(
      (c) => c.id === id
    )!;
    const link = section.locator(`a[href="${credit.from}"]`);
    await expect(link).toHaveText(credit.license);
    await expect(link.locator("xpath=..")).toContainText(credit.name);
    await expect(link.locator("xpath=..")).toContainText(credit.author);
  });
});

test.describe("ダークモードでもロゴが読める", () => {
  test("器の地はモードによらず明るい", async ({ page }) => {
    await page.goto("/");
    const box = tableRow(page, WITH_LOGO).locator('[data-logo="image"]');
    const light = await box.evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.getByRole("button", { name: "ダークモードに切り替える" }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    const dark = await box.evaluate((el) => getComputedStyle(el).backgroundColor);

    // どちらのモードでも十分に明るい面であること（ロゴが沈まない）。
    // **`getComputedStyle` は `lab()` を返す**（トークンが oklch のため）ので、
    // 数値を素で読まずキャンバスに描いて sRGB に開く。
    for (const color of [light, dark]) {
      const luminance = await page.evaluate((value) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      }, color);
      expect(luminance).toBeGreaterThan(0.85);
    }
  });
});
