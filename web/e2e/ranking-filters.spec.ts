import { test, expect } from "./appTest";

/**
 * 絞り込み4種とフリーワード検索（U3・U4）。
 *
 * **どの会社が残るか**（区分の件数・AND の結合・表記ゆれの正規化）は
 * `lib/filter.test.ts`・`lib/rank.test.ts`・`lib/search.test.ts` が固定している。
 * ここで見るのは**操作の種類ごとに1本**——Select（Portal に描かれる）・
 * ToggleGroup（3択のスイッチ）・検索欄——が画面と URL に届くことと、
 * キーボードだけで操作できること。
 *
 * モバイル幅の横スクロールは `ranking-refresh.spec.ts` の
 * 「モバイルの行が縮んでも数値が残る」にまとめてある（U3 で実際に検出したバグ）。
 * 操作でネットワークが起きないことは `ranking-url-sync.spec.ts` にある。
 */

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

const rows = (page: import("@playwright/test").Page) =>
  page.getByRole("table").locator("tbody tr");

/*
 * U12 で絞り込みは左サイドバーへ、検索は共通ヘッダへ移った。
 *
 * Issue #72。未選択のとき `placeholder` に任せると、センチネル値の `__all__` が
 * そのままトリガーに出ていた（公開中のサイトに出ていた表示崩れ）。
 */
test("初期表示: 絞り込み4種の可視ラベルがサイドバーに出て、業種は「すべて」と出る", async ({
  page,
}) => {
  await page.goto("/");
  const sidebar = page.locator("aside");
  for (const label of ["業種", "従業員数", "在籍年数", "平均年齢"]) {
    await expect(sidebar.getByText(label, { exact: true })).toBeVisible();
  }

  const trigger = page.getByRole("combobox", { name: "業種" });
  await expect(trigger).toContainText("すべて");
  await expect(trigger).not.toContainText("__all__");
});

test.describe("フィルタ", () => {
  /*
   * **2ページ目から選ぶ。** `page` を1に戻すのは `RankingApp` の `applyFilter` 1か所で、
   * 並び替え・表示基準も同じ経路を通る（`ranking-refresh.spec.ts` の並び替えでも見ている）。
   */
  test("AC-3: 業種で「海運業」を選ぶと9社になり、順位が振り直され、1ページ目に戻る", async ({
    page,
  }) => {
    await page.goto("/?page=2");
    await selectOption(page, "業種", "海運業");

    await expect(page).toHaveURL(/\/\?ind=%E6%B5%B7%E9%81%8B%E6%A5%AD$/);
    await expect(rows(page)).toHaveCount(9);
    // 順位はロゴ左上のバッジ。読み上げ用の「位」が textContent に付く。
    await expect(rows(page).first().locator("[data-rank-badge]")).toHaveText("1位");
  });

  /*
   * 1ページの行数は PAGE_SIZE で頭打ちなので、効いたかどうかは件数表示で見る
   * （Issue #103）。解除して全社に戻ることも同じ表示で見る。
   */
  test("AC-4: 従業員数で「1,000人以上」を選ぶと803社に絞られ、もう一度押すと解除される", async ({
    page,
  }) => {
    await page.goto("/");
    await pressToggle(page, "従業員数", "1,000人以上");

    await expect(page.getByText("803社 中 1〜30社目")).toBeVisible();
    // 列は3つで、従業員数は社名の下の meta 行にある（順位の列は無い）。
    const metaCells = await rows(page).locator("td").first().allTextContents();
    for (const cell of metaCells) {
      const employees = Number(cell.match(/・\s*([\d,]+)人/)![1].replace(/,/g, ""));
      expect(employees).toBeGreaterThanOrEqual(1000);
    }

    await pressToggle(page, "従業員数", "1,000人以上");
    await expect(
      page.getByRole("group", { name: "従業員数" }).getByRole("button", { name: "1,000人以上" })
    ).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("2,961社 中 1〜30社目")).toBeVisible();
  });

  /*
   * キーボードだけで3種類の部品を操作できる（CLAUDE.md「開発上の約束」のキーボード操作）。
   *
   * - 業種: **行数では判定できない**——1ページは PAGE_SIZE 件で頭打ちなので、
   *   絞り込みが効いていなくても行数は同じ。総件数の表示が減ったかで見る（Issue #103）。
   * - 従業員数: 3区分（1,049/1,109/803）はいずれも PAGE_SIZE より多いので、キーエンス
   *   （3,306人、「〜300人」には該当しない）が表から外れるかで見る。**1位の行では
   *   見ない**——E2 で1位になったヒューリックは234人で、「〜300人」でも残ってしまう。
   */
  test("キーボードだけで業種・従業員数・検索欄を操作できる", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByRole("combobox", { name: "業種" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/[?&]ind=/);
    await expect(page.getByText("2,961社 中")).toHaveCount(0);
    expect(await rows(page).count()).toBeGreaterThan(0);

    await page.goto("/");
    const group = page.getByRole("group", { name: "従業員数" });
    await group.getByRole("button", { name: "〜300人" }).focus();
    await page.keyboard.press("Enter");
    await expect(group.getByRole("button", { name: "〜300人" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByRole("table")).not.toContainText("株式会社キーエンス");

    await page.goto("/");
    await page.getByRole("searchbox", { name: "会社名で検索" }).focus();
    await page.keyboard.type("商船三井");
    await expect(rows(page)).toHaveCount(1);
  });
});

// 表記ゆれ（半角カナ・全角空白）の照合は `lib/search.test.ts` が持つ。
test("AC-6: 検索欄に「商船三井」と打つと「株式会社　商船三井」だけが残る", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "会社名で検索" }).fill("商船三井");

  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("株式会社　商船三井");
});
