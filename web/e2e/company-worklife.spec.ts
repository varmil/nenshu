import { test, expect } from "./appTest";
import type { Page } from "@playwright/test";
import { collectPageRequests } from "./network";

/**
 * W1（Issue #150）——企業詳細ページの「残業・有給・男女の賃金の差異」の節。
 * `docs/worklife/spec.md` の AC-6〜AC-12 に対応する。
 *
 * 値そのものは `lib/data/worklife.test.ts` が実データで固定しているので、ここは
 * **ブラウザでどう出るか**（区分が5つある会社で崩れないか・表示基準と独立か・
 * JS実行前のHTMLに入っているか）だけを見る。
 */

const section = (page: Page) =>
  page.getByRole("heading", { name: "残業・有給・男女の賃金の差異" }).locator("xpath=..");

/** 1指標ぶんの器。`dt` の親（2カラムの行）を取る。 */
const metric = (page: Page, label: string) =>
  section(page).getByRole("term").filter({ hasText: label }).locator("xpath=../..");

test.describe("AC-6 平均残業時間", () => {
  test("全体値と公表する範囲が出る（トヨタ自動車）", async ({ page }) => {
    await page.goto("/company/7203");
    const overtime = metric(page, "平均残業時間");
    await expect(overtime).toContainText("20.3");
    await expect(overtime).toContainText("対象正社員");
    // 単位は値の隣（`20.3h`）。見出しには期間だけが残る。
    await expect(overtime).toContainText("月あたり");
  });

  test("雇用管理区分の4件が登録順で出る（三菱商事）", async ({ page }) => {
    await page.goto("/company/8058");
    const overtime = metric(page, "平均残業時間");
    // **平均して1つの値にしない**（spec 1.4）。4区分がそのまま並ぶ。
    for (const value of ["10.5", "14.1", "3.3", "3.2", "5.6"]) {
      await expect(overtime).toContainText(value);
    }
    const text = (await overtime.innerText()).replace(/\s+/g, "");
    // 登録順（総合職 → 一般職 → 嘱託その他 → 派遣社員）。値の大小で並べ替えない。
    expect(text.indexOf("総合職")).toBeLessThan(text.indexOf("一般職"));
    expect(text.indexOf("一般職")).toBeLessThan(text.indexOf("嘱託その他"));
    expect(text.indexOf("嘱託その他")).toBeLessThan(text.indexOf("派遣社員"));
  });
});

test.describe("AC-6b 区分名をそのまま出す", () => {
  test("職能で切る会社（新日本空調）", async ({ page }) => {
    await page.goto("/company/1952");
    const overtime = metric(page, "平均残業時間");
    await expect(overtime).toContainText("営業・管理系");
    await expect(overtime).toContainText("技術系");
    // こちらで決めた分類に振り替えない。
    await expect(overtime).not.toContainText("正規雇用");
  });

  test("組織階層と雇用形態が混ざる会社（みずほ銀行）", async ({ page }) => {
    await page.goto("/company/E03532");
    const overtime = metric(page, "平均残業時間");
    for (const unit of ["カンパニー", "ユニット", "グループ", "無期契約フルタイム"]) {
      await expect(overtime).toContainText(unit);
    }
  });
});

test.describe("AC-7 年次有給休暇の取得率", () => {
  test("全体値だけの会社（LINEヤフー）", async ({ page }) => {
    await page.goto("/company/4689");
    await expect(metric(page, "年次有給休暇の取得率")).toContainText("87.4");
  });

  test("区分つきの会社（キーエンス）", async ({ page }) => {
    await page.goto("/company/6861");
    const paid = metric(page, "年次有給休暇の取得率");
    await expect(paid).toContainText("正社員");
    await expect(paid).toContainText("38.8");
  });

  test("100%超が繰越分の消化であることを注記する", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(section(page)).toContainText("繰越分の消化により100%を超えることがあります");
  });
});

test.describe("AC-8 男女の賃金の差異", () => {
  test("3つの値と定義が出る（トヨタ自動車）", async ({ page }) => {
    await page.goto("/company/7203");
    const gap = metric(page, "男女の賃金の差異");
    await expect(gap).toContainText("67.0");
    await expect(gap).toContainText("66.8");
    await expect(gap).toContainText("59.7");
    // **数字だけを単独で置かない**（spec 2.4）。
    await expect(gap).toContainText("女性の平均賃金 ÷ 男性の平均賃金 × 100");
  });

  test("差異の主因についての注記がある", async ({ page }) => {
    await page.goto("/company/7203");
    await expect(section(page)).toContainText("職種構成や勤続年数の差が主因");
  });

  test("会社が登録した説明はそのまま出る", async ({ page }) => {
    await page.goto("/company/8058");
    const note = section(page).getByText("会社が登録した説明");
    await expect(note).toBeVisible();
    await expect(section(page)).toContainText("同一資格・同一職務レベル");
  });
});

test.describe("AC-9 出典と時点", () => {
  test("出典・自己申告値・集計時点・対象期間が出る", async ({ page }) => {
    await page.goto("/company/7203");
    const worklife = section(page);
    await expect(worklife).toContainText("厚生労働省「女性の活躍推進企業データベース」");
    await expect(worklife).toContainText("自己申告値");
    await expect(worklife).toContainText("2026年3月時点");
    await expect(worklife).toContainText("2025年4月1日～2026年3月31日");
    await expect(worklife).toContainText("監査を経ていません");
  });

  test("節の中に「推定」の語も「実測値」の語も無い", async ({ page }) => {
    await page.goto("/company/7203");
    // 「実測値」は有報の平均年間給与を指す語で、ここで使うと意味が衝突する（glossary）。
    await expect(section(page)).not.toContainText("推定");
    await expect(section(page)).not.toContainText("実測値");
  });
});

test.describe("AC-10 データが無いとき", () => {
  test("一部だけ無い会社は、その指標だけ「掲載なし」（キーエンス）", async ({ page }) => {
    await page.goto("/company/6861");
    const overtime = metric(page, "平均残業時間");
    await expect(overtime).toContainText("掲載なし");
    await expect(overtime).toContainText("残業時間をデータベースに登録していません");
    // 節ごと消さない。有給と賃金の差異は出る。
    await expect(metric(page, "年次有給休暇の取得率")).toContainText("38.8");
    await expect(metric(page, "男女の賃金の差異")).toContainText("43.2");
  });

  test("掲載が無い会社でも節は出て、掲載が任意である旨が書かれる（三菱UFJ）", async ({
    page,
  }) => {
    await page.goto("/company/8306");
    const worklife = section(page);
    await expect(worklife).toBeVisible();
    await expect(worklife).toContainText("掲載がありません");
    await expect(worklife).toContainText("掲載は任意");
    // 3指標の器はすべて残る。
    for (const label of ["平均残業時間", "年次有給休暇の取得率", "男女の賃金の差異"]) {
      await expect(metric(page, label)).toContainText("掲載なし");
    }
  });

  /**
   * Issue #192。ベンチマークの iPhone 12 Pro（横幅390px）で、3指標の1文が
   * **どれも1行に収まる**こと。**文言ではなく高さで見る**——折り返しは字数と
   * 器の幅の兼ね合いで決まるので、文言を書き写しても崩れは捕まらない。
   */
  test("「掲載なし」の1文が390pxで1行に収まる", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/company/8306");
    for (const label of ["平均残業時間", "年次有給休暇の取得率", "男女の賃金の差異"]) {
      const note = metric(page, label).getByText("データベースに登録していません");
      await expect(note).toBeVisible();
      const lines = await note.evaluate(
        (el) =>
          el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)
      );
      expect(Math.round(lines), `${label} の1文が折り返している`).toBe(1);
    }
  });
});

test.describe("AC-11 表示基準と独立", () => {
  test("年齢そろえに切り替えても値が変わらず、ページ遷移も起きない", async ({ page }) => {
    // **ハイドレーションを待つ**（company-radar.spec.ts の AC-11 と同じ理由）。
    // 値は SSR の HTML にあるので、`toContainText` は押せる状態を待たない。
    await page.goto("/company/7203", { waitUntil: "networkidle" });
    const overtime = metric(page, "平均残業時間");
    await expect(overtime).toContainText("20.3");

    const requests = collectPageRequests(page);
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();

    await expect(overtime).toContainText("20.3");
    await expect(metric(page, "男女の賃金の差異")).toContainText("67.0");
    expect(requests).toHaveLength(0);
  });

  // 表示基準は URL に出さない（R1・ADR-0012）。60歳を選んでも自己申告値は変わらない。
  test("60歳そろえにしても同じ値", async ({ page }) => {
    await page.goto("/company/7203");
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("button", { name: "60歳" }).click();
    await expect(metric(page, "平均残業時間")).toContainText("20.3");
    await expect(metric(page, "男女の賃金の差異")).toContainText("67.0");
  });
});

test.describe("AC-12 レイアウトと初期HTML", () => {
  test("390px で横スクロールが出ず、区分5件が読める（三菱商事）", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/company/8058");
    const overtime = metric(page, "平均残業時間");
    await expect(overtime).toContainText("派遣社員");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("長い区分名でも省略記号にしない（商船三井）", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/company/9104");
    // `契約社員(フルタイム)` は16文字級。**字を落として収める。切らない。**
    await expect(metric(page, "平均残業時間")).toContainText("契約社員(フルタイム)");
  });

  test("JS実行前のHTMLに値が入っている（SEO・spec 3.）", async ({ request }) => {
    const html = await (await request.get("/company/7203")).text();
    expect(html).toContain("20.3");
    expect(html).toContain("67.0");
    expect(html).toContain("残業・有給・男女の賃金の差異");
  });
});

/*
 * Issue 191（2巡目・アートボード 6b / 6c）。W1 は「空のメモリを描くと器の長さが
 * 先に目に入る」として塗られたメモリだけを並べていたが、**下敷きが無いと
 * 目盛りの基準が消え、10.5 と 26.0 の差がどれだけのうちの差か読めない。**
 */
test.describe("モックとの一致（2巡目）", () => {
  /** 実際に塗られている面積を持つか。`transparent` は 0 で返る。 */
  const alphaOf = (color: string) => {
    const m = color.match(/[\d.]+/g);
    if (m === null) return 0;
    return m.length >= 4 ? Number(m[3]) : 1;
  };

  test("バーにグレーの下敷きがある（残業・有給とも）", async ({ page }) => {
    await page.goto("/company/8058");
    for (const label of ["平均残業時間", "年次有給休暇の取得率"]) {
      const track = metric(page, label).locator("dd span[aria-hidden] ").first();
      const bg = await track.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(alphaOf(bg)).toBeGreaterThan(0);
    }
  });

  test("塗りは器の中で値の割合ぶんだけ伸びる（10.5 は 26.0 より短い）", async ({ page }) => {
    await page.goto("/company/8058");
    const widths = await metric(page, "平均残業時間")
      .locator("dd span[aria-hidden]")
      .evaluateAll((tracks) =>
        tracks.map((t) => {
          const fill = t.firstElementChild as HTMLElement | null;
          return fill === null ? -1 : Math.round(fill.getBoundingClientRect().width);
        })
      );
    // 「その他 10.5」「総合職 14.1」——器は同じ幅なので、塗りの長さで比べられる。
    expect(widths[0]).toBeGreaterThan(0);
    expect(widths[1]).toBeGreaterThan(widths[0]);
  });

  test("器の幅は全行そろう（左端も右端も動かない）", async ({ page }) => {
    await page.goto("/company/8058");
    const boxes = await metric(page, "平均残業時間")
      .locator("dd span[aria-hidden]")
      .evaluateAll((tracks) =>
        tracks.map((t) => {
          const r = t.getBoundingClientRect();
          return [Math.round(r.left), Math.round(r.width)];
        })
      );
    expect(boxes.length).toBeGreaterThan(1);
    for (const box of boxes) expect(box).toEqual(boxes[0]);
  });

  test("賃金の差異は全労働者だけ太く、内訳は muted になる", async ({ page }) => {
    await page.goto("/company/7203");
    const rows = await metric(page, "男女の賃金の差異")
      .locator("dd > div > div")
      .evaluateAll((lines) =>
        lines.map((line) => {
          const [label, value] = [...line.children] as HTMLElement[];
          return {
            text: label.textContent,
            labelColor: getComputedStyle(label).color,
            weight: Number(getComputedStyle(value).fontWeight),
            size: Math.round(parseFloat(getComputedStyle(value).fontSize)),
          };
        })
      );
    expect(rows).toHaveLength(3);
    expect(rows[0].weight).toBeGreaterThanOrEqual(600);
    // うち正規・うち非正規は太字をやめ、一段小さく、ラベルを muted に。
    for (const row of rows.slice(1)) {
      expect(row.weight).toBeLessThan(600);
      expect(row.size).toBeLessThan(rows[0].size);
      expect(row.labelColor).not.toBe(rows[0].labelColor);
    }
  });
});

/*
 * 単位は**値の隣**に出す（運営者の指示）。数字だけが並ぶと、残業の `28.5` と
 * 有給の `74.9` が同じ尺度に見える。見出し側には単位では表せない情報
 * （残業の期間）だけを残す——同じ単位を2か所に出さない。
 */
test.describe("値の隣に単位を出す", () => {
  test("残業は h、有給は %、賃金の差異は % が値に付く（三菱商事）", async ({ page }) => {
    await page.goto("/company/8058");
    await expect(metric(page, "平均残業時間").locator("dd")).toContainText("10.5h");
    await expect(metric(page, "年次有給休暇の取得率").locator("dd")).toContainText("73.1%");
    await expect(metric(page, "男女の賃金の差異").locator("dd")).toContainText("64.7%");
  });

  test("見出しに単位を重ねない（残業は期間だけ・有給は空）", async ({ page }) => {
    await page.goto("/company/8058");
    const overtime = metric(page, "平均残業時間");
    await expect(overtime).toContainText("月あたり");
    // `時間` は値の `h` が持つので見出しからは落ちている。
    await expect(overtime.getByText("時間 / 月")).toHaveCount(0);
    // 有給の見出しは指標名だけ（`%` は値の隣）。
    const paidHeading = await metric(page, "年次有給休暇の取得率")
      .locator("dt")
      .locator("xpath=..")
      .innerText();
    expect(paidHeading.trim()).toBe("年次有給休暇の取得率");
  });

  test("単位は行ごとに繰り返しても行の高さを変えない（区分5件）", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/company/8058");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    // 器の右端が単位のぶんずれていないこと（値の列は固定幅のまま）。
    const boxes = await metric(page, "平均残業時間")
      .locator("dd span[aria-hidden]")
      .evaluateAll((tracks) =>
        tracks.map((t) => {
          const r = t.getBoundingClientRect();
          return [Math.round(r.left), Math.round(r.width)];
        })
      );
    expect(boxes.length).toBeGreaterThan(1);
    for (const box of boxes) expect(box).toEqual(boxes[0]);
  });
});
