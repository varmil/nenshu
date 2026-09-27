import type { Page } from "@playwright/test";
import { test, expect } from "./appTest";

/**
 * 給与の決定方針（C19・Issue #852・親 #850、`docs/company/spec.md` 1.23・AC-36、Claude Design
 * `C19 給与の決定方針.dc.html`）。C18 が有報から原文のまま切り出した本文（`pay-policies.json`）を
 * 企業詳細に出す。
 *
 * **本文の文言はテストに書き写さず、`/data/pay-policies.json` と突き合わせる。** 書き写すと、
 * 年1回のデータ更新のたびにテストだけが古い原文で落ちる。トヨタの1文だけは AC-35 の決め打ちの
 * 答えなので書く。
 *
 * **キーエンス（6861）は3月20日決算で改正前の様式**なので、この節が無い。既存の企業詳細の E2E
 * はキーエンスで書いてあるものが多く、節の無い会社の「原文」の行が出ないことは
 * `company-refresh.spec.ts` の AC-16（6区分の並び）が見ている。
 *
 * 他所にあるもの: 375px の横スクロールは `company-refresh.spec.ts` の AC-15 のループ、
 * `/` の HTML に入らないことは `company-page.spec.ts` の AC-10、`/about` の抜き出し方の節は
 * 同じく「/about に…」。
 */

type Block =
  | { kind: "para" | "heading"; text: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "image"; alt: string };
type PayPolicies = { byId: Record<string, { source: string; title: string | null; blocks: Block[] }> };

const section = (page: Page) => page.getByTestId("company-pay-policy");
const TOYOTA_POLICY =
  "法規制と競争力を踏まえ、必要な人材確保と従業員の安心感醸成のため、適切なレベルの賃金を支給しています。";

/** 画面の塊を、データと同じ形（種類と文字列）に読む。表はセルを行ごとに。 */
async function renderedBlocks(page: Page) {
  return section(page)
    .locator("[data-pay-block]")
    .evaluateAll((els) =>
      els.map((el) => {
        const kind = el.getAttribute("data-pay-block")!;
        if (kind === "table") {
          return {
            kind,
            rows: [...el.querySelectorAll("tr")].map((tr) =>
              [...tr.querySelectorAll("td, th")].map((cell) => cell.textContent ?? "")
            ),
          };
        }
        if (kind === "image") return { kind };
        return { kind, text: el.textContent ?? "" };
      })
    );
}

/** データの塊を、画面から読める形にそろえる（画像は代替テキストを出さない）。 */
function expectedBlocks(blocks: Block[]) {
  return blocks.map((b) => (b.kind === "image" ? { kind: "image" } : b));
}

test.describe("AC-36 給与の決定方針", () => {
  test("トヨタ: 要約と Q&A の間に節があり、原文そのものを会社の小見出しから出す", async ({ page, request }) => {
    const data = (await (await request.get("/data/pay-policies.json")).json()) as PayPolicies;
    const toyota = data.byId["7203"];

    await page.goto("/company/7203");

    await expect(
      section(page).getByRole("heading", { name: "トヨタ自動車株式会社の給与の決定方針", level: 2 })
    ).toBeVisible();

    // 置き場所: 有価証券報告書の要約の直後、年収に関するQ&A の直前（spec 1.23・デザイン 1a）。
    const headings = await page.locator("h2").allTextContents();
    const at = headings.indexOf("トヨタ自動車株式会社の給与の決定方針");
    expect(headings[at - 1]).toBe("トヨタ自動車株式会社の有価証券報告書の要約");
    expect(headings[at + 1]).toBe("トヨタ自動車株式会社の年収に関するQ&A");

    // 本文: 先頭に会社の小見出し（運営者の判断で残す）、続いて原文の塊がデータのとおりに並ぶ。
    await expect(section(page).locator("[data-pay-title]")).toHaveText(toyota.title!);
    expect(await renderedBlocks(page)).toEqual(expectedBlocks(toyota.blocks));
    await expect(section(page)).toContainText(TOYOTA_POLICY);

    // 節の説明と出どころの節。範囲の判定に生成AIを使ったことは出典の一覧と /about が言う。
    await expect(section(page)).toContainText("原文のまま");
    await expect(section(page).getByRole("link", { name: "抜き出し方" })).toHaveAttribute(
      "href",
      "/about#pay-policy"
    );
    await expect(section(page)).toContainText("人材戦略に関する基本方針等");
    const text = (await section(page).textContent()) ?? "";
    expect(text).not.toMatch(/\d{4}年\d{1,2}月期/);
    expect(text).not.toContain("推定");
    expect(text).not.toContain("生成AI");

    // 下辺の帯は Q&A の帯と同じ書類を指す（どちらも平均年間給与を取った有報）。
    const qaHref = await page.getByTestId("company-filing").getAttribute("href");
    await expect(page.getByTestId("company-pay-policy-filing")).toHaveAttribute("href", qaHref!);
    await expect(section(page).locator("blockquote")).toHaveAttribute("cite", qaHref!);
  });

  test("段落の区切りは原文のまま、表は表として出し、図は省いたと断る", async ({ page, request }) => {
    const data = (await (await request.get("/data/pay-policies.json")).json()) as PayPolicies;
    // 6501 日立: 見出しの無い段落から始まり、三原則の小見出しが続く。
    // 4956 コニシ: 6列の表を含む。8058 三菱商事: 図を含む。
    for (const id of ["6501", "4956", "8058"]) {
      await page.goto(`/company/${id}`);
      expect(await renderedBlocks(page), id).toEqual(expectedBlocks(data.byId[id].blocks));
    }
    await expect(section(page).locator('[data-pay-block="image"]').first()).toContainText("図は省略");
  });

  test("390px でも表の列が1字幅に潰れない（収まらなければ表の器の中で横に送る）", async ({ page }) => {
    // 4956 コニシ: 6列の表。潰れていたときは「※所定内賃金」が1字ずつ6行に折れていた。
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/company/4956");
    const cells = await section(page)
      .locator('[data-pay-block="table"] td')
      .evaluateAll((tds) =>
        tds.map((td) => {
          const style = getComputedStyle(td);
          const content = td.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          return { text: td.textContent ?? "", chars: content / parseFloat(style.fontSize) };
        })
      );
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) expect(cell.chars, cell.text).toBeGreaterThanOrEqual(3);
  });

  test("サステナビリティの節から取った会社は、出どころの節の名前が変わる", async ({ page }) => {
    await page.goto("/company/9433");
    await expect(section(page)).toContainText("サステナビリティに関する考え方及び取組");
    await expect(section(page)).not.toContainText("人材戦略に関する基本方針等");
  });

  test("改正前の様式の会社と、給与の決定方針が空の会社には節ごと無い", async ({ page }) => {
    for (const id of ["4452", "9501"]) {
      await page.goto(`/company/${id}`);
      await expect(page.getByRole("heading", { level: 1 }), id).toBeVisible();
      await expect(section(page), id).toHaveCount(0);
      await expect(page.getByRole("heading", { name: /の給与の決定方針$/ }), id).toHaveCount(0);
      await expect(page.getByTestId("company-pay-policy-filing"), id).toHaveCount(0);
    }
  });

  test("表示基準と年齢を切り替えても節は変わらない", async ({ page }) => {
    await page.goto("/company/7203");
    const before = await section(page).textContent();
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("button", { name: "25歳" }).click();
    await expect(page.getByRole("button", { name: "25歳" })).toHaveAttribute("aria-pressed", "true");
    expect(await section(page).textContent()).toBe(before);
  });

  test("出典の一覧の先頭に区分「原文」があり、範囲の判定に生成AIを使ったことが読める", async ({ page }) => {
    await page.goto("/company/7203");
    const sources = page.getByTestId("company-sources");
    await expect(sources.locator("dt").first()).toHaveText("原文");
    const row = sources.locator("dl > div").first();
    await expect(row).toContainText("給与の決定方針");
    await expect(row).toContainText("生成AI");
  });
});

/*
 * 長い会社（1,000字超の80社）は先頭を開いたまま出し、残りを `details` に入れる。
 * **全文は JS 実行前の HTML にある**（spec 2. の SEO）——JS を止めて開いた DOM で見る。
 */
test.describe("AC-36 長い会社", () => {
  test("先頭が開いていて、残りは「続きを読む」で開ける", async ({ page }) => {
    await page.goto("/company/3032");
    const more = section(page).locator("details");
    await expect(more).toHaveCount(1);
    await expect(more).not.toHaveAttribute("open", "");
    const summary = more.locator("summary");
    await expect(summary).toHaveText(/^続きを読む（残り[\d,]+字）$/);

    // 開く前: 先頭の塊は見え、畳んだ塊は見えない。
    await expect(section(page).locator("[data-pay-block]").first()).toBeVisible();
    await expect(more.locator("[data-pay-block]").first()).toBeHidden();

    await summary.click();
    await expect(more.locator("[data-pay-block]").first()).toBeVisible();
  });

  test.describe("JS を止めて開く", () => {
    test.use({ javaScriptEnabled: false });

    test("全文が HTML にあり、段落の数もデータと同じ", async ({ page, request }) => {
      const data = (await (await request.get("/data/pay-policies.json")).json()) as PayPolicies;
      await page.goto("/company/3032", { waitUntil: "domcontentloaded" });
      expect(await renderedBlocks(page)).toEqual(expectedBlocks(data.byId["3032"].blocks));
    });
  });
});
