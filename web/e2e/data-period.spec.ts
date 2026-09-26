import { test, expect } from "./appTest";

/**
 * S3（Issue #134、親 #104）と E1（`docs/expansion/spec.md` 1.4、Issue #172）。
 * **「有価証券報告書ベース」までは書いてあるのに、それが「いつ」の有報かが
 * サイトのどこにも無かった**のが S3 の出発点で、E1 は**その時点を代表1つから
 * 幅に変えた**（母集団を広げると最頻は 63.5% まで下がり、1,081社の決算期が
 * 違うまま代表を名乗ることになるため）。
 *
 * **単体テスト（`lib/data/period.test.ts`・`lib/seo/ranking.test.ts`）では足りない。**
 * あちらが固定するのは文字列の組み立てで、それが実際に返るHTMLに入るか——
 * とくに**モバイルで隠れる2文目に回っていないか**、**1画面に2回出ていないか**——は
 * 描画を通らないと分からない。
 */

/** 母集団の時点。E2 で窓を12か月に広げたので 14種類・3月期は 63.5% になる。 */
const RANGE = "2025年3月期〜2026年5月期";
/** 1社ぶんの時点。企業詳細は幅ではなくその会社の決算期を出す（E1）。 */
const KEYENCE_PERIOD = "2026年3月期";
/** 4月期の会社（ヤガミ）。**会社ごとに違う値が出ることの実物。** */
const YAGAMI_PERIOD = "2026年4月期";
const BANK = "%E9%8A%80%E8%A1%8C%E6%A5%AD";

async function html(request: import("@playwright/test").APIRequestContext, path: string) {
  const response = await request.get(path);
  expect(response.status(), path).toBe(200);
  return response.text();
}

test.describe("データの時点（S3・E1）", () => {
  /*
   * AC-17（`/` の title）・AC-18（description）・AC-19（本文）を、同じ HTML から見る。**本文は `<body>` 以降に
   * 絞る**——head の title・description・`og:` にも同じ幅が入っているので、HTML 全体で
   * 探すと本文に無くても通る（以前の AC-19 はそうなっていた）。
   *
   * **サーバーが返す HTML に入っていること**を見る。クライアントの描画待ちにすると、
   * クローラにも読み込みの遅い端末にも「いつのデータか」が届かない。
   */
  test("AC-17〜AC-19: `/` の title、ランキングと /about の description と初期HTMLの本文に決算期の幅が入る", async ({
    request,
  }) => {
    for (const path of ["/", "/?age=35", `/?ind=${BANK}`, "/about"]) {
      const page = await html(request, path);
      const description = page.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
      expect(description, `${path} description`).toContain(RANGE);
      expect(page.slice(page.indexOf("<body")), `${path} 本文`).toContain(RANGE);
      // title に入れるのは `/` だけ。ファセットの title は年齢・業種名のほうが情報量が高い。
      if (path === "/") expect(page.match(/<title>([^<]*)<\/title>/)?.[1], "/ の title").toContain(RANGE);
    }
    // 企業詳細は1社ぶんなので幅ではなくその会社の決算期（E1）。
    const description =
      (await html(request, "/company/6861")).match(/<meta name="description" content="([^"]*)"/)?.[1] ??
      "";
    expect(description).toContain(KEYENCE_PERIOD);
    expect(description).not.toContain(RANGE);
  });

  test("AC-19: ランキングの決算期は1文目にある（モバイルで消えない）", async ({ page }) => {
    // 長い文は2文目を `hidden md:inline` にして狭い画面で消すことがある。決算期が
    // そちらに回ると、モバイルの読者にだけ「いつの数字か」が届かない。
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByText(new RegExp(`^${RANGE}の有価証券報告書`))).toBeVisible();

    // 年齢そろえでも同じ位置に残る。
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page.getByText(new RegExp(`^${RANGE}の有価証券報告書の平均年間給与を`))).toBeVisible();
  });

  // 1画面に1回（spec 5.1）。見出しと脚注のように同じ語を重ねない——Issue #128 で
  // 「推定」について決めたのと同じ扱いにする。
  //
  // **`/about` だけは幅と最頻の2つが出る**が、これは同じ語の重複ではなく
  // 「範囲」と「その内訳」という別の情報になる（幅だけだと端の2社が全体を
  // 代表しているように読める）。数えるのは幅のほう。
  test("決算期は1ページに1回だけ出る", async ({ page }) => {
    for (const [path, label] of [
      ["/", RANGE],
      ["/?age=35", RANGE],
      ["/about", RANGE],
    ] as const) {
      await page.goto(path);
      const count = (await page.locator("body").innerText()).split(label).length - 1;
      expect(count, path).toBe(1);
    }
  });

  // **企業詳細だけは2回**（2026-09-24 に spec 5.1 を改めた）。「有価証券報告書の実測値」の
  // 見出しと、**要約の節の説明**。要約は有報の本文を原文にした節で、見出しから離れた位置に
  // あるので、どの年度の有報を要約したのかを節の中で示す。**それ以外の場所には増やさない**
  // ——説明文（C7）の出典の1行に入れて重なったのを、この spec が一度捕まえている。
  //
  // **企業詳細は幅ではなくその会社の決算期**（E1・AC-7）。母集団の幅を出すと、3月期の
  // 会社のページに「〜4月期」が付いてその会社の数字がいつのものかぼやける。4月期の会社
  // （ヤガミ）で別の値が出ることで、**同じ文字列がハードコードされていない**ことも見える。
  test("企業詳細の決算期は実測値の見出しと要約の説明の2か所だけ", async ({ page }) => {
    for (const [path, label] of [
      ["/company/6861", KEYENCE_PERIOD],
      ["/company/7488", YAGAMI_PERIOD],
    ] as const) {
      await page.goto(path);
      const count = (await page.locator("body").innerText()).split(label).length - 1;
      expect(count, path).toBe(2);
      await expect(
        page.getByRole("heading", { name: `有価証券報告書の実測値（${label}）` }),
        path
      ).toBeVisible();
      await expect(page.getByTestId("company-digest"), path).toContainText(`${label}の有価証券報告書`);
    }
  });

  // AC-20。決算期は `companies.meta` から引いており、どこにも直書きしていない。
  // **アプリのコードに現れないこと**は grep では担保できない（テストとdocsには
  // 出てくる）ので、ここでは「データと同じ値が出ている」ことで代える——`meta` を
  // 差し替えれば全ページが一斉に変わることは `lib/seo/ranking.test.ts` が固定している。
  test("AC-20: 画面の決算期が companies.json のデータと一致する", async ({ request }) => {
    const data = await (await request.get("/data/companies.json")).json();
    const label = (period: string) => {
      const [year, month] = period.split("-");
      return `${Number(year)}年${Number(month)}月期`;
    };

    const { from, to } = data.meta.fiscalPeriodRange;
    const [f, t] = [label(from), label(to)];
    const range = f === t ? f : `${f}〜${t.replace(/^\d+年/, from.slice(0, 4) === to.slice(0, 4) ? "" : `${to.slice(0, 4)}年`)}`;
    expect(range).toBe(RANGE);
    expect(await html(request, "/")).toContain(range);

    // 会社ごとの決算期も同じデータから出ている。キーエンスは `rows` の先頭。
    const keyence = data.rows.find((row: unknown[]) => row[0] === "6861");
    expect(label(data.periods[keyence[9]])).toBe(KEYENCE_PERIOD);
  });
});
