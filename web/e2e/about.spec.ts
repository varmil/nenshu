import { test, expect } from "./appTest";

/*
 * 計算方法ページ（U7・`docs/ranking/about-page/`）。
 *
 * 本文の数値は `features/ranking/lib/aboutFacts.ts` が実データから出し、値そのものは
 * `aboutFacts.test.ts` が固定している。ここで見るのは、それが本文として描かれていること
 * ——節ごとの組み立て（丸め・書式・差額の計算）は `AboutPage` の中にあり、単体テストの
 * 外にある。
 */
test.describe("計算方法ページ（/about）", () => {
  test("AC-10: ランキングから計算方法をたどると、式・出典・対象範囲・限界・順位の節が読め、ランキングへ戻れる", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "計算方法" }).click();

    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole("heading", { name: "計算方法", level: 1 })).toBeVisible();

    // 式
    await expect(page.getByRole("heading", { name: "補正の式" })).toBeVisible();
    await expect(page.getByText("目標年齢 ≦ 平均年齢:")).toBeVisible();
    await expect(page.getByText("目標年齢 ＞ 平均年齢:")).toBeVisible();

    // 出典
    await expect(page.getByRole("heading", { name: "出典", exact: true })).toBeVisible();
    await expect(page.getByText("令和5年賃金構造基本統計調査")).toBeVisible();
    await expect(page.getByRole("link", { name: /EDINET/ })).toBeVisible();

    // 対象範囲
    await expect(page.getByRole("heading", { name: "対象範囲" })).toBeVisible();
    // 「要約と分析の作り方」の節（C10）にも社数が出るので、対象範囲の太字に絞る。
    await expect(page.getByText("2,961社", { exact: true })).toBeVisible();

    // 限界
    await expect(page.getByRole("heading", { name: "この方法の限界" })).toBeVisible();
    await expect(page.getByText("推定値であって実測ではありません")).toBeVisible();
    // カーブが「ある時点の断面」であることを、軌跡と取り違えない書き方で示している
    await expect(
      page.getByText("同じ人が歳を取っていく軌跡でも、1社の中で昇給していく軌跡でもありません")
    ).toBeVisible();

    // 年齢スイッチで順位がほとんど動かないこと（AC-10 の後半）。理由（同業種は必ず
    // 同じカーブを引くこと）と、動く割合の実測値まで書かれている。
    await expect(
      page.getByRole("heading", { name: "年齢スイッチで順位はほとんど動きません" })
    ).toBeVisible();
    await expect(page.getByText("同じ業種の2社は必ず同じカーブを引きます")).toBeVisible();
    await expect(page.getByText("2.4%")).toBeVisible();

    await page.getByRole("link", { name: "← ランキングに戻る" }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("table").locator("tbody tr").first()).toBeVisible();
  });

  test("仮定・実例・表示基準の節が実データの数値付きで書かれている", async ({ page }) => {
    await page.goto("/about");

    // 2点モデルの仮定（22歳＝業種平均）と、平均年齢より上に倍率一定が残っていることを、
    // 60歳の最大値付きで開示している。
    await expect(page.getByRole("heading", { name: /22歳の水準を業種平均と置いています/ })).toBeVisible();
    await expect(page.getByText("中央値1.19倍")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /平均年齢より上は、いまも倍率を一定と置いています/ })
    ).toBeVisible();
    await expect(page.getByText("2,386万円")).toBeVisible();

    // 式の実例を電卓で追うと、表示している推定年収と同じ金額になる。みずほ銀行・35歳。
    // 万円に丸めた値どうしで引き算すると1万円ずれるため、途中の値は小数第1位まで
    // 出している。この桁で計算すると表示と同じ755万円になる。
    await expect(page.getByText("カーブ（22歳）＝ 341.9万円")).toBeVisible();
    await expect(page.getByText("カーブ（35歳）＝ 660.6万円")).toBeVisible();
    await expect(page.getByText("カーブ（40.7歳）＝ 749.1万円")).toBeVisible();
    await expect(page.getByText("平均年間給与 870.1万円")).toBeVisible();
    await expect(page.getByText(/推定年収 ＝ .*＝ 755万円/)).toBeVisible();

    // 「本社のみ」バッジの実例。「2つの表示基準」の表も同じページにあるので、
    // バッジの実例の表に絞る。
    const table = page.getByRole("table").filter({ hasText: "単体従業員数" });
    await expect(table).toContainText("株式会社みずほフィナンシャルグループ");
    await expect(table).toContainText("株式会社みずほ銀行");
    await expect(table).toContainText("本社のみ");
    // 表に出す金額（丸め後）と、本文が述べる差額が食い違わないこと。
    // 丸める前の差を取ると1万円ずれる（1,167万 − 870万 = 297万 だが 296.4万 → 296万）。
    await expect(table).toContainText("1,167万円");
    await expect(table).toContainText("870万円");
    await expect(page.getByText("297万円の差があります")).toBeVisible();

    // 2つの表示基準と、既定が実測値であること（ADR-0007）。平均年齢のばらつきと、
    // 母集団平均が基準ごとに違うことを数値で示す。
    await expect(page.getByRole("heading", { name: "2つの表示基準" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "実測値（既定）" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "年齢そろえ" })).toBeVisible();
    await expect(page.getByText("27.0歳から", { exact: false })).toBeVisible();
    await expect(page.getByText("実測値のままだと平均年齢の高い会社が上に来ます")).toBeVisible();
    await expect(page.getByText("693万円", { exact: false }).first()).toBeVisible();
  });

  test("SSR: 生HTTPリクエスト（JS実行なし）でも本文が返る", async ({ request }) => {
    const response = await request.get("/about");
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html).toContain("令和5年賃金構造基本統計調査");
    expect(html).toContain("同じ業種の2社は必ず同じカーブを引きます");
    expect(html).toContain("株式会社みずほ銀行");
  });

  // Issue #120: 390px で式が行の途中で折り返し、続きの行では字下げが消えていた。
  test("計算式はモバイル幅でも折り返さず、ブロックの中だけを横に送れる", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/about");

    for (const label of ["補正の式", "年収の定義"]) {
      const formula = page.getByRole("group", { name: label });
      await expect(formula, label).toBeVisible();

      // 折り返さないので、はみ出したぶんは器の中に残っていて
      // （折り返すと2行目以降の字下げが消えて式の構造が読めなくなる）、
      const size = await formula.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(size.scrollWidth, label).toBeGreaterThan(size.clientWidth);

      // 実際に横へ送れる。
      await formula.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      expect(await formula.evaluate((el) => el.scrollLeft), label).toBeGreaterThan(0);

      // マウスを持たない読者も送れるよう、器そのものに焦点が当たる。
      await formula.focus();
      await expect(formula, label).toBeFocused();
    }

    // ページごと横に流れてはいない（はみ出しは器の中に閉じている）。
    const doc = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(doc.scrollWidth).toBe(doc.innerWidth);
  });
});
