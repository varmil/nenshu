import { test, expect } from "@playwright/test";

/**
 * U12（Issue #80）で足したもの——並び替え・年収バー・偏差値・サイドバー・
 * モバイルの絞り込みシート・業種チップ・ヘッダの検索——の E2E。
 *
 * 既存の絞り込み・検索は `ranking-filters.spec.ts`、表示基準は
 * `ranking-basis.spec.ts` にある。
 */

const rows = (page: import("@playwright/test").Page) =>
  page.getByRole("table").locator("tbody tr");

test.describe("AC-12 並び替え", () => {
  test("平均年齢が若い順に並び替えても、順位は1から振り直されない", async ({ page }) => {
    await page.goto("/");
    await expect(rows(page).first()).toContainText("株式会社キーエンス");

    await page.getByRole("group", { name: "並び替え" }).getByRole("button", { name: "平均年齢が若い順" }).click();

    await expect(page).toHaveURL(/[?&]sort=age/);

    // 平均年齢（5列目 = index 4）が昇順に並ぶ。
    const ages = await rows(page).locator("td").nth(4).allTextContents();
    const values = ages.map((t) => Number(t.replace("歳", "")));
    expect(values).toEqual([...values].sort((a, b) => a - b));

    // 順位（1列目）は金額基準のまま。1,2,3… にはならない。
    const ranks = (await rows(page).locator("td").first().allTextContents()).map(Number);
    expect(ranks).not.toEqual(ranks.map((_, i) => i + 1));
  });

  test("従業員数が多い順で1位は最大の会社", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("group", { name: "並び替え" })
      .getByRole("button", { name: "従業員数が多い順" })
      .click();

    await expect(page).toHaveURL(/[?&]sort=emp/);
    const employees = (await rows(page).locator("td").last().allTextContents()).map((t) =>
      Number(t.replace(/[^0-9]/g, ""))
    );
    expect(employees).toEqual([...employees].sort((a, b) => b - a));
  });

  test("並び替えを既定に戻すとURLから sort が消える", async ({ page }) => {
    await page.goto("/?sort=age");
    await page
      .getByRole("group", { name: "並び替え" })
      .getByRole("button", { name: "年収が高い順" })
      .click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("2ページ目で並び替えると1ページ目に戻る", async ({ page }) => {
    await page.goto("/?page=2");
    await page
      .getByRole("group", { name: "並び替え" })
      .getByRole("button", { name: "平均年齢が若い順" })
      .click();
    await expect(page).toHaveURL(/[?&]sort=age/);
    await expect(page).not.toHaveURL(/[?&]page=/);
  });

  test("並び替えでネットワークリクエストが発生しない", async ({ page }) => {
    await page.goto("/");
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));

    await page
      .getByRole("group", { name: "並び替え" })
      .getByRole("button", { name: "従業員数が多い順" })
      .click();
    await expect(page).toHaveURL(/[?&]sort=emp/);

    expect(requests).toHaveLength(0);
  });
});

test.describe("AC-13 年収バー", () => {
  const barWidth = async (page: import("@playwright/test").Page, index: number) =>
    Number(
      (
        await rows(page)
          .nth(index)
          .locator('[style*="width"]')
          .first()
          .getAttribute("style")
      )
        ?.match(/width:\s*([\d.]+)%/)?.[1] ?? "0"
    );

  test("1位が100%で、以降はその比になる", async ({ page }) => {
    await page.goto("/");
    expect(await barWidth(page, 0)).toBe(100);
    const second = await barWidth(page, 1);
    expect(second).toBeLessThan(100);
    expect(second).toBeGreaterThan(0);
  });

  test("2ページ目では基準が取り直され、先頭がまた100%になる", async ({ page }) => {
    await page.goto("/?page=2");
    expect(await barWidth(page, 0)).toBe(100);
  });

  test("表示基準を切り替えるとバーの基準も取り直される", async ({ page }) => {
    await page.goto("/");
    const before = await barWidth(page, 5);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);

    expect(await barWidth(page, 0)).toBe(100);
    expect(await barWidth(page, 5)).not.toBe(before);
  });

  test("脚注に基準がページ内であることが書いてある", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("table").locator("caption")).toContainText(
      "このページの1位を100%"
    );
  });
});

test.describe("AC-14 偏差値", () => {
  test("実測値のキーエンスは122.9、年齢そろえ35歳では150.0", async ({ page }) => {
    await page.goto("/");
    // 偏差値は4列目（index 3）。上位◯%が下に添う。
    await expect(rows(page).first().locator("td").nth(3)).toContainText("122.9");

    await page.goto("/?age=35");
    await expect(rows(page).first()).toContainText("株式会社キーエンス");
    await expect(rows(page).first().locator("td").nth(3)).toContainText("150.0");
  });

  test("100を超えうることが脚注に書いてある", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("table").locator("caption")).toContainText("100を超える");
  });

  // 偏差値は単独で出さない（docs/product/glossary.md）。
  test("上位◯%が必ず併記される", async ({ page }) => {
    await page.goto("/");
    await expect(rows(page).first().locator("td").nth(3)).toContainText("上位0.1%未満");
  });

  /*
   * 上位◯%の分母は絞り込み後の件数ではなく全1,867社。海運業7社に絞ったときに
   * 「上位14%」のような値が出たら、母集団を取り違えている。
   */
  test("絞り込んでも上位◯%は全体の中での位置のまま", async ({ page }) => {
    await page.goto("/?ind=海運業");
    await expect(rows(page)).toHaveCount(7);
    const first = rows(page).first().locator("td");
    await expect(first.first()).toHaveText("1");
    await expect(first.nth(3)).not.toContainText("上位14.3%");
  });
});

test.describe("サイドバーと件数表示", () => {
  test("PC では絞り込みが左に常設され、スクロールしても追従する", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
    const before = await sidebar.boundingBox();

    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(200);
    const after = await sidebar.boundingBox();

    // sticky なので、ページを送っても画面内に残る（y はスクロール量ほど動かない）。
    expect(after!.y).toBeGreaterThan(before!.y - 1200);
    expect(after!.y).toBeLessThan(800);
  });

  test("件数が「1,867社 中 1〜100社目」の形で出る", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("1,867社 中 1〜100社目")).toBeVisible();
  });

  test("適用中のチップが出て、1つずつ解除できる", async ({ page }) => {
    await page.goto("/?ind=海運業&emp=1000-");
    await expect(page.getByText("適用中")).toBeVisible();

    await page.getByRole("button", { name: /業種の絞り込み「海運業」を解除/ }).click();
    await expect(page).not.toHaveURL(/ind=/);
    await expect(page).toHaveURL(/emp=1000-/);
  });

  test("「すべて解除」で絞り込みだけが外れ、表示基準は残る", async ({ page }) => {
    await page.goto("/?age=35&ind=海運業&q=商船");
    await page.getByRole("button", { name: "すべて解除" }).click();

    await expect(page).toHaveURL(/age=35/);
    await expect(page).not.toHaveURL(/ind=/);
    await expect(page).not.toHaveURL(/q=/);
  });
});

test.describe("業種チップ", () => {
  test("33件のリンクがあり、href はクロールできる形をしている", async ({ page }) => {
    await page.goto("/");
    const chips = page.getByRole("navigation", { name: "業種から見る" }).getByRole("link");
    await expect(chips).toHaveCount(33);
    await expect(chips.first()).toHaveAttribute("href", /^\/\?ind=/);
  });

  test("クリックしても遷移せず、ネットワークリクエストが発生しない", async ({ page }) => {
    await page.goto("/");
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));

    await page
      .getByRole("navigation", { name: "業種から見る" })
      .getByRole("link", { name: "海運業", exact: true })
      .click();

    await expect(page).toHaveURL(/ind=%E6%B5%B7%E9%81%8B%E6%A5%AD/);
    await expect(rows(page)).toHaveCount(7);
    expect(requests).toHaveLength(0);
  });
});

test.describe("ヘッダの検索", () => {
  test("/ の上ではネットワークリクエストなしで絞り込む", async ({ page }) => {
    await page.goto("/");
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));

    await page.getByRole("banner").getByRole("searchbox", { name: "会社名で検索" }).fill("商船三井");

    await expect(rows(page)).toHaveCount(1);
    await expect(page).toHaveURL(/q=/);
    expect(requests).toHaveLength(0);
  });

  test("/about から検索すると /?q= に遷移する", async ({ page }) => {
    await page.goto("/about");
    const search = page.getByRole("banner").getByRole("searchbox", { name: "会社名で検索" });
    await search.fill("商船三井");
    await search.press("Enter");

    await expect(page).toHaveURL(/\/\?q=/);
    await expect(rows(page)).toHaveCount(1);
  });

  test("直接 /?q= を開くと検索欄に語が入っている", async ({ page }) => {
    await page.goto("/?q=商船三井");
    await expect(
      page.getByRole("banner").getByRole("searchbox", { name: "会社名で検索" })
    ).toHaveValue("商船三井");
  });
});

test.describe("モバイルの絞り込みシート", () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test("シートを開いて絞り込め、閉じると結果に反映されている", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("aside")).toBeHidden();

    await page.getByRole("button", { name: /絞り込み/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("group", { name: "従業員数" }).getByRole("button", { name: "〜300人" }).click();
    await expect(page).toHaveURL(/emp=-300/);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByText("適用中")).toBeVisible();
  });

  test("並び替えとシートを出しても横スクロールが発生しない", async ({ page }) => {
    await page.goto("/?sort=emp");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
