import type { Page } from "@playwright/test";
import { test, expect } from "./appTest";
import { collectPageRequests } from "./network";

/**
 * 企業詳細ページ（C1）の骨格——表示基準の切替・年齢スイッチ・URL と履歴・ID・初期 HTML・
 * ランキングとの行き来。
 *
 * **金額・順位・偏差値の値そのものは `features/company/lib/view.test.ts` と
 * `cardFacts.test.ts` が spec（`docs/company/spec.md` §3）の数値で固定している。** ここは
 * 操作が画面に届くことを、キーエンス（6861）の数値を手がかりに見る。
 *
 * **`/company/6861?age=35` を直接開く形はもう使えない**（R1・ADR-0012）。企業詳細は
 * 全社を事前生成しており、表示基準は URL に出さずクライアントの状態としてだけ持つ。
 * 「年齢そろえ」の初期値は35歳（`DEFAULT_TARGET_AGE`）。
 */

const KEYENCE_DOC_URL = "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100YAHE,,";

/**
 * 大カードの順位の段（全体順位・業界内順位）。**何番目かでは引かず、中身で引く**
 * ——C14（#818）で段の並びを変えた。**カードの中に限る**——P1（#167）のレーダーの
 * 指標リストも `dl`。
 */
const card = (page: Page) => page.locator('[data-slot="card"] dl').filter({ hasText: "全体順位" });

/**
 * 表示基準と独立な節の中身（spec AC-23・AC-30・AC-14・timeseries AC-8・AC-22・performance AC-11）。
 * 名前つきで返すので、どれが動いたかが差分に出る。
 */
async function independentSections(page: Page): Promise<Record<string, string | null>> {
  const byHeading = (name: string) =>
    page.getByRole("heading", { name }).locator("xpath=..").textContent();
  return {
    説明文: await page.getByText("電子応用機器の開発、製造及び販売を主な事業とする。").textContent(),
    分析: await page.getByTestId("company-analysis").textContent(),
    要約: await page.getByTestId("company-digest").textContent(),
    年齢別の説明文: await page
      .getByRole("heading", { name: "年齢別の推定年収" })
      .locator("xpath=..")
      .locator("p", { hasText: "年齢別に見ると" })
      .textContent(),
    実測値: await page
      .locator("section", { has: page.getByRole("heading", { name: /^有価証券報告書の実測値/ }) })
      .textContent(),
    平均年収推移: await byHeading("平均年収推移（過去10年間）"),
    在籍年数推移: await byHeading("在籍年数推移（過去10年間）"),
    稼ぐ力の推移: await byHeading("稼ぐ力の推移（過去10年間）"),
  };
}

test.describe("企業詳細ページ", () => {
  /*
   * 既定は実測値（ADR-0007）。**実測値では「推定」の語も推定の断りも出さない**——出すと
   * 有報そのままの数字に推定の体裁を被せることになる（spec AC-9）。**年齢そろえでも
   * 「推定」は1画面に1回**——見出しそのものが「35歳時点の推定年収」なので、隣に「推定」
   * バッジを重ねない（Issue #128）。
   */
  test("AC-1・AC-9: 既定は有報の実測値で「推定」を出さず、年齢そろえでは推定であることと計算方法への導線を出す", async ({
    page,
  }) => {
    await page.goto("/company/6861");

    await expect(page.getByRole("heading", { name: "株式会社キーエンス", level: 1 })).toBeVisible();
    await expect(page.getByText("平均年収（有価証券報告書・単体）")).toBeVisible();
    await expect(page.getByText("2,178万円", { exact: true }).first()).toBeVisible();
    // 金額の直下は有報の値を言い直す1文。全体平均との差は置かない（C15・#821）。
    await expect(
      page.getByText(
        "株式会社キーエンスの最新の有価証券報告書に基づく平均年収は 約2,178万円（平均年齢35.0歳）です。"
      )
    ).toBeVisible();
    await expect(page.getByText(/全体平均 [\d,]+万円 に対して/)).toHaveCount(0);

    await expect(page.getByText("推定", { exact: true })).toHaveCount(0);
    await expect(page.getByText("35歳時点の推定年収")).toHaveCount(0);
    await expect(page.getByText("推定年収は年齢補正後の推定値です", { exact: false })).toHaveCount(0);
    await expect(page.getByText("実測値モードでは補正を行っていません", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "計算方法と限界" })).toHaveAttribute("href", "/about");

    await page.getByRole("button", { name: "年齢そろえ" }).click();

    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
    await expect(page.getByText("推定", { exact: true })).toHaveCount(0);
    await expect(page.getByText("推定年収は年齢補正後の推定値です", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "計算方法と限界" })).toHaveAttribute("href", "/about");
  });

  /*
   * 実測値のとき年齢スイッチは**消さずに無効化する**（ADR-0007）。消すと切り替えて何が
   * 増えるのか分からない。帯は破線で残り、何のための操作かをヒントで言う。
   */
  test("AC-11: 実測値では年齢の帯が残り、スイッチは無効で、押しても状態が変わらない", async ({
    page,
  }) => {
    await page.goto("/company/6861");

    // **`exact` が要る。** W1（#150）の節の説明文が本文で「見せ方」を参照している。
    await expect(page.getByText("見せ方", { exact: true })).toBeVisible();
    // 平均年齢はカードの中にも出ているので、帯のヒントには繰り返さない（Issue #128）。
    await expect(page.getByText("有価証券報告書の数値そのまま", { exact: true })).toBeVisible();
    await expect(page.getByText("「年齢そろえ」のときだけ使います")).toBeVisible();

    const age25 = page.getByRole("button", { name: "25歳" });
    await expect(age25).toBeDisabled();
    await age25.click({ force: true });
    await expect(page).toHaveURL(/\/company\/6861$/);
    await expect(page.getByText("平均年収（有価証券報告書・単体）")).toBeVisible();
  });

  /*
   * **表示基準と年齢の切替を1本で見る。** 変わるのは推定年収まわり（金額・順位・偏差値）
   * だけで、**基準と独立な節は1文字も動かず、ネットワークも URL も動かない**。
   *
   * 以前は「変わらない」を節ごとに別のテストで確かめていた（説明文 C7 AC-23・要約と分析
   * C10 AC-30・推移 T1 AC-8・稼ぐ力 P2 AC-11・年齢別の説明文 C4 AC-14・近傍 AC-12 の
   * ネットワーク）。どれも同じ操作の後で同じページを見ていたので、ここに寄せた。
   * 残業・有給・男女の賃金の差異は `company-worklife.spec.ts`、レーダーは `company-radar.spec.ts`。
   */
  test("AC-3: 年齢そろえと年齢スイッチで推定年収だけが変わり、独立な節もネットワークも URL も動かない", async ({
    page,
  }) => {
    await page.goto("/company/6861");
    const before = await independentSections(page);
    const requests = collectPageRequests(page);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
    await expect(page.getByRole("button", { name: "25歳" })).toBeEnabled();

    await page.getByRole("button", { name: "25歳" }).click();
    await expect(page.getByText("25歳時点の推定年収")).toBeVisible();
    await expect(page.getByText("788万円", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("偏差値 125.7", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "60歳" }).click();
    await expect(page.getByRole("button", { name: "60歳" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("2,213万円", { exact: true }).first()).toBeVisible();

    expect(requests).toHaveLength(0);
    await expect(page).toHaveURL(/\/company\/6861$/);
    expect(await independentSections(page)).toEqual(before);
  });

  /*
   * **上位◯%も、100を超えうる理由の注記も、このページには置かない**（運営者の判断。
   * 2026-08-20 の `d041d01`）。水準は同じ視界にある順位と位置バーで読ませる——
   * **偏差値だけが単独で置かれた画面を作らない**線（glossary）はこれで保たれている。
   * **偏差値は位置バーの見出しの隣に出す**（#831 でカードの順位の段から外した）。
   * 注記そのものはランキングの表・カードの脚注と `/about` に残っており、そちらは
   * `e2e/ranking-refresh.spec.ts` と `e2e/about.spec.ts` が持つ。
   */
  test("AC-2: 偏差値は数字だけを出し、順位と位置バーが同じ視界にある", async ({ page }) => {
    await page.goto("/company/6861");
    await page.getByRole("button", { name: "年齢そろえ" }).click();

    await expect(page.getByText("偏差値 149.5", { exact: true })).toBeVisible();
    await expect(page.getByText("上位0.1%未満")).toHaveCount(0);
    await expect(page.getByText("偏差値は100を超えることがあります")).toHaveCount(0);
    await expect(page.getByText(/偏差値は分布が右に裾を引くため/)).toHaveCount(0);

    await expect(card(page).getByText("2位 /2,961社")).toBeVisible();
    await expect(page.getByText("全体2,961社の中の位置")).toBeVisible();
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
  test("表示基準を切り替えても履歴は増えない", async ({ page }) => {
    await page.goto("/about");
    await page.goto("/company/6861");

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("button", { name: "45歳" }).click();
    await expect(page.getByText("45歳時点の推定年収")).toBeVisible();

    // 2回操作したが履歴は積まれていないので、1度戻れば `/about` に着く。
    await page.goBack();
    await expect(page).toHaveURL(/\/about$/);
  });

  /*
   * 実測値には年齢の概念が無いので、折れ線は出しつつどの点も強調しない。**0起点ではない
   * 代わりに各点の金額を数値で併記する**ので、8点ぶんの金額が図の中で読める。
   * **図に添える注記は ±20% の帯の意味だけ**（spec AC-4・2026-08-20 改訂）。その断り
   * （信頼区間ではない）は `company-refresh.spec.ts` の AC-14 が見る。「個人の軌跡ではない」は
   * `/about` に移した。
   */
  test("AC-4: 25〜60歳のチャートが8点ぶんの金額を持ち、選んだ年齢だけを強調する", async ({ page }) => {
    await page.goto("/company/6861");
    const chart = page.getByRole("img", { name: /年齢別の推定年収/ });
    await expect(chart.locator("circle")).toHaveCount(8);
    await expect(chart.locator("circle[r='6']")).toHaveCount(0);
    await expect(page.getByText(/歳を取っていく軌跡/)).toHaveCount(0);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(chart.locator("circle[r='6']")).toHaveCount(1);
    await expect(chart.locator("text").filter({ hasText: /^2,178$/ })).toHaveCount(1);
  });

  /*
   * ID は証券コード（上場）かEDINETコード（非上場）（ADR-0006）。一覧に無い ID は
   * ビルド時に生成されないので 404（`docs/runtime/cpu-budget/design.md`）。
   */
  test("AC-5・AC-7: EDINETコードのIDで開け、存在しないIDと旧形式の書類IDは404", async ({ request }) => {
    const mizuho = await request.get("/company/E03532");
    expect(mizuho.status()).toBe(200);
    expect(await mizuho.text()).toContain("株式会社みずほ銀行");

    expect((await request.get("/company/s100yfah")).status()).toBe(404);
    expect((await request.get("/company/does-not-exist")).status()).toBe(404);
  });

  test("AC-6: 三菱商事に「本社のみ」バッジと、その意味の説明がある", async ({ page }) => {
    await page.goto("/company/8058");

    await expect(page.getByRole("heading", { name: "三菱商事株式会社", level: 1 })).toBeVisible();
    await expect(page.getByText("本社のみ", { exact: true }).first()).toBeVisible();
    // 断りはフッタにある（C11・#799 で「この会社の要点」を外すまでは2か所だった）。
    await expect(page.getByText("単体従業員数が連結の10%未満", { exact: false }).first()).toBeVisible();
  });

  /*
   * **事前生成した HTML に各節の中身が入っている**（R1・ADR-0012）。表示基準は URL に
   * 出さないので、どのURLで開いても HTML は同じ実測値のもの。クライアントの描画待ちに
   * すると、クローラにも読み込みの遅い端末にも届かない（spec 2. SEO）。
   *
   * **1社ぶんの生 HTML を1回取って、節ごとに見る**（以前は C1・C4・C7・C12・C13・P2 の
   * 各ファイルが同じ HTML をそれぞれ取っていた）。要約と分析が props に入っていない
   * （1回ずつしか出ない）ことは `company-analysis.spec.ts` が見る。
   */
  test("AC-10: JS実行前のHTMLに各節の中身が入り、送るのはその会社の1社ぶんだけ（/ には入らない）", async ({
    request,
  }) => {
    const response = await request.get("/company/6861");
    expect(response.status()).toBe(200);
    const html = await response.text();

    for (const [label, text] of [
      ["社名", "株式会社キーエンス"],
      ["実測値の金額（C1）", "2,178万円"],
      ["年齢別の折れ線（C1）", "<polyline"],
      ["到達年齢の文（C4）", "30歳で1,200万円"],
      ["実測値の文（C4）", "平均勤続年数は11.3年"],
      ["説明文（C7 AC-21）", "電子応用機器の開発、製造及び販売を主な事業とする。"],
      ["このページの出典（C12 AC-16）", "このページの出典"],
      ["有報への直リンク（C13 AC-31）", KEYENCE_DOC_URL],
      ["有報への直リンクの文言（C13 AC-31）", "この会社の有価証券報告書"],
      ["在籍年数の推移（T4）", "在籍年数推移（過去10年間）"],
      ["在籍年数の業種の中央値（T4）", "業種の中央値"],
      ["稼ぐ力の推移（P2）", "稼ぐ力の推移（過去10年間）"],
      ["稼ぐ力の経常利益（P2）", "億円"],
    ] as const) {
      expect(html, label).toContain(text);
    }

    // 本文の先頭は平均年収カードで、レーダーはその後ろ（C15・spec AC-33）。カードには見出しが
    // 無いので、DOM の上下は `company-refresh.spec.ts` の「節の並び」が見る。
    const cardAt = html.indexOf("平均年収（有価証券報告書・単体）");
    expect(cardAt, "平均年収カード").toBeGreaterThan(-1);
    expect(html.indexOf("公開資料による全体像"), "カード → レーダーの順").toBeGreaterThan(cardAt);

    /*
     * spec が外したと明記している節（AC-11・AC-16）。**生の HTML で見る**——ハイドレーション後の
     * DOM だけだと、サーバーが描いてクライアントが消す形でも通ってしまう。
     */
    expect(html, "この会社の要点（AC-11）").not.toContain("この会社の要点");
    expect(html, "この数字の作り方（AC-16）").not.toContain("この数字の作り方");

    /*
     * **クライアントに渡すのは当該1社ぶんだけ**（AC-23）。`summaries.json` は 2,783社ぶん
     * （gzip 261.8KB）あり、丸ごと props に載せるとページの予算を超える。他社の説明文の
     * 書き出しが混じっておらず、出典の1行（説明文と対）が1回だけ。
     */
    expect(html, "他社の説明文").not.toContain("自動車の生産及び販売");
    expect(html.split("をもとに要約").length - 1, "説明文の出典の1行").toBe(1);

    // 企業詳細だけが読むデータは、トップページの HTML に入らない（AC-30・AC-31）。
    const top = await (await request.get("/")).text();
    for (const [label, text] of [
      ["書類 ID（C13）", "S100YAHE"],
      ["EDINET の閲覧ページ（C13）", "WZEK0040"],
      ["分析の見出し（C10）", "の現状と今後"],
      ["説明文（C7）", "電子応用機器の開発"],
    ] as const) {
      expect(top, label).not.toContain(text);
    }
  });

  test("AC-8: ランキングの会社名から企業詳細ページへ遷移できる", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "株式会社キーエンス" }).click();

    await expect(page).toHaveURL(/\/company\/6861$/);
    await expect(page.getByRole("heading", { name: "株式会社キーエンス", level: 1 })).toBeVisible();
  });

  /*
   * パンくずの末尾は現在地なのでリンクにしない（アートボード 4b）。業種はランキングの
   * 業種フィルタへ戻る道（spec 4. で比較表の代わりに決めた導線）。C3 で
   * 「電気機器193社をすべて見る」が増えたため、パンくずのほうを `exact` で指す。
   */
  test("パンくずの末尾は社名でリンクではなく、業種からランキングの業種フィルタへ戻れる", async ({
    page,
  }) => {
    await page.goto("/company/6861");
    const nav = page.getByRole("navigation").first();
    await expect(nav).toContainText("株式会社キーエンス");
    await expect(nav.getByRole("link", { name: "株式会社キーエンス" })).toHaveCount(0);

    await nav.getByRole("link", { name: "電気機器", exact: true }).click();
    await expect(page).toHaveURL(/[?&]ind=/);
    await expect(page.getByRole("combobox", { name: "業種" })).toContainText("電気機器");
  });

  /*
   * 企業詳細の断りが指す `/about` の行き先（`/about` の他の中身は `about.spec.ts`）。
   * ±20% の帯が信頼区間ではないことは**図と `/about` の2か所に書く**（CLAUDE.md）。
   * 説明文（C7）と要約・分析（C10）の作り方の節には、企業詳細からアンカーで飛ぶ。
   */
  test("/about に、企業詳細の断りと作り方への導線の行き先がある", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByText(/信頼区間ではありません/)).toBeVisible();

    const summary = page.locator("#company-summary");
    await expect(summary.getByRole("heading", { name: "会社の説明文の作り方" })).toBeVisible();
    await expect(summary).toContainText("有価証券報告書");

    const analysis = page.locator("#company-analysis");
    await expect(analysis.getByRole("heading", { name: "要約と分析の作り方" })).toBeVisible();
    await expect(analysis).toContainText("具体的な数値");
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
