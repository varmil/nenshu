import type { Page } from "@playwright/test";
import { test, expect } from "./appTest";
import { analyses, companies, payPolicies, pickCompany, rowOf } from "../testing/realData";
import {
  buildPayPolicyView,
  PAY_POLICY_SOURCE_LABEL,
  type PayPolicyBlock,
} from "../features/company/lib/payPolicy";
import { companyPayPolicyFor } from "../features/company/lib/pageData";
import { periodLabel } from "../lib/data/period";
import type { CompanyRow } from "../features/ranking/types";

/**
 * 給与の決定方針（C19・Issue #852・親 #850、`docs/company/spec.md` 1.23・AC-36、Claude Design
 * `C19 給与の決定方針.dc.html`）。C18 が有報から原文のまま切り出した本文（`pay-policies.json`）を
 * 企業詳細に出す。
 *
 * **本文の文言はテストに書き写さず、`pay-policies.json` と突き合わせる。** 書き写すと、
 * データの更新のたびにテストだけが古い原文で落ちる。C18 が切り出した答えそのもの（AC-35 の
 * トヨタの1文）は `pipeline/scripts/build-data.test.ts` が見ている。
 *
 * **会社は名指ししない**（refresh の D0・Issue #870）。「節が無い」「表に結合したセルがある」
 * 「1,000字を超える」はその会社の次の有報で変わるので、状態でデータから選ぶ。**改正前の様式の
 * 会社にはこの節が無い**（2026-09 時点でキーエンスもそう）。既存の企業詳細の E2E はキーエンスで
 * 書いてあるものが多く、節の無い会社の「原文」の行が出ないことは `company-refresh.spec.ts` の
 * AC-16（6区分の並び）が見ている。
 *
 * 他所にあるもの: 375px の横スクロールは `company-refresh.spec.ts` の AC-15 のループ、
 * `/` の HTML に入らないことは `company-page.spec.ts` の AC-10、`/about` の抜き出し方の節は
 * 同じく「/about に…」。
 */

type TableBlock = Extract<PayPolicyBlock, { kind: "table" }>;

const section = (page: Page) => page.getByTestId("company-pay-policy");

/** 画面の塊を、データと同じ形（種類と文字列）に読む。表はセルを行ごとに、結合は `spans` に。 */
async function renderedBlocks(page: Page) {
  return section(page)
    .locator("[data-pay-block]")
    .evaluateAll((els) =>
      els.map((el) => {
        const kind = el.getAttribute("data-pay-block")!;
        if (kind === "table") {
          const trs = [...el.querySelectorAll("tr")];
          const spans = trs.flatMap((tr, r) =>
            [...tr.querySelectorAll<HTMLTableCellElement>("td, th")].flatMap((cell, c) =>
              cell.colSpan > 1 || cell.rowSpan > 1 ? [[r, c, cell.colSpan, cell.rowSpan]] : []
            )
          );
          return {
            kind,
            rows: trs.map((tr) =>
              [...tr.querySelectorAll("td, th")].map((cell) => cell.textContent ?? "")
            ),
            ...(spans.length > 0 ? { spans } : {}),
          };
        }
        if (kind === "image") return { kind };
        return { kind, text: el.textContent ?? "" };
      })
    );
}

/** データの塊を、画面から読める形にそろえる（画像は代替テキストを出さない）。 */
function expectedBlocks(id: string) {
  return payPolicies.byId[id].blocks.map((b) => (b.kind === "image" ? { kind: "image" } : b));
}

/** その会社の節の見せ方（開いたまま出す塊と畳む塊）。本文の無い会社は `null`。 */
const viewOf = (row: CompanyRow) => buildPayPolicyView(row[1], payPolicies.byId[row[0]]);

const tablesOf = (blocks: PayPolicyBlock[]) =>
  blocks.filter((b): b is TableBlock => b.kind === "table");

/** 列と行の両方をまたぐ結合セルを持つ表。 */
const spansBoth = (table: TableBlock) =>
  (table.spans ?? []).some(([, , colspan]) => colspan > 1) &&
  (table.spans ?? []).some(([, , , rowspan]) => rowspan > 1);

/**
 * 人材戦略の節から取り、会社の小見出しを持ち、要約の節もある会社（spec の AC-36 がトヨタで
 * 書いている形）。**原文に決算期・「推定」・「生成AI」を含む会社は外す**——節がそれらの語を
 * 置いていないことを確かめられない。
 */
const STANDARD = pickCompany("人材戦略の節から取った給与の決定方針に小見出しがある会社", (row) => {
  const record = payPolicies.byId[row[0]];
  return (
    record?.source === "section" &&
    record.title !== null &&
    analyses.byId[row[0]] !== undefined &&
    !/\d{4}年\d{1,2}月期|推定|生成AI/.test(JSON.stringify(record))
  );
});

/** 列と行の両方をまたぐ結合セルを持つ表が、開いたまま出る部分にある会社。 */
const SPANNED = pickCompany("結合したセルのある表が開いたまま出る会社", (row) => {
  const view = viewOf(row);
  return view !== null && tablesOf(view.open).some(spansBoth);
});

/**
 * 6列以上の表があり、表が1つも畳まれない会社（390px で潰れやすい）。畳まれた表のセルは
 * 幅を持たないので、1つでも畳まれていると測れない。
 */
const WIDE_TABLE = pickCompany("6列以上の表があり、表が畳まれない会社", (row) => {
  const view = viewOf(row);
  return (
    view !== null &&
    tablesOf(view.folded).length === 0 &&
    tablesOf(view.open).some((t) => Math.max(...t.rows.map((r) => r.length)) >= 6)
  );
});

/** 1,000字を超えて、残りを「続きを読む」に畳む会社。 */
const FOLDED = pickCompany("給与の決定方針の残りを畳む会社", (row) => {
  const view = viewOf(row);
  return view !== null && view.folded.length > 0;
});

test.describe("AC-36 給与の決定方針", () => {
  test("要約と Q&A の間に節があり、原文そのものを会社の小見出しから出す", async ({ page }) => {
    const [, name] = rowOf(STANDARD);
    const view = companyPayPolicyFor(STANDARD, name)!;

    await page.goto(`/company/${STANDARD}`);

    await expect(
      section(page).getByRole("heading", { name: view.heading, level: 2 })
    ).toBeVisible();

    // 置き場所: 有価証券報告書の要約の直後、年収に関するQ&A の直前（spec 1.23・デザイン 1a）。
    const owners = await page
      .locator("h2")
      .evaluateAll((els) =>
        els.map((el) => el.closest("[data-testid]")?.getAttribute("data-testid") ?? null)
      );
    const at = owners.indexOf("company-pay-policy");
    expect(owners[at - 1]).toBe("company-digest");
    expect(owners[at + 1]).toBe("company-qa");

    // 本文: 先頭に会社の小見出し（運営者の判断で残す）、続いて原文の塊がデータのとおりに並ぶ。
    await expect(section(page).locator("[data-pay-title]")).toHaveText(view.title!);
    expect(await renderedBlocks(page)).toEqual(expectedBlocks(STANDARD));

    // 節の説明と出どころの節。範囲の判定に生成AIを使ったことは出典の一覧と /about が言う。
    await expect(section(page)).toContainText("原文のまま");
    await expect(section(page).getByRole("link", { name: "抜き出し方" })).toHaveAttribute(
      "href",
      "/about#pay-policy"
    );
    await expect(section(page)).toContainText(PAY_POLICY_SOURCE_LABEL.section);
    const text = (await section(page).textContent()) ?? "";
    // 決算期は節の説明の先頭に1回だけ、原文を切り出した有報の期で書く（Q&A・要約の説明と同じ置き方。
    // site-chrome spec 5.1）。出どころの節の名前や本文には重ねない。
    const period = periodLabel(payPolicies.byId[STANDARD].filing.period);
    await expect(section(page).locator("[data-pay-note]")).toContainText(
      `${period}の有価証券報告書に会社が書いた方針です`
    );
    expect(text.match(/\d{4}年\d{1,2}月期/g)).toEqual([period]);
    expect(text).not.toContain("推定");
    expect(text).not.toContain("生成AI");

    // 下辺の帯は Q&A の帯と同じ書類を指す（どちらも平均年間給与を取った有報）。
    const qaHref = await page.getByTestId("company-filing").getAttribute("href");
    await expect(page.getByTestId("company-pay-policy-filing")).toHaveAttribute("href", qaHref!);
    await expect(section(page).locator("blockquote")).toHaveAttribute("cite", qaHref!);
  });

  test("段落の区切りは原文のまま、表は表として出し、図は省いたと断る", async ({ page }) => {
    // 見出しの無い段落から始まり小見出しが続く会社・6列の表・結合したセル・図を含む会社
    // （最後に開く。下の「図は省略」はこのページで見る）。
    const paraFirst = pickCompany("見出しの無い段落から始まり、小見出しが続く会社", (row) => {
      const blocks = payPolicies.byId[row[0]]?.blocks;
      return blocks?.[0].kind === "para" && blocks.some((b) => b.kind === "heading");
    });
    const withImage = pickCompany("給与の決定方針に図を含む会社", (row) =>
      (payPolicies.byId[row[0]]?.blocks ?? []).some((b) => b.kind === "image")
    );
    for (const id of [paraFirst, WIDE_TABLE, SPANNED, withImage]) {
      await page.goto(`/company/${id}`);
      expect(await renderedBlocks(page), id).toEqual(expectedBlocks(id));
    }
    await expect(section(page).locator('[data-pay-block="image"]').first()).toContainText(
      "図は省略"
    );
  });

  test("結合したセルのある表で、どの行も表の右端まで届く（列がずれない）", async ({ page }) => {
    // 結合を落としていたときは、結合した行の隣の行だけセルが足りずに右へはみ出し、他の行の
    // 右に空の列ができていた（2026-09 時点でソニーグループの報酬の表）。
    const index = tablesOf(payPolicies.byId[SPANNED].blocks).findIndex(spansBoth);
    await page.goto(`/company/${SPANNED}`);
    const table = section(page).locator('[data-pay-block="table"]').nth(index);
    const gaps = await table.evaluate((el) => {
      const right = el.getBoundingClientRect().right;
      return [...el.querySelectorAll("tr")].map((tr) => {
        const cells = tr.querySelectorAll("td, th");
        return Math.round(right - cells[cells.length - 1].getBoundingClientRect().right);
      });
    });
    expect(gaps.length).toBeGreaterThan(1);
    for (const gap of gaps) expect(Math.abs(gap)).toBeLessThanOrEqual(1);
  });

  test("390px でも表の列が1字幅に潰れない（収まらなければ表の器の中で横に送る）", async ({
    page,
  }) => {
    // 潰れていたときは、6列の表の「※所定内賃金」が1字ずつ6行に折れていた（2026-09 時点で
    // コニシの表）。
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/company/${WIDE_TABLE}`);
    const cells = await section(page)
      .locator('[data-pay-block="table"] td')
      .evaluateAll((tds) =>
        tds.map((td) => {
          const style = getComputedStyle(td);
          const content =
            td.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          return { text: td.textContent ?? "", chars: content / parseFloat(style.fontSize) };
        })
      );
    // 字の無いセルは見ない（字下げの列に使われていて、細いのが原文どおり）
    const withText = cells.filter((cell) => cell.text.trim() !== "");
    expect(withText.length).toBeGreaterThan(0);
    for (const cell of withText) expect(cell.chars, cell.text).toBeGreaterThanOrEqual(3);
  });

  test("サステナビリティの節から取った会社は、出どころの節の名前が変わる", async ({ page }) => {
    // 原文に人材戦略の節の名前が出てくる会社では、名前が変わったことを確かめられない。
    const id = pickCompany("サステナビリティの節から取った会社", (row) => {
      const record = payPolicies.byId[row[0]];
      return (
        record?.source === "sustainability" &&
        !JSON.stringify(record).includes(PAY_POLICY_SOURCE_LABEL.section)
      );
    });
    await page.goto(`/company/${id}`);
    await expect(section(page)).toContainText(PAY_POLICY_SOURCE_LABEL.sustainability);
    await expect(section(page)).not.toContainText(PAY_POLICY_SOURCE_LABEL.section);
  });

  test("改正前の様式の会社と、給与の決定方針が無い会社には節ごと無い", async ({ page }) => {
    // 開示府令の改正（給与の決定方針の開示）は決算期末が2026年3月31日以後の有報から。
    const periodOf = (row: CompanyRow) => companies.periods[row[9]];
    const noPolicy = (row: CompanyRow) => payPolicies.byId[row[0]] === undefined;
    const ids = [
      pickCompany("決算期が2026年3月より前の会社", (row) => periodOf(row) < "2026-03"),
      pickCompany(
        "決算期が2026年3月以後なのに給与の決定方針の無い会社",
        (row) => periodOf(row) >= "2026-03" && noPolicy(row)
      ),
    ];
    for (const id of ids) {
      await page.goto(`/company/${id}`);
      await expect(page.getByRole("heading", { level: 1 }), id).toBeVisible();
      await expect(section(page), id).toHaveCount(0);
      await expect(page.getByRole("heading", { name: /の給与の決定方針$/ }), id).toHaveCount(0);
      await expect(page.getByTestId("company-pay-policy-filing"), id).toHaveCount(0);
    }
  });

  test("表示基準と年齢を切り替えても節は変わらない", async ({ page }) => {
    await page.goto(`/company/${STANDARD}`);
    const before = await section(page).textContent();
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("button", { name: "25歳" }).click();
    await expect(page.getByRole("button", { name: "25歳" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(await section(page).textContent()).toBe(before);
  });

  test("出典の一覧の先頭に区分「原文」があり、範囲の判定に生成AIを使ったことが読める", async ({
    page,
  }) => {
    await page.goto(`/company/${STANDARD}`);
    const sources = page.getByTestId("company-sources");
    await expect(sources.locator("dt").first()).toHaveText("原文");
    const row = sources.locator("dl > div").first();
    await expect(row).toContainText("給与の決定方針");
    await expect(row).toContainText("生成AI");
  });
});

/*
 * 長い会社（1,000字超）は先頭を開いたまま出し、残りを `details` に入れる。
 * **全文は JS 実行前の HTML にある**（spec 2. の SEO）——JS を止めて開いた DOM で見る。
 */
test.describe("AC-36 長い会社", () => {
  test("先頭が開いていて、残りは「続きを読む」で開ける", async ({ page }) => {
    await page.goto(`/company/${FOLDED}`);
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

    test("全文が HTML にあり、段落の数もデータと同じ", async ({ page }) => {
      await page.goto(`/company/${FOLDED}`, { waitUntil: "domcontentloaded" });
      expect(await renderedBlocks(page)).toEqual(expectedBlocks(FOLDED));
    });
  });
});
