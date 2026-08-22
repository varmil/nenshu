import { test, expect } from "@playwright/test";
import { collectPageRequests } from "./network";

/**
 * U12（Issue #80）で足したもの——並び替え・年収バー・偏差値・サイドバー・
 * モバイルの絞り込みシート・業種チップ・ヘッダの検索——の E2E。
 *
 * 既存の絞り込み・検索は `ranking-filters.spec.ts`、表示基準は
 * `ranking-basis.spec.ts` にある。
 */

const rows = (page: import("@playwright/test").Page) =>
  page.getByRole("table").locator("tbody tr");

/**
 * 表は3列（順位・会社名 / 金額 / 偏差値）。平均年齢・在籍年数・従業員数は社名の下の
 * meta 行にあり、順位はロゴ左上のバッジなので**順位の列は無い**。数値は1列目から読む。
 */
const metaValues = async (page: import("@playwright/test").Page, pattern: RegExp) => {
  const cells = await rows(page).locator("td").first().allTextContents();
  return cells.map((text) => Number(text.match(pattern)![1].replace(/,/g, "")));
};

/** 順位バッジの数字。読み上げ用の「位」が textContent に混ざるので落とす。 */
const rankValues = async (page: import("@playwright/test").Page) => {
  const texts = await rows(page).locator("[data-rank-badge]").allTextContents();
  return texts.map((text) => Number(text.replace("位", "")));
};

test.describe("AC-12 並び替え", () => {
  test("平均年齢で並び替えても、順位は1から振り直されない", async ({ page }) => {
    await page.goto("/");
    await expect(rows(page).first()).toContainText("株式会社キーエンス");

    // 3軸とも既定は降順なので、平均年齢を押すと「高い順」から始まる。
    await page
      .getByRole("group", { name: "並び替え" })
      .getByRole("button", { name: "平均年齢 高い順" })
      .click();

    await expect(page).toHaveURL(/[?&]sort=age/);

    // meta 行の平均年齢が降順に並ぶ。
    const values = await metaValues(page, /平均([\d.]+)歳/);
    expect(values).toEqual([...values].sort((a, b) => b - a));

    // 順位バッジは金額基準のまま。1,2,3… にはならない。
    const ranks = await rankValues(page);
    expect(ranks).not.toEqual(ranks.map((_, i) => i + 1));
  });

  test("従業員数が多い順で1位は最大の会社", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("group", { name: "並び替え" })
      .getByRole("button", { name: "従業員数 多い順" })
      .click();

    await expect(page).toHaveURL(/[?&]sort=emp/);
    const employees = await metaValues(page, /・\s*([\d,]+)人/);
    expect(employees).toEqual([...employees].sort((a, b) => b - a));
  });

  test("並び替えを既定に戻すとURLから sort が消える", async ({ page }) => {
    await page.goto("/?sort=age");
    await page
      .getByRole("group", { name: "並び替え" })
      .getByRole("button", { name: "平均年収 高い順" })
      .click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("2ページ目で並び替えると1ページ目に戻る", async ({ page }) => {
    await page.goto("/?page=2");
    await page
      .getByRole("group", { name: "並び替え" })
      .getByRole("button", { name: "平均年齢 高い順" })
      .click();
    await expect(page).toHaveURL(/[?&]sort=age/);
    await expect(page).not.toHaveURL(/[?&]page=/);
  });

  /*
   * 向きの切替（U15・Issue #106）。**同じチップをもう一度押す**という操作なので、
   * 「押した結果いま何順か」がチップの表記・URL・行の並びの3つで揃うことを見る。
   */
  test("同じチップをもう一度押すと向きが反転する", async ({ page }) => {
    await page.goto("/?sort=age");
    const group = page.getByRole("group", { name: "並び替え" });
    await expect(group.getByRole("button", { name: "平均年齢 高い順" })).toBeVisible();

    await group.getByRole("button", { name: "平均年齢 高い順" }).click();

    await expect(page).toHaveURL(/[?&]sort=age-asc/);
    await expect(group.getByRole("button", { name: "平均年齢 若い順" })).toBeVisible();
    const ages = await metaValues(page, /平均([\d.]+)歳/);
    expect(ages).toEqual([...ages].sort((a, b) => a - b));

    // もう一度押すと元の向きに戻り、URLからも向きが消える。
    await group.getByRole("button", { name: "平均年齢 若い順" }).click();
    await expect(page).toHaveURL(/[?&]sort=age(&|$)/);
  });

  test("既定の並びで「平均年収」を押すと低い順になる", async ({ page }) => {
    await page.goto("/");
    await expect(rows(page).first()).toContainText("株式会社キーエンス");

    await page
      .getByRole("group", { name: "並び替え" })
      .getByRole("button", { name: "平均年収 高い順" })
      .click();

    await expect(page).toHaveURL(/[?&]sort=salary-asc/);
    // 順位は金額基準のまま。低い順の先頭は最下位（1,867位）。読み上げ用の「位」が付く。
    await expect(rows(page).first().locator("[data-rank-badge]")).toHaveText("1867位");
  });

  test("逆向きの軸から別の軸へ移ると、その軸の既定の向きになる", async ({ page }) => {
    await page.goto("/?sort=age-asc");
    const group = page.getByRole("group", { name: "並び替え" });

    await group.getByRole("button", { name: "従業員数 多い順" }).click();

    await expect(page).toHaveURL(/[?&]sort=emp(&|$)/);
    const employees = await metaValues(page, /・\s*([\d,]+)人/);
    expect(employees).toEqual([...employees].sort((a, b) => b - a));
  });

  test("sort=emp-asc を直接開くと従業員数の少ない順で描画される", async ({ page }) => {
    await page.goto("/?sort=emp-asc");
    await expect(
      page.getByRole("group", { name: "並び替え" }).getByRole("button", { name: "従業員数 少ない順" })
    ).toBeVisible();
    const employees = await metaValues(page, /・\s*([\d,]+)人/);
    expect(employees).toEqual([...employees].sort((a, b) => a - b));
  });

  test("2ページ目で向きを反転すると1ページ目に戻る", async ({ page }) => {
    await page.goto("/?sort=emp&page=2");
    await page
      .getByRole("group", { name: "並び替え" })
      .getByRole("button", { name: "従業員数 多い順" })
      .click();
    await expect(page).toHaveURL(/[?&]sort=emp-asc/);
    await expect(page).not.toHaveURL(/[?&]page=/);
  });

  test("向きを反転してもネットワークリクエストが発生しない", async ({ page }) => {
    await page.goto("/?sort=age");
    const requests = collectPageRequests(page);

    await page
      .getByRole("group", { name: "並び替え" })
      .getByRole("button", { name: "平均年齢 高い順" })
      .click();
    await expect(page).toHaveURL(/[?&]sort=age-asc/);

    expect(requests).toHaveLength(0);
  });

  /*
   * **3軸とも既定は降順（大きい順）で揃っている**（U15 の直後に平均年齢を反転させた）。
   * 未選択のチップの読み上げ名がその軸の既定の向きなので、初期表示の3つで確かめられる。
   */
  test("どの軸も既定は大きい順で、矢印は下を向く", async ({ page }) => {
    await page.goto("/");
    const group = page.getByRole("group", { name: "並び替え" });
    for (const name of ["平均年収 高い順", "平均年齢 高い順", "従業員数 多い順"]) {
      await expect(group.getByRole("button", { name })).toBeVisible();
    }
    // 選択中（平均年収 高い順）の矢印は下向き。
    const chevron = group.getByRole("button", { name: "平均年収 高い順" }).locator("svg");
    await expect(chevron).toHaveClass(/lucide-chevron-down/);
  });

  test("並び替えでネットワークリクエストが発生しない", async ({ page }) => {
    await page.goto("/");
    const requests = collectPageRequests(page);

    await page
      .getByRole("group", { name: "並び替え" })
      .getByRole("button", { name: "従業員数 多い順" })
      .click();
    await expect(page).toHaveURL(/[?&]sort=emp/);

    expect(requests).toHaveLength(0);
  });
});

test.describe("AC-13 年収バー", () => {
  const barWidth = async (page: import("@playwright/test").Page, index: number) =>
    Number(
      (
        await rows(page)
          .nth(index)
          .locator('[style*="width"]')
          .first()
          .getAttribute("style")
      )
        ?.match(/width:\s*([\d.]+)%/)?.[1] ?? "0"
    );

  test("1位が100%で、以降はその比になる", async ({ page }) => {
    await page.goto("/");
    expect(await barWidth(page, 0)).toBe(100);
    const second = await barWidth(page, 1);
    expect(second).toBeLessThan(100);
    expect(second).toBeGreaterThan(0);
  });

  test("2ページ目では基準が取り直され、先頭がまた100%になる", async ({ page }) => {
    await page.goto("/?page=2");
    expect(await barWidth(page, 0)).toBe(100);
  });

  test("表示基準を切り替えるとバーの基準も取り直される", async ({ page }) => {
    await page.goto("/");
    const before = await barWidth(page, 5);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);

    expect(await barWidth(page, 0)).toBe(100);
    expect(await barWidth(page, 5)).not.toBe(before);
  });

  test("脚注に基準がページ内であることが書いてある", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("table").locator("caption")).toContainText(
      "このページの1位を100%"
    );
  });
});

test.describe("AC-14 偏差値", () => {
  test("実測値のキーエンスは122.9、年齢そろえ35歳では150.0", async ({ page }) => {
    await page.goto("/");
    // 偏差値は3列目（index 2）。順位の列を廃した（アートボード 4d）ぶん1つ左。
    await expect(rows(page).first().locator("td").nth(2)).toContainText("122.9");

    await page.goto("/?age=35");
    await expect(rows(page).first()).toContainText("株式会社キーエンス");
    await expect(rows(page).first().locator("td").nth(2)).toContainText("150.0");
  });

  test("100を超えうることが脚注に書いてある", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("table").locator("caption")).toContainText("100を超える");
  });

  /*
   * **上位◯%は併記しない**（運営者の指示。モックに無いものを足さない）。
   * 100 を超えうることと、順位と併せて読むことは表の脚注に置いてある。
   */
  test("偏差値の列は数字だけで、上位◯%を出さない", async ({ page }) => {
    await page.goto("/");
    const cell = rows(page).first().locator("td").nth(2);
    await expect(cell).toHaveText("122.9");
    await expect(page.getByText("上位0.1%未満")).toHaveCount(0);
  });

  /*
   * 偏差値の母集団は絞り込み後ではなく全1,867社。海運業7社に絞ったときの1位が
   * 「50.0」付近になったら、絞り込んだ集団で計算してしまっている。
   */
  test("絞り込んでも偏差値は全体の分布に対する値のまま", async ({ page }) => {
    await page.goto("/?ind=海運業");
    await expect(rows(page)).toHaveCount(7);
    await expect(rows(page).first().locator("[data-rank-badge]")).toHaveText("1位");
    await expect(rows(page).first().locator("td").nth(2)).toHaveText("97.0");
  });
});

test.describe("サイドバーと件数表示", () => {
  test("PC では絞り込みが左に常設され、スクロールしても追従する", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
    const before = await sidebar.boundingBox();

    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(200);
    const after = await sidebar.boundingBox();

    // sticky なので、ページを送っても画面内に残る（y はスクロール量ほど動かない）。
    expect(after!.y).toBeGreaterThan(before!.y - 1200);
    expect(after!.y).toBeLessThan(800);
  });

  test("件数が「1,867社 中 1〜30社目」の形で出る", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("1,867社 中 1〜30社目")).toBeVisible();
  });

  test("適用中のチップが出て、1つずつ解除できる", async ({ page }) => {
    await page.goto("/?ind=海運業&emp=1000-");
    await expect(page.getByText("適用中")).toBeVisible();

    await page.getByRole("button", { name: /業種の絞り込み「海運業」を解除/ }).click();
    await expect(page).not.toHaveURL(/ind=/);
    await expect(page).toHaveURL(/emp=1000-/);
  });

  test("「すべて解除」で絞り込みだけが外れ、表示基準は残る", async ({ page }) => {
    await page.goto("/?age=35&ind=海運業&q=商船");
    await page.getByRole("button", { name: "すべて解除" }).click();

    await expect(page).toHaveURL(/age=35/);
    await expect(page).not.toHaveURL(/ind=/);
    await expect(page).not.toHaveURL(/q=/);
  });
});

test.describe("業種チップ", () => {
  test("33件のリンクがあり、href はクロールできる形をしている", async ({ page }) => {
    await page.goto("/");
    const chips = page.getByRole("navigation", { name: "業種から見る" }).getByRole("link");
    await expect(chips).toHaveCount(33);
    await expect(chips.first()).toHaveAttribute("href", /^\/\?ind=/);
  });

  test("クリックしても遷移せず、ネットワークリクエストが発生しない", async ({ page }) => {
    await page.goto("/");
    const requests = collectPageRequests(page);

    await page
      .getByRole("navigation", { name: "業種から見る" })
      .getByRole("link", { name: "海運業 7社", exact: true })
      .click();

    await expect(page).toHaveURL(/ind=%E6%B5%B7%E9%81%8B%E6%A5%AD/);
    await expect(rows(page)).toHaveCount(7);
    expect(requests).toHaveLength(0);
  });
});

test.describe("ヘッダの検索", () => {
  test("/ の上ではネットワークリクエストなしで絞り込む", async ({ page }) => {
    await page.goto("/");
    const requests = collectPageRequests(page);

    await page.getByRole("banner").getByRole("searchbox", { name: "会社名で検索" }).fill("商船三井");

    await expect(rows(page)).toHaveCount(1);
    await expect(page).toHaveURL(/q=/);
    expect(requests).toHaveLength(0);
  });

  test("/about から検索すると /?q= に遷移する", async ({ page }) => {
    await page.goto("/about");
    const search = page.getByRole("banner").getByRole("searchbox", { name: "会社名で検索" });
    await search.fill("商船三井");
    await search.press("Enter");

    await expect(page).toHaveURL(/\/\?q=/);
    await expect(rows(page)).toHaveCount(1);
  });

  test("直接 /?q= を開くと検索欄に語が入っている", async ({ page }) => {
    await page.goto("/?q=商船三井");
    await expect(
      page.getByRole("banner").getByRole("searchbox", { name: "会社名で検索" })
    ).toHaveValue("商船三井");
  });
});

test.describe("モバイルの絞り込みシート", () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test("シートを開いて絞り込め、閉じると結果に反映されている", async ({ page }) => {
    await page.goto("/");
    // U13 で `aside` はモバイルでも「適用中」を載せるため消えない。
    // シートに移るのは絞り込みの中身のほう。
    await expect(page.locator("aside").getByRole("group", { name: "従業員数" })).toBeHidden();

    await page.getByRole("button", { name: /絞り込み/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("group", { name: "従業員数" }).getByRole("button", { name: "〜300人" }).click();
    await expect(page).toHaveURL(/emp=-300/);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByText("適用中")).toBeVisible();
  });

  test("並び替えとシートを出しても横スクロールが発生しない", async ({ page }) => {
    await page.goto("/?sort=emp");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

/*
 * U13（Issue #88）でモックに合わせ直した見た目。**機能ではなく形**を固定する。
 * ここが動くと Claude Design の 5a / 5c とまた食い違うので、変えるときは
 * `docs/ranking/ranking-mock-alignment/design.md` の対照表も直すこと。
 */
test.describe("U13 モックとの一致", () => {
  test("表は3列で、社名は省略記号で切れない", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const headers = page.getByRole("table").locator("thead th");
    await expect(headers).toHaveCount(3);
    await expect(headers.first()).toHaveText("順位・会社名");

    // 社名のリンクが、割り当てられた列の中に収まっている（はみ出すと … で切れる）。
    const link = rows(page).first().getByRole("link").first();
    const overflow = await link.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  // 業種は meta 行に出さない（運営者の指示。行が長くなって末尾が見切れていた）。
  test("平均年齢・在籍年数・従業員数は社名の下の1行にまとまっている", async ({ page }) => {
    await page.goto("/");
    const meta = rows(page).first().locator("td").first();
    await expect(meta).toContainText("平均35.0歳 ・ 在籍11.3年 ・ 3,306人");
    await expect(meta).not.toContainText("電気機器");
  });

  test("年齢そろえのときは meta 行に実測値が併記される", async ({ page }) => {
    await page.goto("/?age=35");
    await expect(rows(page).first().locator("td").first()).toContainText("実績 2,178万円");
  });

  test("表示基準の帯にラベルと説明文が付いている", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("並べ方")).toBeVisible();
    // 2文目はPCだけ（モバイルは1行に収める）。ここはPC幅で見ている。
    await expect(page.getByText("有価証券報告書の数値のまま。")).toBeVisible();
    // 同じ文が脚注にもあるので、帯の中のものを厳密に指す。
    await expect(
      page.getByText("年齢の違いは補正していません。", { exact: true })
    ).toBeVisible();

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page.getByText("業種の賃金カーブで補正した推定値です。")).toBeVisible();
  });

  // 実測値でも年齢スイッチは消さない（AC-11）。使えないことは見た目で示す。
  test("実測値では年齢の帯が残り、ヒントが出て、押せない", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("「年齢そろえ」のときだけ使います")).toBeVisible();
    await expect(page.getByRole("button", { name: "35歳" })).toBeDisabled();
  });

  test("業種チップに社数が併記され、本文カラムの中にある", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "業種から見る" });
    await expect(nav.getByRole("link", { name: "海運業 7社", exact: true })).toBeVisible();

    // 表と左端が揃っている＝サイドバーの下ではなく本文カラムの中にいる。
    const navBox = (await nav.boundingBox())!;
    const tableBox = (await page.getByRole("table").boundingBox())!;
    expect(Math.abs(navBox.x - tableBox.x)).toBeLessThanOrEqual(1);
  });

  test("ヘッダの検索は入力欄と検索ボタンが1つの帯になっている", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const banner = page.getByRole("banner");
    const input = banner.getByRole("searchbox", { name: "会社名で検索" });
    const button = banner.getByRole("button", { name: "検索" });
    await expect(button).toBeVisible();

    const inputBox = (await input.boundingBox())!;
    const buttonBox = (await button.boundingBox())!;
    // 罫線を突き合わせて1つの帯にしている（隙間が無い）。
    expect(Math.abs(inputBox.x + inputBox.width - buttonBox.x)).toBeLessThanOrEqual(1);
    // 中央の列を取るので、入力欄はブランドより広い。
    expect(inputBox.width).toBeGreaterThan(300);
  });

  // Issue #96。社名は一覧で最初に読む情報なので太字、金額は本文と同じ 16px に落とす
  // （20px だと金額のほうが先に目に入り、どの会社の数字か読む順序が逆になる）。
  test("社名は太字で、金額は 16px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const row = rows(page).first();
    const name = row.getByRole("link").first();
    await expect(name).toHaveCSS("font-weight", "700");

    const salary = row.locator("td").nth(1).locator("span").first();
    await expect(salary).toHaveText("2,178万円");
    await expect(salary).toHaveCSS("font-size", "16px");
  });
});

test.describe("U13 モックとの一致（モバイル）", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("並び替えと絞り込みが1行に収まり、横スクロールが出ない", async ({ page }) => {
    await page.goto("/");

    const group = page.getByRole("group", { name: "並び替え" });
    const filter = page.getByRole("button", { name: /絞り込み/ });
    const groupBox = (await group.boundingBox())!;
    const filterBox = (await filter.boundingBox())!;
    // 同じ行にいる（上端がほぼ揃う）。
    expect(Math.abs(groupBox.y - filterBox.y)).toBeLessThanOrEqual(2);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("ヘッダが1段に収まる", async ({ page }) => {
    await page.goto("/");
    const brand = page.getByRole("banner").getByRole("link", { name: "OpenReport" });
    const about = page.getByRole("banner").getByRole("link", { name: "計算方法" });
    const brandBox = (await brand.boundingBox())!;
    const aboutBox = (await about.boundingBox())!;
    expect(Math.abs(brandBox.y - aboutBox.y)).toBeLessThanOrEqual(4);
  });

  test("行はカードの枠を持たず、区切り線で並ぶ", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-slot="card"]')).toHaveCount(0);
  });
});

/*
 * 順位バッジ（アートボード 3e / 4d）。順位カラムを廃して、ロゴ左上のホームベース型
 * バッジに移した。**固定幅のレーンに桁数の変わる数字を入れていたのが元の不具合**で、
 * 3〜4桁がレーンからあふれてロゴ画像に重なっていた。ここで固定したいのは
 * 「**桁数が変わっても左端・上端が動かない**」こと——バッジは右へだけ伸びる。
 */
test.describe("順位バッジ", () => {
  /** 1桁・2桁・3桁・4桁がそれぞれ出るページ。1ページ30社なので順位から逆算できる。 */
  const RANKS = [
    ["/", "1"],
    ["/?page=4", "98"],
    ["/?page=32", "946"],
    ["/?page=63", "1866"],
  ] as const;

  const badgeOffset = async (page: import("@playwright/test").Page, rank: string) => {
    const badge = page.locator("tbody tr [data-rank-badge]", { hasText: rank }).first();
    const row = badge.locator("xpath=ancestor::tr");
    const badgeBox = (await badge.boundingBox())!;
    const rowBox = (await row.boundingBox())!;
    return { dx: badgeBox.x - rowBox.x, dy: badgeBox.y - rowBox.y, width: badgeBox.width };
  };

  test("1 / 98 / 946 / 1866 のどれでも左端・上端が揃い、幅だけ右へ伸びる", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    const offsets = [];
    for (const [url, rank] of RANKS) {
      await page.goto(url);
      offsets.push(await badgeOffset(page, rank));
    }

    // 左端・上端は1pxも動かない（min-width が下限で、伸びるのは右だけ）。
    for (const offset of offsets) {
      expect(offset.dx).toBeCloseTo(offsets[0].dx, 1);
      expect(offset.dy).toBeCloseTo(offsets[0].dy, 1);
    }
    // 1桁と2桁は min-width で同じ幅、4桁はそれより広い。
    expect(offsets[1].width).toBeCloseTo(offsets[0].width, 1);
    expect(offsets[3].width).toBeGreaterThan(offsets[0].width);
  });

  /*
   * バッジはロゴの器に**左上の角だけ**乗る。4桁で右へ伸びても器の中に留まり、
   * 社名にも金額にも届かない——元の不具合は数字が社名の側へあふれることだった。
   */
  test("4桁でも器の中に収まり、社名・金額に重ならない", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/?page=63");

    const row = page.locator("tbody tr").first();
    const badge = (await row.locator("[data-rank-badge]").boundingBox())!;
    const logo = (await row.locator("[data-logo]").first().boundingBox())!;
    const name = (await row.getByRole("link").first().boundingBox())!;
    const salary = (await row.locator("td").nth(1).boundingBox())!;

    expect(badge.x + badge.width).toBeLessThan(logo.x + logo.width);
    expect(badge.x + badge.width).toBeLessThan(name.x);
    expect(badge.x + badge.width).toBeLessThan(salary.x);
  });

  test("順位の列を廃したぶん、社名の列が広がっている", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const table = (await page.getByRole("table").boundingBox())!;
    const nameCell = (await rows(page).first().locator("td").first().boundingBox())!;
    // 金額 w-44（176px）と偏差値 w-20（80px）以外はすべて社名の列。順位の列
    // （w-11 = 44px）が残っていればここが 44px 足りなくなる。
    expect(Math.round(nameCell.width)).toBe(Math.round(table.width - 176 - 80));
  });

  test("バッジの数字はロゴの上でも読める（不透明な塗りの上に載る）", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const badge = page.locator("tbody tr [data-rank-badge]").first();
    // 塗りは --rank-badge のトークン。透過させるとロゴが透けて数字が読めなくなる。
    const alpha = await badge.evaluate((el) => {
      const color = getComputedStyle(el).backgroundColor;
      return color.startsWith("rgba") ? Number(color.split(",").pop()!.replace(")", "")) : 1;
    });
    expect(alpha).toBe(1);
  });
});

/*
 * 公開後の指摘（2026-08-20）で直したもの。
 * `docs/ranking/ranking-mock-alignment/design.md` の「公開後に直したもの」に対応する。
 */
test.describe("公開後の手直し", () => {
  /*
   * `Table` の器は `overflow-x-auto` だけを持つ。CSS の仕様では片方が `visible` で
   * ないと `visible` は `auto` に計算されるため、**縦にも `auto` になっていて、
   * 端数で1pxはみ出すと表だけがスクロールする小窓になっていた**（報告あり）。
   */
  test("表の器が縦スクロールを持たない", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const overflowY = await page
      .locator('[data-slot="table-container"]')
      .first()
      .evaluate((el) => getComputedStyle(el).overflowY);
    expect(["visible", "hidden", "clip"]).toContain(overflowY);
  });

  /*
   * サイト名は「最初の状態に戻る」入口。`<Link href="/">` に任せると同じルートへの
   * 遷移で `RankingApp` が作り直されず、**URL だけ `/` になって表は絞り込まれたまま**
   * になっていた（報告あり）。
   */
  test("サイト名を押すと絞り込みも並び替えも解けて、ネットワークが発生しない", async ({
    page,
  }) => {
    await page.goto("/?ind=海運業&sort=age&age=35&q=商船");
    await expect(rows(page)).toHaveCount(1);

    const requests = collectPageRequests(page);

    await page.getByRole("banner").getByRole("link", { name: "OpenReport" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("1,867社 中 1〜30社目")).toBeVisible();
    await expect(page.getByRole("button", { name: "実測値" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(requests).toHaveLength(0);
  });

  test("/about からサイト名を押すとランキングへ遷移する", async ({ page }) => {
    await page.goto("/about");
    await page.getByRole("banner").getByRole("link", { name: "OpenReport" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(rows(page).first()).toContainText("株式会社キーエンス");
  });
});

/*
 * モバイルの行の形（アートボード 2a、Issue #119）。要素の位置関係そのものを固定する。
 * `docs/ranking/ranking-mock-alignment/design.md` の「モバイルの行を4カラムにする」に対応。
 */
test.describe("公開後の手直し（モバイルの行）", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const firstRow = (page: import("@playwright/test").Page) =>
    page.locator("div.md\\:hidden > div").first();

  test("社名は1行で切れ、折り返さない", async ({ page }) => {
    // 金額を 16px に落として社名の幅が広がったぶん（Issue #96）、「大和証券グループ
    // 本社」は 390px で切れなくなった。切り詰めそのものを見たいので長い社名で引く。
    await page.goto("/?q=ジャパンエレベーター");
    const name = firstRow(page).getByRole("link").first();
    // 折り返していれば行が2つになる。切り詰めなら1つ。
    expect(await name.evaluate((el) => el.getClientRects().length)).toBe(1);
    expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });

  /*
   * バーは**金額ブロックの中**に収まる（Issue #119）。行の全幅に伸ばすと順位とロゴの
   * 下まで掛かり、どの社名に対する帯なのかが読めない。
   */
  test("年収バーは金額ブロックの幅に収まり、金額と左端が揃う", async ({ page }) => {
    await page.goto("/");
    const row = firstRow(page);
    const bar = row.locator('[aria-hidden="true"]').last();
    const salary = row.getByText("2,178万円");

    const barBox = (await bar.boundingBox())!;
    const rowBox = (await row.boundingBox())!;
    const salaryBox = (await salary.boundingBox())!;

    // 金額ブロックは 80px（w-20）。4桁のとき金額とバーの幅が揃うことを狙った値。
    expect(barBox.width).toBeCloseTo(80, 0);
    // **バーは PC の表の半分の3px**（Issue #119）。88px の器で6pxだと金額より強い。
    expect(barBox.height).toBeCloseTo(3, 0);
    // **数値の左端とバーの左端が揃う。** 金額を左寄せにした狙いがこれで、桁数の少ない
    // 会社でも崩れない（下の「金額の左端はどの行でも同じ」で全行を見ている）。
    expect(Math.abs(barBox.x - salaryBox.x)).toBeLessThanOrEqual(1);
    // 右端は行の右端に揃う。
    expect(Math.abs(barBox.x + barBox.width - (rowBox.x + rowBox.width))).toBeLessThanOrEqual(2);
    // 行の半分より右——順位・ロゴ・社名の下には掛からない。
    expect(barBox.x).toBeGreaterThan(rowBox.x + rowBox.width / 2);
  });

  test("PC の表のバーは 6px のまま（細くしたのはモバイルの行だけ）", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const bar = rows(page).first().locator('[aria-hidden="true"]').last();
    expect((await bar.boundingBox())!.height).toBeCloseTo(6, 0);
  });

  test("金額の左端はどの行でも同じで、バーの左端と揃う", async ({ page }) => {
    await page.goto("/");
    const lefts = await page
      .locator("div.md\\:hidden > div")
      .evaluateAll((els) =>
        els.slice(0, 9).map((el) => {
          const block = el.lastElementChild!;
          const amount = block.firstElementChild!;
          const bar = block.lastElementChild!;
          return [
            Math.round(amount.getBoundingClientRect().left),
            Math.round(bar.getBoundingClientRect().left),
          ];
        })
      );
    expect(lefts).toHaveLength(9);
    // 9行ぶん、金額の左端もバーの左端も1つの値に収束する。
    expect(new Set(lefts.flat()).size).toBe(1);
  });

  /*
   * **金額を2行に折り返させない。** このサイトは webfont を持たず OS のフォントで組む
   * ので、「2,178万円」の実測幅は環境で変わる。80px に詰めていたとき「円」だけが2行目に
   * 落ちた（報告あり）。ここで見るのは幅の値ではなく**1行に収まっていること**である。
   */
  test("金額は1行に収まり、折り返さない", async ({ page }) => {
    await page.goto("/");
    const lines = await page
      .locator("div.md\\:hidden > div")
      .evaluateAll((els) =>
        els.slice(0, 9).map((el) => el.lastElementChild!.firstElementChild!.getClientRects().length)
      );
    expect(lines).toEqual(Array(9).fill(1));
  });

  /*
   * meta 行は `justify-between` ではなく**小さなギャップで隣り合う**（アートボード 2a）。
   * 両端に振ると、社名が短い行では平均年齢と偏差値が離れて別々の情報に見える。
   */
  test("平均年齢と偏差値は隣り合い、両端に振り分けられない", async ({ page }) => {
    // 社名が短く、meta 行に余白が残る会社で見る。
    await page.goto("/?q=ディスコ");
    const row = firstRow(page);
    const age = row.getByText(/^平均/);
    const deviation = row.getByText(/^偏差値/);

    const ageBox = (await age.boundingBox())!;
    const deviationBox = (await deviation.boundingBox())!;
    // gap-2（8px）ぶんしか空いていない。
    expect(deviationBox.x - (ageBox.x + ageBox.width)).toBeLessThanOrEqual(12);
    expect(deviationBox.x).toBeGreaterThan(ageBox.x + ageBox.width - 1);
  });

  /*
   * **順位はロゴに載るので独立した列ではない。** 4カラム（順位 / ロゴ / 社名 / 金額）
   * だった頃の順位レーンを廃したぶん、社名の列が広がっている。
   */
  test("行は 順位つきロゴ / 社名 / 金額 の3カラムに左から並ぶ", async ({ page }) => {
    await page.goto("/");
    const row = firstRow(page);

    const logo = row.locator('[data-logo="image"], [data-logo="initial"]');
    const name = row.getByRole("link").first();
    const salary = row.getByText("2,178万円");

    const boxes = await Promise.all(
      [logo, name, salary].map(async (l) => (await l.boundingBox())!)
    );
    const lefts = boxes.map((b) => Math.round(b.x));
    expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
    // 重なっていない（それぞれ独立した列にいる）。
    for (let i = 0; i < boxes.length - 1; i++) {
      expect(boxes[i].x + boxes[i].width).toBeLessThanOrEqual(boxes[i + 1].x + 1);
    }

    // バッジだけはロゴの左上に重なる（列ではない）。
    const badge = (await row.locator("[data-rank-badge]").boundingBox())!;
    expect(badge.x).toBeLessThan(boxes[0].x);
    expect(badge.x + badge.width).toBeGreaterThan(boxes[0].x);
    expect(badge.x + badge.width).toBeLessThan(boxes[1].x);
  });

  test("ロゴの器はこの行だけ 68×48 で、全行そろう", async ({ page }) => {
    await page.goto("/");
    const sizes = await page
      .locator('div.md\\:hidden [data-logo="image"], div.md\\:hidden [data-logo="initial"]')
      .evaluateAll((els) => [
        ...new Set(
          els.map((el) => {
            const b = el.getBoundingClientRect();
            return `${Math.round(b.width)}x${Math.round(b.height)}`;
          })
        ),
      ]);
    expect(sizes).toEqual(["68x48"]);
  });

  test("行の高さはロゴで決まり、9社ぶんが等間隔になる", async ({ page }) => {
    await page.goto("/");
    const heights = await page
      .locator("div.md\\:hidden > div")
      .evaluateAll((els) =>
        els.slice(0, 9).map((el) => Math.round(el.getBoundingClientRect().height))
      );
    expect(heights).toHaveLength(9);
    // 社名の長さによらず同じ高さ。ロゴ48px＋py-2.5（上下10px）＋区切り線が下限。
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toBeGreaterThanOrEqual(68);
  });

  test("「本社のみ」はモバイルの行に出ない（PCの表には残る）", async ({ page }) => {
    // 三菱商事は hasBadge を持つ会社（`about.spec.ts` の実例と同じ）。
    await page.goto("/?q=三菱商事");
    await expect(page.locator("div.md\\:hidden").getByText("本社のみ")).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(rows(page).first().getByText("本社のみ")).toBeVisible();
  });

  test("ロゴは行の縦中央にある", async ({ page }) => {
    await page.goto("/");
    const row = firstRow(page);
    const logo = row.locator("[data-logo]").first();
    const rowBox = (await row.boundingBox())!;
    const logoBox = (await logo.boundingBox())!;
    const rowCenter = rowBox.y + rowBox.height / 2;
    const logoCenter = logoBox.y + logoBox.height / 2;
    expect(Math.abs(rowCenter - logoCenter)).toBeLessThanOrEqual(2);
  });

  /*
   * PC と同じ記号に統一してある（アートボード 3e）。寸法だけが sm（高さ21px）。
   */
  test("順位はロゴ左上のバッジで、桁が増えても左端・上端が動かない", async ({ page }) => {
    const offset = async (url: string, rank: string) => {
      await page.goto(url);
      const badge = page
        .locator("div.md\\:hidden [data-rank-badge]", { hasText: rank })
        .first();
      const logo = badge.locator("xpath=preceding-sibling::*[1]");
      const badgeBox = (await badge.boundingBox())!;
      const logoBox = (await logo.boundingBox())!;
      return { dx: badgeBox.x - logoBox.x, dy: badgeBox.y - logoBox.y, width: badgeBox.width };
    };

    const one = await offset("/", "1");
    const four = await offset("/?page=63", "1866");

    expect(four.dx).toBeCloseTo(one.dx, 1);
    expect(four.dy).toBeCloseTo(one.dy, 1);
    expect(four.width).toBeGreaterThan(one.width);
    // 器の外へ大きく出しているので、ロゴに被るのはごく一部（1桁で6px）。
    expect(one.dx).toBeLessThan(0);
  });

  // Issue #96。PC と同じ手当て（社名を太字・金額を 16px）をモバイルの行にも入れる。
  test("社名は太字で、金額は 16px", async ({ page }) => {
    await page.goto("/");
    const row = firstRow(page);

    await expect(row.getByRole("link").first()).toHaveCSS("font-weight", "700");

    const salary = row.getByText("2,178万円");
    await expect(salary).toHaveCSS("font-size", "16px");
  });

  test("見出しと説明文がそれぞれ1行に収まる", async ({ page }) => {
    await page.goto("/");
    const lines = async (locator: import("@playwright/test").Locator) =>
      locator.evaluate((el) => el.getClientRects().length);

    expect(await lines(page.getByRole("heading", { level: 1 }))).toBe(1);
    expect(await lines(page.getByText("有価証券報告書の平均年間給与（単体）で1,867社。"))).toBe(1);
    expect(await lines(page.getByText("有価証券報告書の数値のまま。"))).toBe(1);
  });
});


/*
 * 受け入れ条件（Issue #119）——**社名が切れても偏差値と金額は常に全部見える**。
 * 360px は最も狭い実機の幅で、ここで偏差値が省略記号に飲まれると「他社と見比べる」
 * 数値が2つとも読めなくなる。実測値・年齢そろえの両モードで見る（金額の桁が
 * 基準で変わるため）。
 */
for (const width of [390, 360]) {
  test.describe(`モバイルの行が縮んでも数値が残る（${width}px）`, () => {
    test.use({ viewport: { width, height: 844 } });

    for (const [label, path] of [
      ["実測値", "/?q=ジャパンエレベーター"],
      ["年齢そろえ", "/?q=ジャパンエレベーター&age=35"],
    ] as const) {
      test(`${label}: 偏差値と金額が切り詰められない`, async ({ page }) => {
        await page.goto(path);
        const row = page.locator("div.md\\:hidden > div").first();

        // 社名は切れてよい（切れていること自体は別テストで見ている）。
        const deviation = row.getByText(/^偏差値/);
        const salary = row.getByText(/万円$/);
        const rowBox = (await row.boundingBox())!;

        for (const target of [deviation, salary]) {
          await expect(target).toBeVisible();
          /*
             インライン要素の `clientWidth` は 0 なので、切り詰めは `scrollWidth` では
             測れない。**描かれた箱と、中身の文字が本来必要とする幅を比べる。**
          */
          const fits = await target.evaluate((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            const box = el.getBoundingClientRect();
            return {
              drawn: box.width,
              needed: range.getBoundingClientRect().width,
              left: box.left,
              right: box.right,
              lines: el.getClientRects().length,
            };
          });
          // 1行に収まり、必要な幅がそのまま与えられている（省略記号に飲まれない）。
          expect(fits.lines).toBe(1);
          expect(fits.drawn).toBeGreaterThanOrEqual(fits.needed - 0.5);
          // 行の中に収まっている（押し出されていない）。
          expect(fits.left).toBeGreaterThanOrEqual(rowBox.x - 0.5);
          expect(fits.right).toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
        }

        // ページに横スクロールが出ない。
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }

    // 行は30件ぶん縦に繰り返されるので、表示基準の語をそこに置かない（Issue #128）。
    // 推定であることは帯と一覧の脚注が持つ（AC-9）。
    test("行には「推定」の一語を置かない（どちらの表示基準でも）", async ({ page }) => {
      await page.goto("/");
      const rows = page.locator("div.md\\:hidden > div");
      await expect(rows.getByText("推定", { exact: true })).toHaveCount(0);

      await page.goto("/?age=35");
      await expect(rows.getByText("推定", { exact: true })).toHaveCount(0);
      await expect(
        page.getByText("業種の賃金カーブで補正した推定値です。")
      ).toBeVisible();
    });
  });
}
