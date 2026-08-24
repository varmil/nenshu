import { test, expect, type Page } from "@playwright/test";
import { collectPageRequests } from "./network";

/**
 * P1（Issue #167）——企業詳細ページのレーダーチャート「公開資料による全体像」。
 * `docs/performance/spec.md` の AC-6〜AC-9・AC-11 に対応する。
 *
 * 軸の値と順位は `features/company/lib/radar.test.ts` と `build-data.test.ts` が
 * 固定しているので、ここは**ブラウザでどう出るか**（欠測軸の頂点が無いこと・
 * 表示基準に追随するのが平均年収だけであること）を見る。
 */

const section = (page: Page) =>
  page.getByRole("heading", { name: "公開資料による全体像" }).locator("xpath=..");

const chart = (page: Page) => section(page).locator("svg");

test.describe("AC-6 軸", () => {
  test("5軸のラベルと実数が出る（キーエンス）", async ({ page }) => {
    await page.goto("/company/6861");
    const svg = chart(page);
    for (const label of [
      "平均年収（有報）",
      "有給の取得",
      "定着（在籍）",
      "稼ぐ力",
      "残業の少なさ",
    ]) {
      await expect(svg).toContainText(label);
    }
    // ラベルに実数が入る（アートボード 6a）。
    await expect(svg).toContainText("2,178万円");
    await expect(svg).toContainText("11.3年");
    await expect(svg).toContainText("38.8%");
  });

  test("各軸が「公表している会社の中での相対位置」である旨が読める", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(section(page)).toContainText(
      "その指標を公表している会社の中での相対位置"
    );
  });

  test("稼ぐ力に業種の中央値が併記される", async ({ page }) => {
    await page.goto("/company/6861");
    // 業種差が19倍あるので、中央値を添えないと読み違える（spec 1.3）。
    await expect(section(page)).toContainText("電気機器の中央値");
    await expect(section(page)).toContainText("1人当たり経常利益");
  });

  test("稼ぐ力の分母の範囲を断る（年収は単体・稼ぐ力は連結）", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(section(page)).toContainText("連結の経常利益");
    await expect(section(page)).toContainText("パート・アルバイトは従業員数に含まれません");
  });
});

test.describe("AC-7 欠測軸", () => {
  test("残業を登録していない会社は頂点を打たない（キーエンス）", async ({ page }) => {
    await page.goto("/company/6861");
    // 5軸のうち残業だけが欠ける → 頂点は4つ。
    await expect(chart(page).locator("circle")).toHaveCount(4);
    // ラベルは残す。軸ごと消すと何が公表されていないかが図から消える。
    await expect(chart(page)).toContainText("残業の少なさ");
    await expect(chart(page)).toContainText("掲載なし");
    // **中心まで引き込まない**（破線でつなぐ描き方をしない）。
    await expect(chart(page).locator("polygon[stroke-dasharray]")).toHaveCount(0);
  });

  test("2軸が欠けても残りの3点で閉じる（三菱UFJ）", async ({ page }) => {
    await page.goto("/company/8306");
    await expect(chart(page).locator("circle")).toHaveCount(3);
    // 有給・残業の2軸が「掲載なし」。
    const svg = chart(page);
    await expect(svg).toContainText("有給の取得");
    await expect(svg).toContainText("残業の少なさ");
  });

  test("欠測が無い会社は5つの頂点が出る（トヨタ自動車）", async ({ page }) => {
    await page.goto("/company/7203");
    await expect(chart(page).locator("circle")).toHaveCount(5);
  });
});

test.describe("AC-8 男女の賃金の差異は軸にしない", () => {
  test("図に賃金の差異の軸が無く、数値は下の節に残る", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(chart(page)).not.toContainText("賃金");
    // W1 の節には残っている（#154 は図から降ろしただけ）。
    await expect(
      page.getByRole("heading", { name: "残業・有給・男女の賃金の差異" })
    ).toBeVisible();
  });
});

test.describe("AC-9 図だけが情報源にならない", () => {
  test("PC では値と順位が図の外にも出る", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/company/6861");
    const list = section(page).locator("dl");
    await expect(list).toContainText("1,867社中1位");
    await expect(list).toContainText("895社中883位");
    // 「上位◯%」は使わない（上位82%が良い意味に読まれるため）。
    await expect(list).not.toContainText("上位");
  });

  test("JS実行前のHTMLに軸の値が入っている", async ({ request }) => {
    const html = await (await request.get("/company/6861")).text();
    expect(html).toContain("公開資料による全体像");
    expect(html).toContain("2,178万円");
    expect(html).toContain("残業の少なさ");
  });
});

test.describe("AC-11 表示基準", () => {
  test("年齢そろえで平均年収の軸だけが追随する", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/company/6861");
    const list = section(page).locator("dl");
    await expect(list).toContainText("2,178万円");
    await expect(list).toContainText("11.3年");

    const requests = collectPageRequests(page);
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("group", { name: "目標年齢" }).getByRole("button", { name: "25歳" }).click();
    await expect(page).toHaveURL(/[?&]age=25/);

    // 稼ぐ力・定着・有給は年齢補正を通さないので動かない。
    await expect(list).toContainText("11.3年");
    await expect(list).toContainText("4,062万円");
    await expect(list).toContainText("38.8%");
    // 平均年収だけが25歳の推定値に変わる。
    await expect(list).not.toContainText("2,178万円");
    expect(requests).toHaveLength(0);
  });
});

test.describe("レイアウト", () => {
  test("390px で横スクロールが出ない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/company/6861");
    await expect(chart(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("節はページの先頭にある（上部カードより前）", async ({ page }) => {
    await page.goto("/company/6861");
    const headings = await page.getByRole("heading", { level: 2 }).allInnerTexts();
    expect(headings[0]).toBe("公開資料による全体像");
  });
});
