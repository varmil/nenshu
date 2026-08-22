import { test, expect } from "@playwright/test";

/**
 * 業種セレクトを開いて選択肢をクリックする。
 * base-ui の Select はポップアップを Portal で document.body 直下に描画するため、
 * トリガーの role=combobox と、開いた後の role=option で操作する。
 */
async function selectOption(page: import("@playwright/test").Page, filterLabel: string, optionLabel: string) {
  await page.getByRole("combobox", { name: filterLabel }).click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
}

/**
 * 従業員数・在籍年数・平均年齢はToggleGroup（3択のスイッチ）。
 * ToggleGroupはrole=groupでaria-labelを持ち、各選択肢はrole=buttonになる。
 */
async function pressToggle(page: import("@playwright/test").Page, filterLabel: string, optionLabel: string) {
  await page
    .getByRole("group", { name: filterLabel })
    .getByRole("button", { name: optionLabel, exact: true })
    .click();
}

test.describe("初期表示（AC-1のスモーク確認）", () => {
  test("1位はキーエンス、推定年収2,178万円", async ({ page }) => {
    await page.goto("/");
    const firstRow = page.getByRole("table").locator("tbody tr").first();
    await expect(firstRow).toContainText("株式会社キーエンス");
    await expect(firstRow).toContainText("2,178万円");
  });

  // U12 で絞り込みは左サイドバーへ、検索は共通ヘッダへ移った。
  test("絞り込み4種の可視ラベルがサイドバーに出る", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator("aside");
    for (const label of ["業種", "従業員数", "在籍年数", "平均年齢"]) {
      await expect(sidebar.getByText(label, { exact: true })).toBeVisible();
    }
  });

  /*
   * Issue #72。未選択のとき `placeholder` に任せると、センチネル値の `__all__` が
   * そのままトリガーに出ていた（公開中のサイトに出ていた表示崩れ）。
   */
  test("業種セレクトは未選択のとき「すべて」と出る（内部値を見せない）", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByRole("combobox", { name: "業種" });
    await expect(trigger).toContainText("すべて");
    await expect(trigger).not.toContainText("__all__");

    await page.goto("/?ind=海運業");
    await expect(page.getByRole("combobox", { name: "業種" })).toContainText("海運業");
  });

  test("検索欄は共通ヘッダにある", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("banner").getByRole("searchbox", { name: "会社名で検索" })
    ).toBeVisible();
  });
});

test.describe("フィルタ", () => {
  test("AC-3: 業種で「海運業」を選ぶと7社になり、順位が1から振り直される", async ({ page }) => {
    await page.goto("/");
    await selectOption(page, "業種", "海運業");

    const rows = page.getByRole("table").locator("tbody tr");
    await expect(rows).toHaveCount(7);
    // 順位はロゴ左上のバッジ。読み上げ用の「位」が textContent に付く。
    await expect(rows.first().locator("[data-rank-badge]")).toHaveText("1位");
  });

  test("AC-4: 従業員数で「1,000人以上」を選ぶと、表示される全社が1,000人以上", async ({ page }) => {
    await page.goto("/");
    await pressToggle(page, "従業員数", "1,000人以上");

    const rows = page.getByRole("table").locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // 列は3つで、従業員数は社名の下の meta 行にある（順位の列は無い）。
    const metaCells = await rows.locator("td").first().allTextContents();
    for (const cell of metaCells) {
      const employees = Number(cell.match(/・\s*([\d,]+)人/)![1].replace(/,/g, ""));
      expect(employees).toBeGreaterThanOrEqual(1000);
    }
  });

  test("AC-5: 業種と平均年齢を重ねると、両方の条件を満たす会社だけが表示される", async ({ page }) => {
    await page.goto("/");
    await selectOption(page, "業種", "情報・通信業");
    await pressToggle(page, "平均年齢", "〜40歳");

    const rows = page.getByRole("table").locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // 列: 0 順位・会社名（平均年齢・在籍年数・従業員数を下に添える）/ 1 金額 /
    // 2 偏差値。**業種は meta 行に出していない**ので、業種で絞れている
    // ことは総件数の表示（情報・通信業 173社のうち平均年齢40歳未満）で見る——
    // 1ページの行数は PAGE_SIZE で頭打ちなので判定に使えない（Issue #103）。
    await expect(page.getByText("1,867社 中")).toHaveCount(0);
    const rowCount = await rows.count();
    for (let i = 0; i < rowCount; i++) {
      const meta = (await rows.nth(i).locator("td").first().textContent())!;
      const avgAge = Number(meta.match(/平均([\d.]+)歳/)![1]);
      expect(avgAge).toBeLessThan(40);
    }
  });

  test("キーボードだけで業種を選択できる", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("combobox", { name: "業種" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // 何らかの業種が選ばれ、表が絞り込まれて全1,867社ではなくなっていることを確認する。
    // **行数では判定できない**——1ページは PAGE_SIZE 件で頭打ちなので、絞り込みが
    // 効いていなくても行数は同じ。総件数の表示が減ったかで見る（Issue #103）。
    await expect(page).toHaveURL(/[?&]ind=/);
    await expect(page.getByText("1,867社 中")).toHaveCount(0);
    const rows = page.getByRole("table").locator("tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);
  });

  // 従業員数の3区分（517/734/616）はいずれもPAGE_SIZE(30)より多いため、
  // 「表示行数が減るか」では絞り込みの有無を判定できない。1位のキーエンス（3,306人、
  // 「〜300人」には該当しない）が絞り込みで表から外れるかどうかで判定する。
  test("キーボードだけで従業員数のスイッチを操作できる", async ({ page }) => {
    await page.goto("/");

    const group = page.getByRole("group", { name: "従業員数" });
    await group.getByRole("button", { name: "〜300人" }).focus();
    await page.keyboard.press("Enter");

    await expect(group.getByRole("button", { name: "〜300人" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    const firstRow = page.getByRole("table").locator("tbody tr").first();
    await expect(firstRow).not.toContainText("株式会社キーエンス");
  });

  test("スイッチはもう一度押すと解除され、絞り込みが外れる", async ({ page }) => {
    await page.goto("/");
    const firstRow = page.getByRole("table").locator("tbody tr").first();
    const toggleButton = page
      .getByRole("group", { name: "従業員数" })
      .getByRole("button", { name: "〜300人" });

    await pressToggle(page, "従業員数", "〜300人");
    await expect(firstRow).not.toContainText("株式会社キーエンス");

    await pressToggle(page, "従業員数", "〜300人");
    await expect(toggleButton).toHaveAttribute("aria-pressed", "false");
    await expect(firstRow).toContainText("株式会社キーエンス");
  });
});

test.describe("フリーワード検索", () => {
  test("AC-6: 「商船三井」で「株式会社　商船三井」が引ける", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: "会社名で検索" }).fill("商船三井");

    const rows = page.getByRole("table").locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("株式会社　商船三井");
  });

  test("AC-6: 「ｷｰｴﾝｽ」（半角カナ）で「株式会社キーエンス」が引ける", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: "会社名で検索" }).fill("ｷｰｴﾝｽ");

    const rows = page.getByRole("table").locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("株式会社キーエンス");
  });

  test("検索はフィルタとANDで結合する", async ({ page }) => {
    await page.goto("/");
    await selectOption(page, "業種", "海運業");
    const rowsAfterIndustry = await page.getByRole("table").locator("tbody tr").count();

    await page.getByRole("searchbox", { name: "会社名で検索" }).fill("商船三井");
    const rows = page.getByRole("table").locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("株式会社　商船三井");
    expect(await rows.count()).toBeLessThan(rowsAfterIndustry);
  });

  test("キーボードだけで検索欄に入力できる", async ({ page }) => {
    await page.goto("/");
    const input = page.getByRole("searchbox", { name: "会社名で検索" });
    await input.focus();
    await page.keyboard.type("商船三井");

    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(1);
  });
});

test.describe("モバイル幅レイアウト", () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test("デスクトップ用の表は隠れ、カードリストが表示される。横スクロールは発生しない", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("table")).toBeHidden();
    await expect(page.locator("h1")).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasHorizontalScroll).toBe(false);
  });
});
