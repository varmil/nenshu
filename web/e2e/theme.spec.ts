import { test, expect } from "@playwright/test";

/*
 * 配色トークンが実際にブラウザまで届いていることを固定する（Issue #62）。
 *
 * `design-system/tokens/tokens.test.ts` は tokens.css の中身を検証するが、
 * 「globals.css からの @import が外れた」「Tailwind が text-primary を生成しなくなった」
 * のようにファイルは正しいのに描画に反映されない壊れ方はそこでは検出できないので、
 * 実際の算出スタイルをここで見る。
 */

/** 算出色（rgb(...) / oklch(...)）が無彩色かどうか。 */
function isAchromatic(computed: string): boolean {
  const numbers = computed.match(/[\d.]+/g)?.map(Number) ?? [];
  const rgb = computed.startsWith("rgb") ? numbers.slice(0, 3) : null;
  if (rgb) return rgb[0] === rgb[1] && rgb[1] === rgb[2];
  // oklch(L C H) は chroma が 0 なら色味が無い。
  return numbers[1] === 0;
}

test.describe("配色トークン", () => {
  test("--primary が色味を持ち、白背景の上に載っている", async ({ page }) => {
    await page.goto("/");

    const { primary, background } = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        primary: style.getPropertyValue("--primary").trim(),
        background: style.getPropertyValue("--background").trim(),
      };
    });

    expect(primary).not.toBe("");
    expect(isAchromatic(primary)).toBe(false);
    expect(background).not.toBe("");
  });

  /*
   * 色の役割分担: Primary はナビゲーション（リンク・選択中のタブ・チャート）に使い、
   * データそのもの（年収額）は地のテキスト色のままにする。年収額が主役だからと
   * 色を付けると、画面上で最も目立つ色が「押せないもの」に割り当てられてしまう。
   */
  test("ランキングの年収額は地のテキスト色（Primary を使わない）", async ({ page }) => {
    await page.goto("/");

    const firstRow = page.getByRole("table").locator("tbody tr").first();
    // 推定年収のセル（RankingTable の `text-2xl font-bold`）。
    const salary = firstRow.locator(".text-2xl");
    await expect(salary).toBeVisible();

    const { salaryColor, bodyColor, primary } = await page.evaluate((el) => {
      const style = getComputedStyle(document.documentElement);
      return {
        salaryColor: getComputedStyle(el as Element).color,
        bodyColor: getComputedStyle(document.body).color,
        primary: style.getPropertyValue("--primary").trim(),
      };
    }, await salary.elementHandle());

    expect(salaryColor).toBe(bodyColor);
    expect(salaryColor).not.toBe(primary);
  });

  test("会社名リンクは Primary で描画される", async ({ page }) => {
    await page.goto("/");

    const link = page.getByRole("table").locator("tbody tr").first().getByRole("link");
    await expect(link).toBeVisible();

    const linkColor = await link.evaluate((el) => getComputedStyle(el).color);
    const bodyColor = await page.evaluate(() => getComputedStyle(document.body).color);

    expect(isAchromatic(linkColor)).toBe(false);
    expect(linkColor).not.toBe(bodyColor);
  });

  test("選択中の年齢タブは Primary で塗りつぶされる", async ({ page }) => {
    await page.goto("/");

    // exact 指定は必須。「40歳」は平均年齢フィルタの「〜40歳」にも一致してしまう。
    const selected = page.getByRole("button", { name: "35歳", exact: true });
    const unselected = page.getByRole("button", { name: "40歳", exact: true });

    const selectedBg = await selected.evaluate((el) => getComputedStyle(el).backgroundColor);
    const unselectedBg = await unselected.evaluate((el) => getComputedStyle(el).backgroundColor);

    // 選択中だけが塗られていて、かつその塗りが無彩色ではない。
    expect(isAchromatic(selectedBg)).toBe(false);
    expect(selectedBg).not.toBe(unselectedBg);
  });

  test("遷移中のプログレスバーは 4px ある", async ({ page }) => {
    await page.goto("/");

    // .nav-progress は遷移中しか描画されないので、同じ宣言を持つ要素を作って測る。
    const height = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.className = "nav-progress";
      document.body.append(probe);
      const value = getComputedStyle(probe).height;
      probe.remove();
      return value;
    });

    expect(height).toBe("4px");
  });

  test("--radius から rounded-* が導出されている", async ({ page }) => {
    await page.goto("/");

    const radius = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--radius").trim(),
    );
    // 値そのものはプリセット次第なので固定しない。rem で定義されていることだけ見る。
    expect(radius).toMatch(/^\.?\d*\.?\d+rem$/);

    // @theme inline の --radius-* → Tailwind の rounded-* まで繋がっているか。
    // 角丸を持つ「本社のみ」バッジで、算出値が実際の px になっていることを確かめる。
    const badge = page.getByText("本社のみ").first();
    await expect(badge).toBeVisible();

    const borderRadius = await badge.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(parseFloat(borderRadius)).toBeGreaterThan(0);
  });
});

/*
 * フォントは OS のフォントだけで組む（Issue #64）。以前は next/font で Geist を
 * 読んでおり、全ページで 2リクエスト / 52,396 bytes を払っていた。Geist が
 * 描いていたのは数字とラテン文字だけで、日本語はどのみち OS のフォントに
 * 落ちていた。ここが 0 に保たれていることをブラウザで固定する。
 */
test.describe("フォント", () => {
  for (const path of ["/", "/about", "/company/6861"]) {
    test(`${path} はフォントを1件もダウンロードしない`, async ({ page }) => {
      const fontRequests: string[] = [];
      page.on("request", (request) => {
        if (/\.(woff2?|ttf|otf|eot)(\?|$)/.test(request.url())) {
          fontRequests.push(request.url());
        }
      });

      await page.goto(path, { waitUntil: "networkidle" });

      expect(fontRequests).toEqual([]);
      // @font-face が読み込まれていないことも合わせて見る。
      const loaded = await page.evaluate(() =>
        [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family),
      );
      expect(loaded).toEqual([]);
    });
  }

  test("日本語フォントが明示されている（漢字が中国語字形にならない）", async ({ page }) => {
    await page.goto("/");

    const stack = await page.evaluate(() => getComputedStyle(document.body).fontFamily);

    expect(stack).toContain("Hiragino Sans");
    expect(stack).toContain("Meiryo");
    expect(stack).toContain("Noto Sans CJK JP");
  });
});
