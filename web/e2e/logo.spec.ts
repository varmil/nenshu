import { test, expect } from "@playwright/test";
import { collectPageRequests } from "./network";

/**
 * L1 企業ロゴの表示（`docs/logo/spec.md` 2. AC-7〜AC-14）。
 *
 * ロゴを持つ会社は 1,636/1,867 で、**持たない会社が231社ある**（ADR-0008 決定3で
 * 解像度の下限を外した結果、残るのは出典そのものが無い会社）。混在した状態が
 * 崩れないことがこの Unit の眼目なので、両方が出るページで見る。
 */
const WITH_LOGO = { id: "6861", name: "株式会社キーエンス" };
const WITHOUT_LOGO = { id: "285A", name: "キオクシアホールディングス株式会社", initial: "キ" };

test.describe("AC-7・AC-8 ロゴと頭文字の出し分け", () => {
  test("ロゴを持つ会社は画像が出る", async ({ page }) => {
    await page.goto("/");
    const row = page.getByRole("row").filter({ hasText: WITH_LOGO.name });
    const img = row.locator('[data-logo="image"] img');
    await expect(img).toHaveAttribute("src", `/logos/${WITH_LOGO.id}.webp`);
    // 実際に読めていること（壊れた画像を「出ている」と数えない）
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
  });

  test("ロゴを持たない会社は頭文字マークのまま", async ({ page }) => {
    await page.goto("/");
    const row = page.getByRole("row").filter({ hasText: WITHOUT_LOGO.name });
    await expect(row.locator('[data-logo="initial"]')).toHaveText(WITHOUT_LOGO.initial);
    await expect(row.locator('[data-logo="image"]')).toHaveCount(0);
  });

  test("画像は器からはみ出さず、引き伸ばされていない", async ({ page }) => {
    await page.goto("/");
    const box = page.locator('[data-logo="image"]').first();
    const size = await box.evaluate((el) => {
      const img = el.querySelector("img") as HTMLImageElement;
      const b = el.getBoundingClientRect();
      const i = img.getBoundingClientRect();
      return {
        boxW: b.width,
        boxH: b.height,
        imgW: i.width,
        imgH: i.height,
        naturalRatio: img.naturalWidth / img.naturalHeight,
        drawnRatio: i.width / i.height,
      };
    });
    expect(size.imgW).toBeLessThanOrEqual(size.boxW + 0.5);
    expect(size.imgH).toBeLessThanOrEqual(size.boxH + 0.5);
    // contain なので縦横比が変わらない
    expect(size.drawnRatio).toBeCloseTo(size.naturalRatio, 1);
  });

  test("壊れた画像・代替テキストの文字列が画面に出ない", async ({ page }) => {
    await page.goto("/");
    const alts = await page.locator('[data-logo="image"] img').evaluateAll((els) =>
      els.map((el) => (el as HTMLImageElement).alt),
    );
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((alt) => alt === "")).toBe(true);
  });
});

test.describe("AC-9 混在しても列が揃う", () => {
  test("ロゴ・頭文字が混ざっても社名の開始位置と行の高さが同じ", async ({ page }) => {
    await page.goto("/");
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
        .filter(Boolean),
    );
    expect(measured.length).toBeGreaterThan(10);
    const kinds = new Set(measured.map((m) => m!.kind));
    // 両方が同じページに出ていないと、この検査は何も見ていないことになる
    expect(kinds).toEqual(new Set(["image", "initial"]));
    expect(new Set(measured.map((m) => m!.nameLeft)).size).toBe(1);
    expect(new Set(measured.map((m) => m!.markW)).size).toBe(1);
    expect(new Set(measured.map((m) => m!.markH)).size).toBe(1);
    expect(new Set(measured.map((m) => m!.rowH)).size).toBe(1);
  });
});

test.describe("AC-10 モバイル", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("360px で横スクロールが出ず、社名が読める幅を保つ", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);

    // **表とカードは両方がDOMにある**（`hidden md:block`）。見えているほうを測る
    const nameWidth = await page.evaluate(() => {
      const link = [...document.querySelectorAll("a[href^='/company/']")].find(
        (el) => (el as HTMLElement).offsetParent !== null,
      )!;
      return link.getBoundingClientRect().width;
    });
    expect(nameWidth).toBeGreaterThan(120);
  });

  test("モバイルでも器の幅は揃う", async ({ page }) => {
    await page.goto("/");
    const widths = await page
      .locator('[data-logo="image"], [data-logo="initial"]')
      .evaluateAll((els) => [
        ...new Set(
          els
            .filter((el) => (el as HTMLElement).offsetParent !== null)
            .map((el) => Math.round(el.getBoundingClientRect().width)),
        ),
      ]);
    expect(widths).toHaveLength(1);
  });
});

test.describe("AC-11 操作でページを取り直さない", () => {
  test("ページ送りで文書・RSCのリクエストが発生しない（ロゴ画像は除く）", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const requests = collectPageRequests(page);
    await page.getByRole("button", { name: "次のページへ" }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await page.waitForLoadState("networkidle");

    expect(requests).toHaveLength(0);
  });

  test("ページを送るとロゴも入れ替わる", async ({ page }) => {
    await page.goto("/");
    const first = await page.locator('[data-logo="image"] img').first().getAttribute("src");
    await page.getByRole("button", { name: "次のページへ" }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(page.locator('[data-logo="image"] img').first()).not.toHaveAttribute(
      "src",
      first ?? "",
    );
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
      return { left: name.getBoundingClientRect().left, height: row.getBoundingClientRect().height };
    });

    await page.unroute("**/logos/*.webp");
    await page.reload();
    await page.waitForLoadState("networkidle");
    const after = await page.evaluate(() => {
      const name = document.querySelector("a[href^='/company/']")!;
      const row = name.closest("tr, div")!;
      return { left: name.getBoundingClientRect().left, height: row.getBoundingClientRect().height };
    });

    expect(after.left).toBeCloseTo(before.left, 0);
    expect(after.height).toBeCloseTo(before.height, 0);
  });
});

test.describe("企業詳細ページ", () => {
  test("見出しにロゴが出る", async ({ page }) => {
    await page.goto(`/company/${WITH_LOGO.id}`);
    await expect(page.locator('header [data-logo="image"] img')).toHaveAttribute(
      "src",
      `/logos/${WITH_LOGO.id}.webp`,
    );
  });

  test("ロゴを持たない会社は頭文字マーク", async ({ page }) => {
    await page.goto(`/company/${WITHOUT_LOGO.id}`);
    await expect(page.locator('header [data-logo="initial"]')).toHaveText(WITHOUT_LOGO.initial);
  });

  test("水準が近い会社にもロゴが出る", async ({ page }) => {
    await page.goto(`/company/${WITH_LOGO.id}`);
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
    await expect(section.getByText(/CC BY/).first()).toBeVisible();
  });
});

test.describe("ダークモードでもロゴが読める", () => {
  test("器の地はモードによらず明るい", async ({ page }) => {
    await page.goto("/");
    const light = await page
      .locator('[data-logo="image"]')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.getByRole("button", { name: "ダークモードに切り替える" }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    const dark = await page
      .locator('[data-logo="image"]')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);

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
