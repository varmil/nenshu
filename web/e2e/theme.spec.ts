import { test, expect, waitForHydration } from "./appTest";
import { collectPageRequests } from "./network";

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

/*
 * 色の役割分担: Primary はナビゲーション（リンク・選択中のタブ・チャート）に使い、
 * データそのもの（年収額）は地のテキスト色のままにする。年収額が主役だからと
 * 色を付けると、画面上で最も目立つ色が「押せないもの」に割り当てられてしまう。
 *
 * トークンの値そのもの（`--primary` に色味があること・コントラスト）は
 * `tokens.test.ts` が見る。ここで見るのは、それが実際の要素に当たっていること。
 */
test("色の役割: 会社名リンクと選択中の年齢タブは Primary、年収額は地の色", async ({ page }) => {
  // 既定は実測値で年齢スイッチが無効・未選択なので、年齢そろえの状態で見る（ADR-0007）。
  await page.goto("/?age=35");

  const bodyColor = await page.evaluate(() => getComputedStyle(document.body).color);
  const firstRow = page.getByRole("table").locator("tbody tr").first();

  // 年収のセル（RankingTable の `text-base font-bold`。Issue #96 で 20px から落とした）。
  const salary = firstRow.locator(".text-base");
  expect(await salary.evaluate((el) => getComputedStyle(el).color), "年収額").toBe(bodyColor);

  const linkColor = await firstRow.getByRole("link").evaluate((el) => getComputedStyle(el).color);
  expect(isAchromatic(linkColor), "会社名リンクに色味が無い").toBe(false);
  expect(linkColor, "会社名リンクが地の色のまま").not.toBe(bodyColor);

  // exact 指定は必須。「40歳」は平均年齢フィルタの「〜40歳」にも一致してしまう。
  const background = (name: string) =>
    page
      .getByRole("button", { name, exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  const selectedBg = await background("35歳");
  // 選択中だけが塗られていて、かつその塗りが無彩色ではない。
  expect(isAchromatic(selectedBg), "選択中の年齢タブの塗りに色味が無い").toBe(false);
  expect(selectedBg, "選択中と未選択の年齢タブが同じ塗り").not.toBe(await background("40歳"));
});

/*
 * フォントは OS のフォントだけで組む（Issue #64）。以前は next/font で Geist を
 * 読んでおり、全ページで 2リクエスト / 52,396 bytes を払っていた。Geist が
 * 描いていたのは数字とラテン文字だけで、日本語はどのみち OS のフォントに
 * 落ちていた。ここが 0 に保たれていることをブラウザで固定する。
 */
test("フォントを1件もダウンロードせず、日本語フォントを明示したスタックで組む", async ({ page }) => {
  for (const path of ["/", "/about", "/company/6861"]) {
    const fontRequests: string[] = [];
    const onRequest = (request: import("@playwright/test").Request) => {
      if (/\.(woff2?|ttf|otf|eot)(\?|$)/.test(request.url())) fontRequests.push(request.url());
    };
    page.on("request", onRequest);
    await page.goto(path, { waitUntil: "networkidle" });
    page.off("request", onRequest);

    expect(fontRequests, path).toEqual([]);
    // @font-face が読み込まれていないことも合わせて見る。
    const loaded = await page.evaluate(() =>
      [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family),
    );
    expect(loaded, path).toEqual([]);

    // スタックの中身は `tokens.test.ts` が固定している。ここで見るのは、それが本文に
    // 当たっていること——外れると漢字が中国語の字形で組まれる環境がある。
    const stack = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(stack, path).toContain("Noto Sans CJK JP");
  }
});

/*
 * ライト/ダークの切替（Issue #68、`docs/site-chrome/spec.md` 3、AC-3〜AC-7）。
 *
 * ダークの配色は tokens.css に前からあったが、適用する仕組みが無く一度も
 * 画面に出ていなかった。ここで初めてブラウザ上の挙動を固定する。
 */
test.describe("表示モード", () => {
  test.describe("OS がダークのとき", () => {
    test.use({ colorScheme: "dark" });

    test("AC-3: 初回表示の時点でダーク（ライトが一瞬も見えない）", async ({ page }) => {
      // domcontentloaded の時点で見るのが肝。ここで既に dark が付いていれば、
      // インラインスクリプトが最初の描画より前に走ったことになる。
      // load 後に見ると、ハイドレーション後に付いた場合でも通ってしまう。
      await page.goto("/", { waitUntil: "domcontentloaded" });

      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    });

    test("AC-7: ダークでもリンク・選択中のタブが読める", async ({ page }) => {
      await page.goto("/");

      const ratios = await page.evaluate(() => {
        /*
         * 算出色は色空間がまちまち（Chromium は oklch 由来の色を lab(...) で返す）。
         * 自前でパースすると空間ごとの実装が要るので、canvas に塗って
         * sRGB のバイト値で読み戻し、それで WCAG の比を出す。
         */
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        const toRgb = (color: string): [number, number, number] => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
          return [r, g, b];
        };
        const channel = (v: number) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        const luminance = (color: string) => {
          const [r, g, b] = toRgb(color).map(channel);
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (fg: string, bg: string) => {
          const a = luminance(fg);
          const b = luminance(bg);
          const [hi, lo] = a > b ? [a, b] : [b, a];
          return (hi + 0.05) / (lo + 0.05);
        };

        const bg = getComputedStyle(document.body).backgroundColor;
        const link = document.querySelector("tbody tr a")!;
        const selectedTab = document.querySelector('[data-slot="toggle-group-item"][aria-pressed="true"]')!;
        const selectedStyle = getComputedStyle(selectedTab);

        return {
          link: ratio(getComputedStyle(link).color, bg),
          selectedTab: ratio(selectedStyle.color, selectedStyle.backgroundColor),
        };
      });

      // #65 で Primary をリンク・タブ・チャートの色に振り直したので、
      // ダークの --primary が AA を割ると全リンクが読めなくなる（実際に 2.72 だった）。
      expect(ratios.link).toBeGreaterThanOrEqual(4.5);
      expect(ratios.selectedTab).toBeGreaterThanOrEqual(4.5);
    });
  });

  test.describe("OS がライトのとき", () => {
    test.use({ colorScheme: "light" });

    test("AC-4/AC-5: 切り替えられ、リロードしても保持される", async ({ page }) => {
      await page.goto("/");
      // OS がライトなら初回はライト（ダーク側の初回表示は AC-3 が見る）。
      await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);

      await page.getByRole("button", { name: "ダークモードに切り替える" }).click();
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);

      await page.reload({ waitUntil: "domcontentloaded" });
      // OS はライトのままなので、保持されていなければここでライトに戻る。
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);

      // 戻せることも見る。**押す前にハイドレーションを待つ**——上の `reload` は
      // `waitUntil` を明示していて（ちらつき防止を見るため）、その時点ではまだ島に
      // React が取り付いていない（F1・`e2e/appTest.ts`）。
      await waitForHydration(page);
      await page.getByRole("button", { name: "ライトモードに切り替える" }).click();
      await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    });

    test("AC-6: 切替でネットワークリクエストが発生しない", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const requests = collectPageRequests(page);

      await page.getByRole("button", { name: "ダークモードに切り替える" }).click();
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);

      // SSR を巻き込んでいないことの担保。巻き込むとエッジキャッシュに
      // モードが焼かれる危険が出る（spec.md 3.3）。
      expect(requests).toEqual([]);
    });
  });
});

/*
 * モバイル幅（390px）でヘッダが横スクロールを起こさないこと（AC-9）は、ブランドの
 * AC-27 とまったく同じ検査なので `branding.spec.ts` に1本だけ置く。
 */
test.describe("共通ヘッダ", () => {
  test("AC-1: どのページにもヘッダが出る", async ({ page }) => {
    for (const path of ["/", "/about", "/company/6861"]) {
      await page.goto(path);

      const header = page.getByRole("banner");
      await expect(header.getByRole("link", { name: "OpenReport" }), path).toBeVisible();
      await expect(header.getByRole("link", { name: "計算方法" }), path).toBeVisible();
      await expect(header.getByRole("button", { name: /モードに切り替える/ }), path).toBeVisible();
    }
  });

  /*
   * ちらつき防止（Issue #66 の追加報告）。
   *
   * 以前は現在のモードを JS で判定してアイコンを描き分けており、サーバー側では
   * どちらか分からないので何も出していなかった。その結果 **ボタンが約86ms
   * 空のまま残り、ハイドレーション後にアイコンが現れる**（実測）ちらつきが出た。
   *
   * いまは両方のアイコンを常に出し、`dark:` バリアント（＝ <html> の dark クラス）
   * で見せ分けている。クラスはインラインスクリプトが最初の描画より前に付けるので、
   * **サーバーが返した HTML がそのまま正しい見た目になる。**
   *
   * JS を一切実行しない生の HTTP レスポンスで見るのが確実な判定になる。
   */
  test("ちらつき防止: SSRのHTMLの時点でトグルにアイコンが入っている", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const html = await response.text();

    const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(header).not.toBe("");

    // lucide のアイコンは svg として直接埋まる。片方だけでは描き分けができていない。
    expect(header).toContain("lucide-sun");
    expect(header).toContain("lucide-moon");

    // 読み上げ名も両方入っていて、CSS 側で片方が display:none になる。
    expect(header).toContain("ダークモードに切り替える");
    expect(header).toContain("ライトモードに切り替える");
  });
});
