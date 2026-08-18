import { expect, test } from "@playwright/test";

// Microsoft Clarity（Issue #44）は本番ビルドでだけ読み込む。
// E2Eは開発サーバーに対して走るため、ここで検証できるのは「開発時は読み込まれないこと」。
// 開発サーバーやテスト実行ぶんが実セッションとして計測に混ざるのを防ぐと同時に、
// ranking-url-sync / ranking-pagination の「操作中にネットワークリクエストが発生しない」
// （リクエスト数を0で固定している）テストが外部への計測リクエストで壊れるのを防ぐ。
test.describe("アクセス解析", () => {
  test("開発環境ではClarityのタグが読み込まれない", async ({ page, request }) => {
    const html = await (await request.get("/")).text();
    expect(html).not.toContain("clarity.ms");

    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));
    await page.goto("/");
    await page.getByRole("button", { name: "45歳" }).click();

    expect(requests.filter((url) => url.includes("clarity"))).toEqual([]);
  });
});
