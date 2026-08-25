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
      "残業時間",
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
    await expect(chart(page)).toContainText("残業時間");
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
    await expect(svg).toContainText("残業時間");
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
    await expect(list).toContainText("2,961社中3位");
    await expect(list).toContainText("895社中883位");
    // 「上位◯%」は使わない（上位82%が良い意味に読まれるため）。
    await expect(list).not.toContainText("上位");
  });

  test("JS実行前のHTMLに軸の値が入っている", async ({ request }) => {
    const html = await (await request.get("/company/6861")).text();
    expect(html).toContain("公開資料による全体像");
    expect(html).toContain("2,178万円");
    expect(html).toContain("残業時間");
  });
});

test.describe("AC-11 表示基準", () => {
  test("年齢そろえで平均年収の軸だけが追随する", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    // **ハイドレーションを待つ。** この節の値は SSR の HTML で既に満たされるので、
    // `toContainText` はクリックできる状態になる前に解決してしまう。全体実行で
    // dev サーバーが重いときだけ、押したのに何も起きない形で落ちる（実際に落ちた）。
    await page.goto("/company/6861", { waitUntil: "networkidle" });
    const list = section(page).locator("dl");
    await expect(list).toContainText("2,178万円");
    await expect(list).toContainText("11.3年");

    const requests = collectPageRequests(page);
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("group", { name: "目標年齢" }).getByRole("button", { name: "25歳" }).click();
    // 表示基準は URL に出さない（R1・ADR-0012）。
    await expect(page).toHaveURL(/\/company\/6861$/);

    // 稼ぐ力・定着・有給は年齢補正を通さないので動かない。
    await expect(list).toContainText("11.3年");
    await expect(list).toContainText("4,062万円");
    await expect(list).toContainText("38.8%");
    // 平均年収だけが25歳の推定値に変わる。
    await expect(list).not.toContainText("2,178万円");
    expect(requests).toHaveLength(0);
  });
});

/*
 * Issue 191（2巡目・アートボード 6a / 6b）。**図が小さかった原因は
 * `@container` を `<svg>` 自身に置いていたこと**——`container-type: inline-size`
 * はその要素の縦横比を無かったことにするので、`height: auto` が置換要素の既定
 * （150px）に落ち、`preserveAspectRatio` が図全体を半分に縮めていた。
 * **型チェックもUnitテストも通る壊れ方**なので、比をブラウザで見張る。
 */
test.describe("モックとの一致（2巡目）", () => {
  const RATIO = 232 / 300;

  for (const [label, width] of [
    ["PC", 1280],
    ["モバイル", 390],
  ] as const) {
    test(`${label}: 図が viewBox の比のまま伸びる（潰れていない）`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/company/6861");
      const box = (await chart(page).boundingBox())!;
      expect(box.height / box.width).toBeCloseTo(RATIO, 2);
      // 器いっぱい（PC は 340px 固定、モバイルは本文幅）まで使う。
      expect(box.width).toBeGreaterThan(300);
    });
  }

  test("PC の左列は 340px 固定（アートボード 6b の `340px 1fr`）", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/company/6861");
    expect((await chart(page).boundingBox())!.width).toBe(340);
  });

  test("指標リストは 年収 → 残業 → 有給 → 定着 → 稼ぐ力 の順", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/company/6861");
    // **稼ぐ力は行の高さが1つだけ高いので最後**（業種中央値が下に付く）。
    const labels = await section(page).locator("dl dt").allInnerTexts();
    const expected = ["平均年収（有報）", "残業時間", "有給の取得", "定着（在籍）", "稼ぐ力"];
    expect(labels).toHaveLength(expected.length);
    // 区分名や「1人あたり経常利益」が後ろに付く行があるので前方一致で見る。
    labels.forEach((label, i) => expect(label.startsWith(expected[i])).toBe(true));
  });

  test("値も順位も右寄せで、全行の右端がそろう", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/company/6861");
    const rows = await section(page)
      .locator("dl > div")
      .evaluateAll((els) =>
        els.map((row) => {
          const spans = row.querySelectorAll("dd > span");
          // **文字そのものの右端を測る。** 器は固定幅なので、`text-align` を
          // 変えても要素の矩形は動かない——`Range` なら中身の位置が出る。
          const textRight = (el: Element) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return Math.round(range.getBoundingClientRect().right);
          };
          return [
            Math.round(spans[0].getBoundingClientRect().right),
            Math.round(spans[1].getBoundingClientRect().right),
            textRight(spans[1]),
          ];
        })
      );
    expect(rows).toHaveLength(5);
    // 掲載なしの行も同じ幅の空きを残す（詰めるとその行だけ右へ寄る）。
    const withRank = rows.filter((r) => r[2] > 0);
    expect(withRank.length).toBeGreaterThan(1);
    for (const row of rows) expect(row.slice(0, 2)).toEqual(rows[0].slice(0, 2));
    // 桁数の違う順位（`2,961社中3位` と `895社中883位`）が右端でそろう。
    for (const row of withRank) expect(row[2]).toBe(withRank[0][2]);
  });

  /*
   * **右寄せの文字は、器を超えると左へはみ出す。** 右端はそろったままなので、
   * 上の「右端がそろう」テストでは捕まらない——84px の器に実測83px の
   * `1,867社中1,468位` が入っていたとき、隣のラベルを押していたのに通っていた。
   *
   * **「収まる」では足りない。1文字ぶんの余裕を要求する。** このサイトは
   * webfont を持たずOSのフォントで組むので、**同じ文字列の幅が環境で変わる**
   * （モバイルの行で「円」だけが実機で2行目に落ちたのと同じ理由・CLAUDE.md）。
   * 1px の余りは、別のフォントでは溢れる。
   */
  const MIN_SLACK = 8;

  for (const [label, id] of [
    ["4桁の順位（キーエンスの定着 1,955位）", "6861"],
    ["最下位に近い順位（2,961社中2,960位）", "135A"],
  ] as const) {
    test(`${label}に1文字ぶんの余裕がある`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.goto(`/company/${id}`);
      const fit = await section(page)
        .locator("dl > div")
        .evaluateAll((els) =>
          els.map((row) => {
            const spans = row.querySelectorAll("dd > span");
            const inner = (el: Element) => {
              const range = document.createRange();
              range.selectNodeContents(el);
              return Math.round(range.getBoundingClientRect().width);
            };
            return {
              text: spans[1].textContent ?? "",
              // 値・順位とも「中身の幅 ≤ 器の幅」。
              value: [inner(spans[0]), Math.round(spans[0].getBoundingClientRect().width)],
              rank: [inner(spans[1]), Math.round(spans[1].getBoundingClientRect().width)],
              // ラベルが2行に折れていないか（稼ぐ力だけは副題ぶん高い）。
              dtLines: Math.round(
                row.querySelector("dt")!.getBoundingClientRect().height /
                  parseFloat(getComputedStyle(row.querySelector("dt")!).lineHeight)
              ),
            };
          })
        );
      expect(fit).toHaveLength(5);
      for (const row of fit) {
        expect(row.value[1] - row.value[0], `値の器（${row.text} の行）`).toBeGreaterThanOrEqual(
          MIN_SLACK
        );
        expect(row.rank[1] - row.rank[0], `順位の器（${row.text}）`).toBeGreaterThanOrEqual(
          MIN_SLACK
        );
      }
      // **ラベルは折り返しを直接見る。** 器の余りから逆算するより確か。
      // 稼ぐ力（末尾）だけは副題ぶん2行になる。
      for (const row of fit.slice(0, 4)) expect(row.dtLines).toBe(1);
    });
  }

  test("稼ぐ力の業種中央値は値と同じ右端にそろう（右寄せ）", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/company/6861");
    const row = section(page).locator("dl > div").last();
    const [rankRight, medianRight] = await row.evaluate((el) => {
      const spans = el.querySelectorAll("dd > span");
      return [
        Math.round(spans[1].getBoundingClientRect().right),
        Math.round(spans[2].getBoundingClientRect().right),
      ];
    });
    await expect(row).toContainText("電気機器の中央値");
    expect(medianRight).toBe(rankRight);
  });

  test("「掲載なし」は実数より一段小さい（運営者の指示）", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/company/6861");
    // 値の大きさは軸の重みではない。実数と同じ 12px で並ぶと、無い軸のほうが
    // 読む順で先に来る。**行の位置は変えない**（`dy` は user unit で指定してある）。
    const sizes = await chart(page)
      .locator("text > tspan:nth-child(2)")
      .evaluateAll((spans) =>
        spans.map((s) => ({
          text: s.textContent,
          size: parseFloat(getComputedStyle(s).fontSize),
          y: Math.round((s as SVGTSpanElement).getBoundingClientRect().top),
        }))
      );
    const missing = sizes.filter((s) => s.text === "掲載なし");
    const shown = sizes.filter((s) => s.text !== "掲載なし");
    expect(missing).toHaveLength(1);
    expect(shown.length).toBeGreaterThan(0);
    for (const m of missing) {
      for (const s of shown) expect(m.size).toBeLessThan(s.size);
    }
  });

  /*
   * 区分名（`対象とする労働者すべて`）を添えていたが**落とした**（運営者の指示）。
   * 長い区分名で行が2行になり、そのぶんの情報量に見合わない。**区分名は
   * W1 の節が行ごとに出している**ので、この画面から消えるわけではない。
   */
  test("有給の行に区分名を添えず、全行が1行に収まる", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/company/8058");
    const paid = section(page).locator("dl dt").nth(2);
    await expect(paid).toHaveText("有給の取得");
    // 稼ぐ力だけが2行ぶん（`1人当たり経常利益` が下に付く）。
    const heights = await section(page)
      .locator("dl > div")
      .evaluateAll((rows) => rows.map((r) => Math.round(r.getBoundingClientRect().height)));
    expect(heights.slice(0, 4)).toEqual([heights[0], heights[0], heights[0], heights[0]]);
    expect(heights[4]).toBeGreaterThan(heights[0]);
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
