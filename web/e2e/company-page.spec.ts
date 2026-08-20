import { test, expect } from "@playwright/test";

// 数値は `docs/company/spec.md` §3 の受け入れ基準（2026-06 版データの実測値）。
//
// C2 で h1 の直下にも順位を出すようにしたため、「1位 / 1,867社」のような文字列は
// ページ内に2か所ある。**カードの中の値**を見たいので `dl` に絞る。

/**
 * 大カードの順位リスト（全体順位・業界内順位・偏差値）。
 *
 * C3 でカードは2カラムになり、全体平均との差は `dl` の外の段落に、平均年齢・
 * 在籍年数・従業員数は2つ目の `dl` に移った。ここは1つ目の `dl` を指す。
 */
const card = (page: import("@playwright/test").Page) => page.locator("dl").first();

test.describe("企業詳細ページ", () => {
  // 既定は実測値（ADR-0007）。有報の平均年間給与そのままで、順位も偏差値も
  // 実測値の分布に対して出す。
  test("AC-1: /company/6861 は既定で有報の実測値を出す", async ({ page }) => {
    await page.goto("/company/6861");

    await expect(page.getByRole("heading", { name: "株式会社キーエンス", level: 1 })).toBeVisible();
    await expect(page.getByText("平均年収（有価証券報告書・単体）")).toBeVisible();
    await expect(page.getByText("2,178万円", { exact: true }).first()).toBeVisible();

    // 順位は実測値の分布に対する値。
    await expect(card(page).getByText("1位 /1,867社")).toBeVisible();
    await expect(card(page).getByText("1位 /150社")).toBeVisible();
    // 偏差値は単独で出さない（glossary）。上位◯%が同じ枠に添う。
    await expect(card(page).getByText("上位0.1%未満")).toBeVisible();
    // 全体平均との差は C3 で `dl` の外の段落に移した。
    await expect(page.getByText("全体平均 719万円 に対して")).toBeVisible();

    // 実測値では「推定」の語を出さない（spec AC-9）。
    await expect(page.getByText("35歳時点の推定年収")).toHaveCount(0);

    // 「有価証券報告書の実測値」の節。C3 で上部カードにも平均年齢・在籍年数・
    // 従業員数が並ぶようになったので、**節を特定してから**中を見る。
    const rawFacts = page.locator("section", { hasText: "補正していない実際の数字です" });
    await expect(rawFacts.getByText("35.0歳", { exact: true })).toBeVisible();
    await expect(rawFacts.getByText("11.3年", { exact: true })).toBeVisible();
    await expect(rawFacts.getByText("3,306人", { exact: true })).toBeVisible();
  });

  test("AC-1: /company/6861?age=35 でキーエンスの35歳時点の数値が出る", async ({ page }) => {
    await page.goto("/company/6861?age=35");

    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
    await expect(page.getByText("2,178万円", { exact: true }).first()).toBeVisible();
    await expect(card(page).getByText("1位 /1,867社")).toBeVisible();
    await expect(card(page).getByText("1位 /150社")).toBeVisible();
  });

  // 実測値のとき年齢スイッチは消さずに無効化する（ADR-0007）。
  test("AC-11: 実測値では年齢スイッチが無効で、押しても状態が変わらない", async ({ page }) => {
    await page.goto("/company/6861");

    const age25 = page.getByRole("button", { name: "25歳" });
    await expect(age25).toBeVisible();
    await expect(age25).toBeDisabled();

    await age25.click({ force: true });
    await expect(page).toHaveURL(/\/company\/6861$/);
    await expect(page.getByText("平均年収（有価証券報告書・単体）")).toBeVisible();
  });

  test("見せ方を「年齢そろえ」に切り替えると35歳の推定になり、URLに age=35 が出る", async ({
    page,
  }) => {
    await page.goto("/company/6861");

    await page.getByRole("button", { name: "年齢そろえ" }).click();

    await expect(page).toHaveURL(/[?&]age=35/);
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
    await expect(page.getByRole("button", { name: "25歳" })).toBeEnabled();
  });

  test("AC-2: 偏差値には上位◯%と、100を超えうる理由の注記が添えられている", async ({ page }) => {
    await page.goto("/company/6861?age=35");

    await expect(page.getByText("年収偏差値")).toBeVisible();

    // 偏差値は単独で置かず、必ず「上位◯%」を隣に持つ（spec.md §1.4）。
    // 同じ <dd> の中にあることでその隣接を確かめる。
    const deviation = page.locator("dd").filter({ hasText: /^150\.0/ });
    await expect(deviation).toBeVisible();
    await expect(deviation).toContainText("上位0.1%未満");

    await expect(page.getByText("年収の分布は右に裾を引くため、偏差値は100を超えることがあります")).toBeVisible();
    await expect(page.getByText("＋1,549万円")).toBeVisible();
    await expect(page.getByText("全体平均 629万円")).toBeVisible();
  });

  test("AC-2: /company/7203（トヨタ）の順位", async ({ page }) => {
    await page.goto("/company/7203?age=35");

    await expect(page.getByRole("heading", { name: "トヨタ自動車株式会社", level: 1 })).toBeVisible();
    await expect(page.getByText("859万円", { exact: true }).first()).toBeVisible();
    await expect(card(page).getByText("120位 /1,867社")).toBeVisible();
    await expect(card(page).getByText("上位6.4%")).toBeVisible();
    await expect(card(page).getByText("2位 /71社")).toBeVisible();
  });

  // 実測値と年齢そろえで順位が変わることを、平均年齢が高めのトヨタで固定する。
  test("AC-2: トヨタは実測値では1,006万円・121位", async ({ page }) => {
    await page.goto("/company/7203");

    await expect(page.getByText("1,006万円", { exact: true }).first()).toBeVisible();
    await expect(card(page).getByText("121位 /1,867社")).toBeVisible();
    await expect(card(page).getByText("上位6.5%")).toBeVisible();
    await expect(card(page).getByText("2位 /71社")).toBeVisible();
  });

  test("AC-3: 年齢スイッチで25歳を選ぶと金額と偏差値が変わり、ネットワークリクエストが発生しない", async ({
    page,
  }) => {
    await page.goto("/company/6861?age=35");

    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    await page.getByRole("button", { name: "25歳" }).click();

    await expect(page.getByText("25歳時点の推定年収")).toBeVisible();
    await expect(page.getByText("788万円", { exact: true }).first()).toBeVisible();
    await expect(page.locator("dd").filter({ hasText: /^127\.3/ })).toBeVisible();
    await expect(page.getByText("＋369万円")).toBeVisible();
    await expect(page).toHaveURL(/[?&]age=25/);

    expect(requests).toHaveLength(0);
  });

  test("AC-3: /company/6861?age=60 を直接開くと60歳の状態で復元される", async ({ page }) => {
    await page.goto("/company/6861?age=60");

    await expect(page.getByRole("button", { name: "60歳" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("2,213万円", { exact: true }).first()).toBeVisible();
  });

  // 既定（実測値）は age を出さない。年齢そろえなら35歳でも出す（ADR-0007）。
  test("実測値はURLにageを出さない。戻ると実測値に戻る", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(page).toHaveURL(/\/company\/6861$/);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);

    await page.getByRole("button", { name: "45歳" }).click();
    await expect(page).toHaveURL(/[?&]age=45/);

    await page.goBack();
    await expect(page).toHaveURL(/[?&]age=35/);
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/company\/6861$/);
    await expect(page.getByText("平均年収（有価証券報告書・単体）")).toBeVisible();
  });

  test("AC-4: 25〜60歳のチャートが8点ぶんの金額と注記を持つ", async ({ page }) => {
    await page.goto("/company/6861?age=35");

    const chart = page.getByRole("img", { name: /年齢別の推定年収/ });
    await expect(chart).toBeVisible();
    // 選択中の年齢が強調される（35歳の点が大きい）。
    await expect(chart.locator("circle[r='6']")).toHaveCount(1);
    await expect(chart.locator("circle")).toHaveCount(8);

    await expect(
      page.getByText("このカーブは1社の中の年齢ごとの水準であって、同じ人が歳を取っていく軌跡ではありません", {
        exact: false,
      })
    ).toBeVisible();
  });

  test("AC-5: 非上場のみずほ銀行はEDINETコードのURLで開ける", async ({ page }) => {
    await page.goto("/company/E03532?age=35");

    await expect(page.getByRole("heading", { name: "株式会社みずほ銀行", level: 1 })).toBeVisible();
    await expect(page.getByText("755万円", { exact: true }).first()).toBeVisible();
    await expect(card(page).getByText("280位 /1,867社")).toBeVisible();
    await expect(card(page).getByText("上位15.0%")).toBeVisible();
    await expect(card(page).getByText("17位 /82社")).toBeVisible();
  });

  test("AC-6: 三菱商事に「本社のみ」バッジと、その意味の説明がある", async ({ page }) => {
    await page.goto("/company/8058");

    await expect(page.getByRole("heading", { name: "三菱商事株式会社", level: 1 })).toBeVisible();
    await expect(page.getByText("本社のみ", { exact: true }).first()).toBeVisible();
    // C2 で「この会社の要点」にも同じ断りが入るので2か所ある。
    await expect(
      page.getByText("単体従業員数が連結の10%未満", { exact: false }).first()
    ).toBeVisible();
  });

  test("AC-7: 存在しないIDと旧形式の書類IDは404", async ({ request }) => {
    expect((await request.get("/company/s100yfah")).status()).toBe(404);
    expect((await request.get("/company/does-not-exist")).status()).toBe(404);
  });

  test("AC-8: ランキングの会社名から企業詳細ページへ遷移できる", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "株式会社キーエンス" }).click();

    await expect(page).toHaveURL(/\/company\/6861$/);
    await expect(page.getByRole("heading", { name: "株式会社キーエンス", level: 1 })).toBeVisible();
  });

  test("AC-9: 年齢そろえでは推定であることを明示し、計算方法ページへ導線がある", async ({ page }) => {
    await page.goto("/company/6861?age=35");

    await expect(page.getByText("推定", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("推定年収は年齢補正後の推定値です", { exact: false })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "計算方法と限界" })).toHaveAttribute(
      "href",
      "/about"
    );
    // 実額は「有価証券報告書の実測値」の節にまとめ、推定年収と同じ書式で並べない。
    await expect(page.getByRole("heading", { name: "有価証券報告書の実測値" })).toBeVisible();
  });

  // 実測値では推定バッジも「推定年収は…」の断りも出さない。出すと有報そのままの
  // 数字に推定の体裁を被せることになる（spec AC-9）。
  test("AC-9: 実測値では「推定」バッジも推定の断りも出さない", async ({ page }) => {
    await page.goto("/company/6861");

    await expect(page.getByText("推定", { exact: true })).toHaveCount(0);
    await expect(page.getByText("推定年収は年齢補正後の推定値です", { exact: false })).toHaveCount(
      0
    );
    await expect(page.getByText("実測値モードでは補正を行っていません", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "計算方法と限界" })).toHaveAttribute(
      "href",
      "/about"
    );
  });

  test("AC-10: JS実行前のHTMLに金額が入っている（SSR）", async ({ request }) => {
    const response = await request.get("/company/6861?age=25");
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html).toContain("788万円");
    expect(html).toContain("株式会社キーエンス");
    // 折れ線もサーバー側で描かれている。
    expect(html).toContain("<polyline");
  });

  test("モバイル幅で横スクロールが発生しない", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/company/6861");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("業種名からランキングの業種フィルタへ戻れる", async ({ page }) => {
    await page.goto("/company/6861");
    // C3 で「電気機器150社をすべて見る」が増えたため、パンくずのほうを厳密に指す。
    await page.getByRole("link", { name: "電気機器", exact: true }).click();

    await expect(page).toHaveURL(/[?&]ind=/);
    await expect(page.getByRole("combobox", { name: "業種" })).toContainText("電気機器");
  });
});
