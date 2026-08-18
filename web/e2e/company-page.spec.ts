import { test, expect } from "@playwright/test";

// 数値は `docs/company/spec.md` §3 の受け入れ基準（2026-06 版データの実測値）。

test.describe("企業詳細ページ", () => {
  test("AC-1: /company/6861 にキーエンスの35歳時点の数値が出る", async ({ page }) => {
    await page.goto("/company/6861");

    await expect(page.getByRole("heading", { name: "株式会社キーエンス", level: 1 })).toBeVisible();
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
    await expect(page.getByText("2,178万円", { exact: true }).first()).toBeVisible();

    await expect(page.getByText("1位 / 1,867社（上位0.1%未満）")).toBeVisible();
    await expect(page.getByText("業界内順位（電気機器）")).toBeVisible();
    await expect(page.getByText("1位 / 150社")).toBeVisible();

    // 実測値（補正していない側）。
    await expect(page.getByText("35.0歳")).toBeVisible();
    await expect(page.getByText("11.3年")).toBeVisible();
    await expect(page.getByText("3,306人")).toBeVisible();
  });

  test("AC-2: 偏差値には上位◯%と、100を超えうる理由の注記が添えられている", async ({ page }) => {
    await page.goto("/company/6861");

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
    await page.goto("/company/7203");

    await expect(page.getByRole("heading", { name: "トヨタ自動車株式会社", level: 1 })).toBeVisible();
    await expect(page.getByText("859万円", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("120位 / 1,867社（上位6.4%）")).toBeVisible();
    await expect(page.getByText("2位 / 71社")).toBeVisible();
  });

  test("AC-3: 年齢スイッチで25歳を選ぶと金額と偏差値が変わり、ネットワークリクエストが発生しない", async ({
    page,
  }) => {
    await page.goto("/company/6861");

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

  test("既定の35歳はURLに出さない。戻るで一つ前の年齢に戻る", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(page).toHaveURL(/\/company\/6861$/);

    await page.getByRole("button", { name: "45歳" }).click();
    await expect(page).toHaveURL(/[?&]age=45/);

    await page.goBack();
    await expect(page).toHaveURL(/\/company\/6861$/);
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
  });

  test("AC-4: 25〜60歳のチャートが8点ぶんの金額と注記を持つ", async ({ page }) => {
    await page.goto("/company/6861");

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
    await page.goto("/company/E03532");

    await expect(page.getByRole("heading", { name: "株式会社みずほ銀行", level: 1 })).toBeVisible();
    await expect(page.getByText("755万円", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("280位 / 1,867社（上位15.0%）")).toBeVisible();
    await expect(page.getByText("17位 / 82社")).toBeVisible();
  });

  test("AC-6: 三菱商事に「本社のみ」バッジと、その意味の説明がある", async ({ page }) => {
    await page.goto("/company/8058");

    await expect(page.getByRole("heading", { name: "三菱商事株式会社", level: 1 })).toBeVisible();
    await expect(page.getByText("本社のみ", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("単体従業員数が連結の10%未満", { exact: false })).toBeVisible();
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

  test("AC-9: 推定であることの明示と、計算方法ページへの導線がある", async ({ page }) => {
    await page.goto("/company/6861");

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
    await page.getByRole("link", { name: "電気機器" }).click();

    await expect(page).toHaveURL(/[?&]ind=/);
    await expect(page.getByRole("combobox", { name: "業種" })).toContainText("電気機器");
  });
});
