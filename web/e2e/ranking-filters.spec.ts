import { test, expect } from "./appTest";
import { countText, pageDataOf } from "./rankingData";

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
 *
 * **絞り込みが効いたかは、件数表示をそのURLのデータと突き合わせて見る**
 * （`rankingPageData`＝`/` が画面を組むのと同じ関数）。社数を書き写すと、毎日の更新で
 * 1社動いただけで落ちる（refresh の D0・Issue #870）。行数は PAGE_SIZE で頭打ちなので
 * 判定に使わない（Issue #103）。
 */

/**
 * 業種セレクトを開いて選択肢をクリックする。
 * base-ui の Select はポップアップを Portal で document.body 直下に描画するため、
 * トリガーの role=combobox と、開いた後の role=option で操作する。
 */
async function selectOption(
  page: import("@playwright/test").Page,
  filterLabel: string,
  optionLabel: string
) {
  await page.getByRole("combobox", { name: filterLabel }).click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
}

/**
 * 従業員数・在籍年数・平均年齢はToggleGroup（3択のスイッチ）。
 * ToggleGroupはrole=groupでaria-labelを持ち、各選択肢はrole=buttonになる。
 */
async function pressToggle(
  page: import("@playwright/test").Page,
  filterLabel: string,
  optionLabel: string
) {
  await page
    .getByRole("group", { name: filterLabel })
    .getByRole("button", { name: optionLabel, exact: true })
    .click();
}

const rows = (page: import("@playwright/test").Page) => page.getByRole("table").locator("tbody tr");

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
  test("AC-3: 業種で「海運業」を選ぶと海運業の会社に絞られ、順位が振り直され、1ページ目に戻る", async ({
    page,
  }) => {
    await page.goto("/?page=2");
    await selectOption(page, "業種", "海運業");

    await expect(page).toHaveURL(/\/\?ind=%E6%B5%B7%E9%81%8B%E6%A5%AD$/);
    await expect(countText(page, "ind=海運業")).toBeVisible();
    // 順位はロゴ左上のバッジ。読み上げ用の「位」が textContent に付く。
    await expect(rows(page).first().locator("[data-rank-badge]")).toHaveText("1位");
  });

  /*
   * 1ページの行数は PAGE_SIZE で頭打ちなので、効いたかどうかは件数表示で見る
   * （Issue #103）。解除して全社に戻ることも同じ表示で見る。
   */
  test("AC-4: 従業員数で「1,000人以上」を選ぶとその区分の会社に絞られ、もう一度押すと解除される", async ({
    page,
  }) => {
    await page.goto("/");
    await pressToggle(page, "従業員数", "1,000人以上");

    await expect(countText(page, "emp=1000-")).toBeVisible();
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
    await expect(countText(page, "")).toBeVisible();
  });

  /*
   * キーボードだけで3種類の部品を操作できる（CLAUDE.md「開発上の約束」のキーボード操作）。
   *
   * どれも**行数では判定できない**——1ページは PAGE_SIZE 件で頭打ちなので、絞り込みが
   * 効いていなくても行数は同じ。件数表示が、そのURLのデータから数えた件数になるかで
   * 見る（Issue #103）。業種はキーボードで選んだ先を書き写さず、遷移した URL から引く。
   */
  test("キーボードだけで業種・従業員数・検索欄を操作できる", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByRole("combobox", { name: "業種" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/[?&]ind=/);
    await expect(countText(page, new URL(page.url()).search)).toBeVisible();

    await page.goto("/");
    const group = page.getByRole("group", { name: "従業員数" });
    await group.getByRole("button", { name: "〜300人" }).focus();
    await page.keyboard.press("Enter");
    await expect(group.getByRole("button", { name: "〜300人" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(countText(page, "emp=-300")).toBeVisible();

    await page.goto("/");
    await page.getByRole("searchbox", { name: "会社名で検索" }).focus();
    await page.keyboard.type("商船三井");
    await expect(countText(page, "q=商船三井")).toBeVisible();
  });
});

/*
 * 表記ゆれ（半角カナ・全角空白）の照合は `lib/search.test.ts` が持つ。
 *
 * 残る会社は書き写さず、同じ語で絞ったデータと突き合わせる。何社残るかは社名の
 * 並び次第なので決め打ちしない——**1社も残らなければ前提が崩れているので落とす**
 * （商船三井が掲載から外れたとき、0件の画面で空振りして通らないように）。
 */
test("AC-6: 検索欄に「商船三井」と打つと、社名に「商船三井」を含む会社だけが残る", async ({
  page,
}) => {
  const expected = pageDataOf("q=商船三井").bootstrap.page.companies;
  expect(expected.length, "社名に「商船三井」を含む会社").toBeGreaterThan(0);

  await page.goto("/");
  await page.getByRole("searchbox", { name: "会社名で検索" }).fill("商船三井");

  await expect(countText(page, "q=商船三井")).toBeVisible();
  await expect(rows(page)).toHaveCount(expected.length);
  for (const [i, company] of expected.entries()) {
    await expect(rows(page).nth(i)).toContainText(company.name);
  }
});
