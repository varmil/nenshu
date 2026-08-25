import { test, expect } from "@playwright/test";
import { collectPageRequests } from "./network";

// 数値は `docs/company/spec.md` §3 の受け入れ基準（2026-06 版データの実測値）。
//
// C2 で h1 の直下にも順位を出すようにしたため、「3位 / 2,961社」のような文字列は
// ページ内に2か所ある。**カードの中の値**を見たいので `dl` に絞る。

/**
 * 大カードの順位リスト（全体順位・業界内順位・偏差値）。
 *
 * C3 でカードは2カラムになり、全体平均との差は `dl` の外の段落に、平均年齢・
 * 在籍年数・従業員数は2つ目の `dl` に移った。ここは1つ目の `dl` を指す。
 */
const card = (page: import("@playwright/test").Page) =>
  // **カードの中に限る。** P1（#167）がページの先頭にレーダーの指標リスト
  // （これも `dl`）を置いたので、`page.locator("dl").first()` ではそちらを指す。
  page.locator('[data-slot="card"] dl').first();

/**
 * 年齢そろえに切り替え、指定の年齢を選ぶ。
 *
 * **`/company/6861?age=35` を直接開く形はもう使えない**（R1・ADR-0012）。企業詳細は
 * 全社を事前生成しており、表示基準は URL に出さずクライアントの状態としてだけ持つ。
 * 「年齢そろえ」の初期値は35歳（`DEFAULT_TARGET_AGE`）。
 */
async function alignToAge(page: import("@playwright/test").Page, age: number) {
  await page.getByRole("button", { name: "年齢そろえ" }).click();
  if (age !== 35) await page.getByRole("button", { name: `${age}歳` }).click();
}

test.describe("企業詳細ページ", () => {
  // 既定は実測値（ADR-0007）。有報の平均年間給与そのままで、順位も偏差値も
  // 実測値の分布に対して出す。
  test("AC-1: /company/6861 は既定で有報の実測値を出す", async ({ page }) => {
    await page.goto("/company/6861");

    await expect(page.getByRole("heading", { name: "株式会社キーエンス", level: 1 })).toBeVisible();
    await expect(page.getByText("平均年収（有価証券報告書・単体）")).toBeVisible();
    await expect(page.getByText("2,178万円", { exact: true }).first()).toBeVisible();

    // 順位は実測値の分布に対する値。**E2 で母集団を広げてキーエンスは3位になった**
    // （上はヒューリック 2,295万円・Ｍ＆Ａキャピタルパートナーズ 2,266万円）。
    await expect(card(page).getByText("3位 /2,961社")).toBeVisible();
    await expect(card(page).getByText("1位 /193社")).toBeVisible();
    // 全体平均との差は C3 で `dl` の外の段落に移した。
    await expect(page.getByText("全体平均 693万円 に対して")).toBeVisible();

    // 実測値では「推定」の語を出さない（spec AC-9）。
    await expect(page.getByText("35歳時点の推定年収")).toHaveCount(0);

    // 「有価証券報告書の実測値」の節。C3 で上部カードにも平均年齢・在籍年数・
    // 従業員数が並ぶようになったので、**節を特定してから**中を見る。
    const rawFacts = page.locator("section", { hasText: "補正していない実際の数字です" });
    await expect(rawFacts.getByText("35.0歳", { exact: true })).toBeVisible();
    await expect(rawFacts.getByText("11.3年", { exact: true })).toBeVisible();
    await expect(rawFacts.getByText("3,306人", { exact: true })).toBeVisible();
  });

  test("AC-1: 年齢そろえ（35歳）でキーエンスの35歳時点の数値が出る", async ({ page }) => {
    await page.goto("/company/6861");
    await alignToAge(page, 35);

    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
    await expect(page.getByText("2,178万円", { exact: true }).first()).toBeVisible();
    await expect(card(page).getByText("2位 /2,961社")).toBeVisible();
    await expect(card(page).getByText("1位 /193社")).toBeVisible();
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

  // 表示基準は URL に出さない（R1・ADR-0012）。切り替えても URL は素のまま。
  test("見せ方を「年齢そろえ」に切り替えると35歳の推定になり、URLは変わらない", async ({
    page,
  }) => {
    await page.goto("/company/6861");

    await page.getByRole("button", { name: "年齢そろえ" }).click();

    await expect(page).toHaveURL(/\/company\/6861$/);
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
    await expect(page.getByRole("button", { name: "25歳" })).toBeEnabled();
  });

  /*
   * **上位◯%も、100を超えうる理由の注記も、このページには置かない**（運営者の判断。
   * 2026-08-20 の `d041d01`）。水準は同じ視界にある順位と位置バーで読ませる——
   * **偏差値だけが単独で置かれた画面を作らない**線（glossary）はこれで保たれている。
   * 注記そのものはランキングの表・カードの脚注と `/about` に残っており、そちらは
   * `e2e/ranking-refresh.spec.ts` と `e2e/about.spec.ts` が持つ。
   */
  test("AC-2: 偏差値は数字だけを出し、順位と位置バーが同じ視界にある", async ({
    page,
  }) => {
    await page.goto("/company/6861");
    await alignToAge(page, 35);

    await expect(page.getByText("年収偏差値")).toBeVisible();
    const deviation = page.locator("dd").filter({ hasText: /^149\.5$/ });
    await expect(deviation).toBeVisible();
    await expect(page.getByText("上位0.1%未満")).toHaveCount(0);
    await expect(page.getByText("偏差値は100を超えることがあります")).toHaveCount(0);
    await expect(page.getByText(/偏差値は分布が右に裾を引くため/)).toHaveCount(0);

    // 偏差値と同じ視界に置く順位・位置バーは残っている（単独で置かないための担保）。
    await expect(card(page).getByText("2位 /2,961社")).toBeVisible();
    await expect(page.getByText("全体2,961社の中の位置")).toBeVisible();

    await expect(page.getByText("＋1,562万円")).toBeVisible();
    await expect(page.getByText("全体平均 616万円")).toBeVisible();
  });

  test("AC-2: /company/7203（トヨタ）の順位", async ({ page }) => {
    await page.goto("/company/7203");
    await alignToAge(page, 35);

    await expect(page.getByRole("heading", { name: "トヨタ自動車株式会社", level: 1 })).toBeVisible();
    await expect(page.getByText("859万円", { exact: true }).first()).toBeVisible();
    await expect(card(page).getByText("169位 /2,961社")).toBeVisible();
    await expect(card(page).getByText("2位 /79社")).toBeVisible();
  });

  // 実測値と年齢そろえで順位が変わることを、平均年齢が高めのトヨタで固定する。
  test("AC-2: トヨタは実測値では1,006万円・162位", async ({ page }) => {
    await page.goto("/company/7203");

    await expect(page.getByText("1,006万円", { exact: true }).first()).toBeVisible();
    await expect(card(page).getByText("162位 /2,961社")).toBeVisible();
    await expect(card(page).getByText("2位 /79社")).toBeVisible();
  });

  test("AC-3: 年齢スイッチで25歳を選ぶと金額と偏差値が変わり、ネットワークリクエストが発生しない", async ({
    page,
  }) => {
    await page.goto("/company/6861");
    await alignToAge(page, 35);

    const requests = collectPageRequests(page);

    await page.getByRole("button", { name: "25歳" }).click();

    await expect(page.getByText("25歳時点の推定年収")).toBeVisible();
    await expect(page.getByText("788万円", { exact: true }).first()).toBeVisible();
    await expect(page.locator("dd").filter({ hasText: /^125\.7/ })).toBeVisible();
    await expect(page.getByText("＋373万円")).toBeVisible();
    await expect(page).toHaveURL(/\/company\/6861$/);

    expect(requests).toHaveLength(0);
  });

  test("AC-3: 60歳を選ぶと60歳の金額になる", async ({ page }) => {
    await page.goto("/company/6861");
    await alignToAge(page, 60);

    await expect(page.getByRole("button", { name: "60歳" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("2,213万円", { exact: true }).first()).toBeVisible();
  });

  /*
   * 配ってしまった `?age=N` のリンク（R1 より前に共有されたもの）。**読まないが、
   * URL からは落とす**——落とさないと「URLは60歳・画面は実測値」が残り続ける
   * （親 Issue #130 が報告したのはこの形）。`replaceState` なので履歴は増えない。
   */
  test("古い `?age=N` のリンクは実測値で開き、URLから age が落ちる", async ({ page }) => {
    await page.goto("/company/6861?age=60");

    await expect(page.getByText("平均年収（有価証券報告書・単体）")).toBeVisible();
    await expect(page).toHaveURL(/\/company\/6861$/);
    await expect(page.getByRole("button", { name: "60歳" })).toBeDisabled();
  });

  // 表示基準はクライアントの状態だけで持ち、URL にも履歴にも出さない（ADR-0012）。
  test("表示基準を切り替えても URL は変わらず、履歴も増えない", async ({ page }) => {
    await page.goto("/about");
    await page.goto("/company/6861");

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("button", { name: "45歳" }).click();
    await expect(page.getByText("45歳時点の推定年収")).toBeVisible();
    await expect(page).toHaveURL(/\/company\/6861$/);

    // 2回操作したが履歴は積まれていないので、1度戻れば `/about` に着く。
    await page.goBack();
    await expect(page).toHaveURL(/\/about$/);
  });

  test("AC-4: 25〜60歳のチャートが8点ぶんの金額と注記を持つ", async ({ page }) => {
    await page.goto("/company/6861");
    await alignToAge(page, 35);

    const chart = page.getByRole("img", { name: /年齢別の推定年収/ });
    await expect(chart).toBeVisible();
    // 選択中の年齢が強調される（35歳の点が大きい）。
    await expect(chart.locator("circle[r='6']")).toHaveCount(1);
    await expect(chart.locator("circle")).toHaveCount(8);

    /*
     * **figcaption に残る注記は ±20% の帯の意味だけ**（運営者の判断。`d041d01`）。
     * 「0起点ではない」は各点の金額を数値で併記していることで、「個人の軌跡ではない」は
     * `/about` の同じ文で担保する（`e2e/about.spec.ts`）。**帯だけを見ると信頼区間に
     * 見える**ので、図の側の断りはここから外さない。
     */
    await expect(
      page.getByText("目安の幅であって統計的な信頼区間ではありません", { exact: false })
    ).toBeVisible();
    await expect(page.getByText(/歳を取っていく軌跡/)).toHaveCount(0);
    // 0起点ではない代わりの併記——8点ぶんの金額が数値で読める。
    await expect(chart.locator("text").filter({ hasText: /^2,178$/ })).toHaveCount(1);
  });

  test("AC-5: 非上場のみずほ銀行はEDINETコードのURLで開ける", async ({ page }) => {
    await page.goto("/company/E03532");
    await alignToAge(page, 35);

    await expect(page.getByRole("heading", { name: "株式会社みずほ銀行", level: 1 })).toBeVisible();
    await expect(page.getByText("755万円", { exact: true }).first()).toBeVisible();
    await expect(card(page).getByText("383位 /2,961社")).toBeVisible();
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
    await page.goto("/company/6861");
    await alignToAge(page, 35);

    // 見出しそのものが「35歳時点の推定年収」なので、隣に「推定」バッジは重ねない
    // （Issue #128）。AC-9 は見出しの語と下の断り書きで満たしている。
    await expect(page.getByText("推定", { exact: true })).toHaveCount(0);
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
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

  // 実測値では「推定」の語も「推定年収は…」の断りも出さない。出すと有報そのままの
  // 数字に推定の体裁を被せることになる（spec AC-9）。
  test("AC-9: 実測値では「推定」の語も推定の断りも出さない", async ({ page }) => {
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

  /*
   * **事前生成した HTML に実測値が入っている**（R1・ADR-0012）。表示基準は URL に
   * 出さないので、どのURLで開いても HTML は同じ実測値のもの。年齢そろえはこの HTML の
   * 上でクライアントが切り替える。
   */
  test("AC-10: JS実行前のHTMLに実測値の金額が入っている", async ({ request }) => {
    const response = await request.get("/company/6861");
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html).toContain("2,178万円");
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

/**
 * 企業ページを離れて戻ってくる（Issue #108）。**表示基準は URL に出さないので
 * 戻ると実測値に戻る**（R1・ADR-0012）。ランキング側の絞り込み・ページ番号は
 * これまでどおり URL が正で、復元される（`e2e/ranking-url-sync.spec.ts`）。
 */
test.describe("ランキングとの行き来", () => {
  test("年齢そろえにしてランキングへ行き、戻ると実測値で開く", async ({ page }) => {
    await page.goto("/company/6861");
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();

    await page.getByRole("link", { name: "ランキング" }).first().click();
    await expect(page).toHaveURL(/\/$/);

    await page.goBack();

    await expect(page).toHaveURL(/\/company\/6861$/);
    await expect(page.getByText("平均年収（有価証券報告書・単体）")).toBeVisible();
  });
});
