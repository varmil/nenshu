import { test, expect } from "./appTest";
import type { Page } from "@playwright/test";
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

  /*
   * E6（Issue #182）。母集団を広げた E2（#173）の直後、新しく入った1,094社は
   * **稼ぐ力の軸だけが欠けていた**——`buildPerformance` が取れない会社を `null` に
   * するので画面は壊れず、**壊れないので気づけない**のが問題だった。ＩＮＰＥＸは
   * その1,094社の1つで、いまは稼ぐ力が全体1位（2,959社中1位）に出る。
   */
  test("E6 で入った会社でも稼ぐ力の軸が出る（ＩＮＰＥＸ）", async ({ page }) => {
    await page.goto("/company/1605");
    const svg = chart(page);
    // 4軸とも値があるので、平均年収と合わせて5つの頂点が出る。
    await expect(svg.locator("circle")).toHaveCount(5);
    await expect(svg).toContainText("稼ぐ力");
    await expect(section(page)).toContainText("2,959社中1位");
    // 業種中央値の併記も新規社で出る（spec 1.3）。
    await expect(section(page)).toContainText("鉱業の中央値");
  });

  /*
   * W2（Issue 185・Issue 207 例1）。**「公表していない」と「区分ごとに公表して
   * いる」を図の上で分ける。** 規則（1点に代表を選ばない）は変えていないので
   * 頂点は打たないが、「掲載なし」のままだと**節に値が出ているのに図だけ
   * 掲載なし**になり、読者からは壊れて見える（有給221社・残業114社）。
   */
  test("区分ごとに公表している軸は「区分別」（ラクス）", async ({ page }) => {
    await page.goto("/company/3923");
    const svg = chart(page);
    await expect(svg).toContainText("有給の取得");
    await expect(svg).toContainText("区分別");
    // 頂点は打たない（有給を除く4軸）。
    await expect(svg.locator("circle")).toHaveCount(4);
    // 値そのものは下の節に区分のまま出ている。
    const worklife = page
      .getByRole("heading", { name: "残業・有給・男女の賃金の差異" })
      .locator("xpath=..");
    await expect(worklife).toContainText("92.7");
    await expect(worklife).toContainText("96.8");
    // 図の説明文が「区分別」の意味を引き受ける（値の列は3文字ぶんしか無い）。
    await expect(section(page)).toContainText("雇用管理区分ごとに公表している会社は「区分別」");
  });
});

/*
 * W2（Issue 185）——女性活躍DBの入力ミスとみられる値を取り込み時に落とした。
 * **図と節の両方で消えていること**を見る（片方だけ残ると食い違いを作る）。
 */
test.describe("W2 入力ミスとみられる値", () => {
  test("有給 100% ちょうどは落とし、区分別の 63.7% が出る（ソニーグループ）", async ({
    page,
  }) => {
    await page.goto("/company/6758");
    await expect(chart(page)).toContainText("63.7%");
    // 100% はページのどこにも出ない。
    await expect(page.locator("body")).not.toContainText("100.0%");
  });

  test("残業 0.0h は落として掲載なしにする（野村総合研究所）", async ({ page }) => {
    await page.goto("/company/4307");
    const svg = chart(page);
    await expect(svg).toContainText("残業時間");
    await expect(svg).toContainText("掲載なし");
    // 「区分別」ではない——値が1つも残っていないので公表していない扱いになる。
    await expect(svg).not.toContainText("区分別");
    const worklife = page
      .getByRole("heading", { name: "残業・有給・男女の賃金の差異" })
      .locator("xpath=..");
    await expect(worklife).not.toContainText("0.0h");
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
    await expect(list).toContainText("1,264社中1,245位");
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
          // 値・順位は行の `dd` そのもの（grid の列）。3つ目は2行目の帯。
          const cells = row.querySelectorAll("dd");
          // **文字そのものの右端を測る。** 器は固定幅なので、`text-align` を
          // 変えても要素の矩形は動かない——`Range` なら中身の位置が出る。
          const textRight = (el: Element) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return Math.round(range.getBoundingClientRect().right);
          };
          return [
            Math.round(cells[0].getBoundingClientRect().right),
            Math.round(cells[1].getBoundingClientRect().right),
            textRight(cells[1]),
          ];
        })
      );
    expect(rows).toHaveLength(5);
    // 掲載なしの行も同じ幅の空きを残す（詰めるとその行だけ右へ寄る）。
    const withRank = rows.filter((r) => r[2] > 0);
    expect(withRank.length).toBeGreaterThan(1);
    for (const row of rows) expect(row.slice(0, 2)).toEqual(rows[0].slice(0, 2));
    // 桁数の違う順位（`2,961社中3位` と `1,266社中1,246位`）が右端でそろう。
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
            const cells = row.querySelectorAll("dd");
            const inner = (el: Element) => {
              const range = document.createRange();
              range.selectNodeContents(el);
              return Math.round(range.getBoundingClientRect().width);
            };
            return {
              text: cells[1].textContent ?? "",
              // 値・順位とも「中身の幅 ≤ 器の幅」。
              value: [inner(cells[0]), Math.round(cells[0].getBoundingClientRect().width)],
              rank: [inner(cells[1]), Math.round(cells[1].getBoundingClientRect().width)],
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
      const cells = el.querySelectorAll("dd");
      // 中央値は2行目の帯（`dd`）の中で右寄せ。**帯の矩形ではなく文字の右端**を測る。
      const note = cells[2].querySelector("span:last-child")!;
      return [
        Math.round(cells[1].getBoundingClientRect().right),
        Math.round(note.getBoundingClientRect().right),
      ];
    });
    await expect(row).toContainText("電気機器の中央値");
    expect(medianRight).toBe(rankRight);
  });

  /*
   * 業種名が長い会社（`証券、商品先物取引業`）。**中央値の注記は業種名の長さで
   * 伸びる**ので、値と順位の器に同居させると桁そろえを壊す——実際に稼ぐ力の行
   * だけが 9.3px 右へずれ、器の右端（296px）からはみ出していた。**注記は行の
   * 2行目に降ろし、収まらなければ独立した行に落とす**（業種名は略さない）。
   */
  test("業種名が長くても値と順位の列が動かない（大和証券グループ本社）", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/company/8601");
    const list = section(page).locator("dl");
    await expect(list).toContainText("証券、商品先物取引業の中央値");

    const box = await list.evaluate((dl) => {
      const rows = [...dl.querySelectorAll(":scope > div")];
      return {
        listRight: Math.round(dl.getBoundingClientRect().right),
        rows: rows.map((row) => {
          const cells = [...row.querySelectorAll("dd")];
          return {
            value: Math.round(cells[0].getBoundingClientRect().right),
            rank: Math.round(cells[1].getBoundingClientRect().right),
            // **行の矩形は器の幅のままなので、中身の右端を測る。**
            // はみ出していた `dd` は 805px にあったが、行そのものは 796px だった。
            right: Math.round(
              Math.max(...cells.map((c) => c.getBoundingClientRect().right))
            ),
          };
        }),
      };
    });
    expect(box.rows).toHaveLength(5);
    for (const row of box.rows) {
      expect(row.value).toBe(box.rows[0].value);
      expect(row.rank).toBe(box.rows[0].rank);
      // 中身が器の右端を超えない（行の矩形を見ていると気づけない）。
      expect(row.right).toBeLessThanOrEqual(box.listRight);
    }
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
