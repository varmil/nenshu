import { test, expect } from "@playwright/test";

test.describe("URLクエリとの同期", () => {
  test("AC-7: /?age=45&ind=銀行業 を直接開くと、45歳・銀行業82社の状態で復元される", async ({ page }) => {
    await page.goto("/?age=45&ind=銀行業");

    await expect(page.getByRole("button", { name: "45歳" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("combobox", { name: "業種" })).toContainText("銀行業");

    const rows = page.getByRole("table").locator("tbody tr");
    await expect(rows).toHaveCount(82);
  });

  test("初期状態（何も操作しない）のURLは / のまま", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
  });

  test("フィルタを操作するとURLにクエリが反映される", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "45歳" }).click();
    await expect(page).toHaveURL(/[?&]age=45/);
  });

  test("ブラウザの戻るを押すと一つ前の絞り込み状態に戻る", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "45歳" }).click();
    await expect(page).toHaveURL(/[?&]age=45/);

    await page.getByRole("combobox", { name: "業種" }).click();
    await page.getByRole("option", { name: "海運業", exact: true }).click();
    await expect(page).toHaveURL(/[?&]ind=/);

    await page.goBack();
    await expect(page).toHaveURL(/[?&]age=45/);
    await expect(page).not.toHaveURL(/[?&]ind=/);
    await expect(page.getByRole("button", { name: "45歳" })).toHaveAttribute("aria-pressed", "true");

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "35歳" })).toHaveAttribute("aria-pressed", "true");
  });

  test("フィルタ操作中にネットワークリクエストが発生しない", async ({ page }) => {
    await page.goto("/");

    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    await page.getByRole("button", { name: "45歳" }).click();
    await page.getByRole("combobox", { name: "業種" }).click();
    await page.getByRole("option", { name: "海運業", exact: true }).click();

    expect(requests).toHaveLength(0);
  });

  test("並び順は操作した順序に関係なく常に同じクエリ文字列になる（カノニカル化）", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("combobox", { name: "業種" }).click();
    await page.getByRole("option", { name: "海運業", exact: true }).click();
    await page.getByRole("button", { name: "45歳" }).click();
    const urlA = new URL(page.url()).search;

    await page.goto("/");
    await page.getByRole("button", { name: "45歳" }).click();
    await page.getByRole("combobox", { name: "業種" }).click();
    await page.getByRole("option", { name: "海運業", exact: true }).click();
    const urlB = new URL(page.url()).search;

    expect(urlA).toBe(urlB);
  });
});
