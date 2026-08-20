import { test, expect } from "@playwright/test";

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
 * U13 で表は4列（順位 / 会社名・業種 / 金額 / 偏差値）になり、平均年齢・在籍年数・
 * 従業員数は社名の下の meta 行に移った。数値はそこから読む。
 */
const metaValues = async (page: import("@playwright/test").Page, pattern: RegExp) => {
  const cells = await rows(page).locator("td").nth(1).allTextContents();
  return cells.map((text) => Number(text.match(pattern)![1].replace(/,/g, "")));
};

test.describe("AC-12 並び替え", () => {
  test("平均年齢が若い順に並び替えても、順位は1から振り直されない", async ({ page }) => {
    await page.goto("/");
    await expect(rows(page).first()).toContainText("株式会社キーエンス");

    await page
      .getByRole("group", { name: "並び替え" })
      .getByRole("button", { name: "平均年齢 若い順" })
      .click();

    await expect(page).toHaveURL(/[?&]sort=age/);

    // meta 行の平均年齢が昇順に並ぶ。
    const values = await metaValues(page, /平均([\d.]+)歳/);
    expect(values).toEqual([...values].sort((a, b) => a - b));

    // 順位（1列目）は金額基準のまま。1,2,3… にはならない。
    const ranks = (await rows(page).locator("td").first().allTextContents()).map(Number);
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
      .getByRole("button", { name: "平均年齢 若い順" })
      .click();
    await expect(page).toHaveURL(/[?&]sort=age/);
    await expect(page).not.toHaveURL(/[?&]page=/);
  });

  test("並び替えでネットワークリクエストが発生しない", async ({ page }) => {
    await page.goto("/");
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));

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
    // 偏差値は4列目（index 3）。上位◯%が下に添う。
    await expect(rows(page).first().locator("td").nth(3)).toContainText("122.9");

    await page.goto("/?age=35");
    await expect(rows(page).first()).toContainText("株式会社キーエンス");
    await expect(rows(page).first().locator("td").nth(3)).toContainText("150.0");
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
    const cell = rows(page).first().locator("td").nth(3);
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
    const first = rows(page).first().locator("td");
    await expect(first.first()).toHaveText("1");
    await expect(first.nth(3)).toHaveText("97.0");
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
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));

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
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));

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
  test("表は4列で、社名は省略記号で切れない", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const headers = page.getByRole("table").locator("thead th");
    await expect(headers).toHaveCount(4);
    await expect(headers.nth(1)).toHaveText("会社名");

    // 社名のリンクが、割り当てられた列の中に収まっている（はみ出すと … で切れる）。
    const link = rows(page).first().getByRole("link").first();
    const overflow = await link.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  // 業種は meta 行に出さない（運営者の指示。行が長くなって末尾が見切れていた）。
  test("平均年齢・在籍年数・従業員数は社名の下の1行にまとまっている", async ({ page }) => {
    await page.goto("/");
    const meta = rows(page).first().locator("td").nth(1);
    await expect(meta).toContainText("平均35.0歳 ・ 在籍11.3年 ・ 3,306人");
    await expect(meta).not.toContainText("電気機器");
  });

  test("年齢そろえのときは meta 行に実測値が併記される", async ({ page }) => {
    await page.goto("/?age=35");
    await expect(rows(page).first().locator("td").nth(1)).toContainText("実績 2,178万円");
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

    const salary = row.locator("td").nth(2).locator("span").first();
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

    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));

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
 * モバイルの行の形（アートボード 5c）。公開後の指摘で並べ直したので、要素の
 * 位置関係そのものを固定する。
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

  test("年収バーは社名の列の中にあり、順位とロゴの下まで伸びない", async ({ page }) => {
    await page.goto("/");
    const row = firstRow(page);
    const bar = row.locator('[aria-hidden="true"]').last();
    const logo = row.locator("span").first();

    const barBox = (await bar.boundingBox())!;
    const rowBox = (await row.boundingBox())!;
    const logoBox = (await logo.boundingBox())!;
    // 左端が順位・ロゴより右にある。
    expect(barBox.x).toBeGreaterThan(logoBox.x + logoBox.width);
    // 右端は行の右端に揃う。
    expect(Math.abs(barBox.x + barBox.width - (rowBox.x + rowBox.width))).toBeLessThanOrEqual(2);
  });

  test("順位は行の縦中央にある", async ({ page }) => {
    await page.goto("/");
    const row = firstRow(page);
    const rank = row.locator("span").first();
    const rowBox = (await row.boundingBox())!;
    const rankBox = (await rank.boundingBox())!;
    const rowCenter = rowBox.y + rowBox.height / 2;
    const rankCenter = rankBox.y + rankBox.height / 2;
    expect(Math.abs(rowCenter - rankCenter)).toBeLessThanOrEqual(2);
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
