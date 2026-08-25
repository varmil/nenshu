import { test, expect } from "./rankingTest";
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
    // 年収のセル（RankingTable の `text-base font-bold`。Issue #96 で 20px から落とした）。
    const salary = firstRow.locator(".text-base");
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
    // 既定は実測値で年齢スイッチが無効・未選択なので、年齢そろえの状態で見る（ADR-0007）。
    await page.goto("/?age=35");

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

    test("初回表示はライト", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });

      await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    });

    test("AC-4/AC-5: 切り替えられ、リロードしても保持される", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);

      await page.getByRole("button", { name: "ダークモードに切り替える" }).click();
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);

      await page.reload({ waitUntil: "domcontentloaded" });
      // OS はライトのままなので、保持されていなければここでライトに戻る。
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);

      // 戻せることも見る。
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

test.describe("共通ヘッダ", () => {
  for (const path of ["/", "/about", "/company/6861"]) {
    test(`AC-1: ${path} にヘッダが出る`, async ({ page }) => {
      await page.goto(path);

      const header = page.getByRole("banner");
      await expect(header.getByRole("link", { name: "OpenReport" })).toBeVisible();
      await expect(header.getByRole("link", { name: "計算方法" })).toBeVisible();
      await expect(
        header.getByRole("button", { name: /モードに切り替える/ }),
      ).toBeVisible();
    });
  }

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

  test("AC-2: OpenReport を押すと / に戻る", async ({ page }) => {
    await page.goto("/about");

    await page.getByRole("banner").getByRole("link", { name: "OpenReport" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "平均年収ランキング" })).toBeVisible();
  });

  test("AC-9: モバイル幅でヘッダが横スクロールを起こさない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );

    expect(overflows).toBe(false);
  });
});
