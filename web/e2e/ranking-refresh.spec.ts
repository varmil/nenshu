import { test, expect } from "./appTest";
import type { Locator, Page } from "@playwright/test";
import { rankingPageData } from "../features/ranking/lib/pageData";
import { displaySalary } from "../features/ranking/lib/rank";
import { populationForBasis } from "../features/ranking/lib/population";
import { pageRange } from "../features/ranking/lib/pagination";
import { formatDecimal1, formatInt, formatManYen } from "../features/ranking/lib/format";
import { deviationScore, formatDeviation } from "../features/company/lib/stats";
import { PAGE_SIZE, type TargetAge } from "../features/ranking/types";
import { companies } from "../testing/realData";

/**
 * U12（Issue #80）で足したもの——並び替え・年収バー・偏差値・サイドバー・
 * モバイルの絞り込みシート・業種チップ・ヘッダの検索——と、U13（Issue #88）以降で
 * モックに合わせ直した形の E2E。
 *
 * 既存の絞り込み・検索は `ranking-filters.spec.ts`、表示基準は
 * `ranking-basis.spec.ts` にある。**操作でネットワークが起きないこと**は
 * `ranking-url-sync.spec.ts` の1本の流れにまとめてある（並び替え・業種チップ・
 * ヘッダの検索・サイト名もそこで数えている）。
 *
 * **ここで見るのはブラウザでしか分からないこと**——押したときに画面と URL が揃って
 * 変わること、描かれた形が崩れていないこと（切り詰め・折り返し・重なり・列のずれ・
 * 横スクロール）。状態遷移の組み合わせ（`lib/sort.test.ts`・`lib/urlState.test.ts`）と
 * 並びの正しさ（`lib/rank.test.ts`）は単体テストが持っている。
 *
 * **どの会社がどこに来るか・金額・偏差値・社数は、そのURLのデータから取る**
 * （`rankingPageData`＝`/` が画面を組むのと同じ関数）。いまのデータの値を書き写すと、
 * 毎日の更新で1社動いただけで落ちる（refresh の D0・Issue #870）。
 */

const rows = (page: Page) => page.getByRole("table").locator("tbody tr");

/** そのURLで `/` が描く1ページぶん。 */
const pageDataOf = (query: string) => rankingPageData(new URLSearchParams(query));

/** そのURLの1行目の会社。 */
const firstOf = (query: string) => pageDataOf(query).bootstrap.page.companies[0];

/** 件数表示（`RankingApp` の「◯社 中 ◯〜◯社目」、0件なら「0社」）。数はそのURLのデータから取る。 */
function countLabel(query: string): string {
  const { bootstrap, initialState } = pageDataOf(query);
  const total = bootstrap.page.totalCount;
  if (total === 0) return "0社";
  const { from, to } = pageRange(initialState.page, total, PAGE_SIZE);
  return `${formatInt(total)}社 中 ${formatInt(from)}〜${formatInt(to)}社目`;
}

/**
 * その順位が出るページ。1ページ30社なので順位から逆算し、そのページのデータに
 * 実際に居ることを確かめる（居なければ落とす——社数が足りず、その桁の順位が無い）。
 */
function rankSample(rank: number): { url: string; rank: string } {
  const pageNumber = Math.ceil(rank / PAGE_SIZE);
  const query = pageNumber === 1 ? "" : `page=${pageNumber}`;
  if (!pageDataOf(query).bootstrap.page.companies.some((c) => c.rank === rank)) {
    throw new Error(`${rank}位の会社が居ない（${companies.rows.length}社）`);
  }
  return { url: query ? `/?${query}` : "/", rank: String(rank) };
}

/** 順位バッジの数字と一致するもの。読み上げ用の「位」が textContent に付く。 */
const rankText = (rank: string) => new RegExp(`^${rank}位$`);

/**
 * 表は3列（順位・会社名 / 金額 / 偏差値）。平均年齢・在籍年数・従業員数は社名の下の
 * meta 行にあり、順位はロゴ左上のバッジなので**順位の列は無い**。数値は1列目から読む。
 */
const metaValues = async (page: Page, pattern: RegExp) => {
  const cells = await rows(page).locator("td").first().allTextContents();
  return cells.map((text) => Number(text.match(pattern)![1].replace(/,/g, "")));
};
const AVG_AGE = /平均([\d.]+)歳/;
const EMPLOYEES = /・\s*([\d,]+)人/;

const expectSorted = (values: number[], order: "asc" | "desc", label: string) =>
  expect(values, label).toEqual([...values].sort((a, b) => (order === "asc" ? a - b : b - a)));

/** 順位バッジの数字。読み上げ用の「位」が textContent に混ざるので落とす。 */
const rankValues = async (page: Page) => {
  const texts = await rows(page).locator("[data-rank-badge]").allTextContents();
  return texts.map((text) => Number(text.replace("位", "")));
};

/** ページ全体の横スクロール量。0 以下なら出ていない。 */
const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/**
 * 要素の文字を、描かれた行ごとの文字列にする。1字ずつの矩形の左端が前の字より左へ
 * 戻ったところを改行と見なす——上端で分けると、和文と数字でフォントが替わる行は
 * 同じ行でも上端がずれる。`hidden md:inline` で消えている字は数えない。
 *
 * **ブロック要素の `getClientRects()` は行数ではない**（折り返しても1つしか返らない）。
 */
const renderedLines = (locator: Locator) =>
  locator.evaluate((el) => {
    const lines: string[] = [];
    let prevLeft = Infinity;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      for (let i = 0; i < text.length; i++) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        if (range.getClientRects().length === 0) continue;
        const { left } = range.getBoundingClientRect();
        if (left < prevLeft) lines.push("");
        lines[lines.length - 1] += text[i];
        prevLeft = left;
      }
    }
    return lines;
  });

test.describe("AC-12 並び替え", () => {
  /*
   * **押すとチップの表記・URL・行の並びが揃って変わる**ことを1本の流れで見る。
   * どの軸へ移ると何順になるか・既定なら URL から消えるか、といった規則そのものは
   * `lib/sort.test.ts`（`nextSortSelection`）と `lib/urlState.test.ts` が持つ。
   *
   * ここにしか無いのは次の2つ。
   * - **同じチップをもう一度押すと反転する**経路。単一選択の ToggleGroup が寄こす
   *   **空配列**を合図にしている（`SortSwitch`）。項目ごとの `onClick` で拾うと
   *   同じクリックで状態が2回動く——単体テストでは捕まらない。
   * - **並び替えで1ページ目に戻る**こと。`page` を1に戻すのは `RankingApp` の
   *   `applyFilter` 1か所で、絞り込み・表示基準も同じ経路を通る。
   */
  test("押すとチップの表記・URL・行の並びが揃って変わる", async ({ page }) => {
    // 逆向きの軸を URL から直接開く（AC-12 の最後のシナリオ）。2ページ目から始める。
    await page.goto("/?sort=emp-asc&page=2");
    const group = page.getByRole("group", { name: "並び替え" });
    await expect(group.getByRole("button", { name: "従業員数 少ない順" })).toBeVisible();
    expectSorted(await metaValues(page, EMPLOYEES), "asc", "sort=emp-asc を直接開いた");

    // 別の軸へ移ると、前の軸の向きを引き継がずにその軸の既定（高い順）から始まり、
    // 1ページ目に戻る。
    await group.getByRole("button", { name: "平均年齢 高い順" }).click();
    await expect(page).toHaveURL(/\/\?sort=age$/);
    expectSorted(await metaValues(page, AVG_AGE), "desc", "平均年齢 高い順");
    // 順位バッジは金額基準のまま。1,2,3… に振り直されない。
    const ranks = await rankValues(page);
    expect(ranks).not.toEqual(ranks.map((_, i) => i + 1));

    // 同じチップをもう一度押すと向きが反転する。モバイルでは向きの語を出さないので、
    // 矢印の向き（上＝小さい順）が唯一の手がかりになる。
    await group.getByRole("button", { name: "平均年齢 高い順" }).click();
    await expect(page).toHaveURL(/\/\?sort=age-asc$/);
    const ageAsc = group.getByRole("button", { name: "平均年齢 若い順" });
    await expect(ageAsc).toBeVisible();
    await expect(ageAsc.locator("svg")).toHaveClass(/lucide-chevron-up/);
    expectSorted(await metaValues(page, AVG_AGE), "asc", "平均年齢 若い順");

    // 既定（平均年収 高い順）に戻すと URL から sort が消え、3軸とも既定の向き
    // （大きい順）の読み上げ名に戻る。
    await group.getByRole("button", { name: "平均年収 高い順" }).click();
    await expect(page).toHaveURL(/\/$/);
    for (const name of ["平均年収 高い順", "平均年齢 高い順", "従業員数 多い順"]) {
      await expect(group.getByRole("button", { name })).toBeVisible();
    }

    // 既定の並びで「平均年収」を押すと低い順になる。先頭は金額がいちばん低い会社で、
    // 順位は振り直さずその会社の順位のまま（読み上げ用の「位」が付く）。
    await group.getByRole("button", { name: "平均年収 高い順" }).click();
    await expect(page).toHaveURL(/\/\?sort=salary-asc$/);
    await expect(rows(page).first().locator("[data-rank-badge]")).toHaveText(
      `${firstOf("sort=salary-asc").rank}位`
    );
  });
});

test.describe("AC-13 年収バー", () => {
  const barWidth = async (page: Page, index: number) =>
    Number(
      (
        await rows(page).nth(index).locator('[style*="width"]').first().getAttribute("style")
      )?.match(/width:\s*([\d.]+)%/)?.[1] ?? "0"
    );

  /*
   * 基準の取り方そのもの（`pageMaxSalary`）は `lib/rank.test.ts` が持つ。ここで見るのは
   * **描かれた棒がその基準で引かれているか**。とくに表示基準の切替で棒だけ元の縮尺で
   * 残るのが一番気づきにくい壊れ方なので、単体・E2E の両方で固定している（CLAUDE.md）。
   */
  test("そのページの1位を100%とし、表示基準やページが変わると取り直す", async ({ page }) => {
    // 1位より金額の低い最初の行。1位と同額の行は同じ100%になるので飛ばす。
    const top = pageDataOf("").bootstrap.page.companies;
    const lower = top.findIndex((c) => displaySalary(c) < displaySalary(top[0]));
    expect(lower, "1ページ目に1位より金額の低い会社が居る").toBeGreaterThan(0);

    await page.goto("/");
    await expect(page.getByRole("table").locator("caption")).toContainText("このページの1位を100%");
    expect(await barWidth(page, 0)).toBe(100);
    const second = await barWidth(page, lower);
    expect(second).toBeLessThan(100);
    expect(second).toBeGreaterThan(0);
    const before = await barWidth(page, 5);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);
    expect(await barWidth(page, 0)).toBe(100);
    expect(await barWidth(page, 5)).not.toBe(before);

    // 2ページ目の先頭がまた100%になる（全体の最大で割っていれば100%に届かない）。
    await page.getByRole("button", { name: "次のページへ" }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(rows(page).first()).toContainText(firstOf("age=35&page=2").name);
    expect(await barWidth(page, 0)).toBe(100);
  });

  /*
   * **全体平均の縦線が目に見えること。** 以前は棒の器の中に `--foreground` の40%で
   * 引いていて、平均を上回る行では塗りに重なり、ライトではほとんど見えなかった
   * （運営者の指摘）。高さも棒と同じ（モバイルは3px）しかなかった。
   *
   * 寸法や色の値は写さず、見えるための条件を2つ見る——**棒の上下にはみ出している**
   * ことと、**はみ出したぶんが載る行の地に対して3:1以上**（WCAG 1.4.11 の非テキストの
   * 基準）であること。2つそろえば塗りの色によらず見える。2ページ目を使うのは、
   * 全行が平均を上回り、縦線が必ず塗りの上に来るため——その前提はデータで確かめる。
   */
  test("全体平均の縦線は棒の上下にはみ出し、行の地に対して3:1以上ある（PC・モバイル × ライト・ダーク）", async ({
    page,
  }) => {
    const { bootstrap, population } = pageDataOf("page=2");
    expect(
      Math.min(...bootstrap.page.companies.map(displaySalary)),
      "2ページ目の全行が全体平均を上回る"
    ).toBeGreaterThan(populationForBasis(population, null)!.mean);

    for (const colorScheme of ["light", "dark"] as const) {
      for (const viewport of [
        { width: 1280, height: 900 },
        { width: 390, height: 844 },
      ]) {
        const label = `${colorScheme} ${viewport.width}px`;
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize(viewport);
        await page.goto("/?page=2");

        const ticks = await page.evaluate(() => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          // 算出色は色空間がまちまち（lab() 等）なので canvas に塗って sRGB で読む。
          // 地を塗ってから重ねるので、半透明の色でも見えている色で比べられる。
          const paint = (...layers: string[]) => {
            ctx.clearRect(0, 0, 1, 1);
            for (const color of layers) {
              ctx.fillStyle = color;
              ctx.fillRect(0, 0, 1, 1);
            }
            return Array.from(ctx.getImageData(0, 0, 1, 1).data);
          };
          const composite = (fg: string, bg: string) => paint(bg, fg).slice(0, 3);
          const isOpaque = (color: string) => paint(color)[3] === 255;
          const luminance = ([r, g, b]: number[]) => {
            const c = (v: number) => {
              const x = v / 255;
              return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
          };
          // 行の地＝縦線の祖先で最初に不透明な背景を持つ要素の色。
          const groundOf = (el: Element) => {
            for (let e: Element | null = el.parentElement; e; e = e.parentElement) {
              const bg = getComputedStyle(e).backgroundColor;
              if (isOpaque(bg)) return bg;
            }
            return getComputedStyle(document.body).backgroundColor;
          };

          return Array.from(document.querySelectorAll("[data-mean-line]"))
            .filter((el) => el.getClientRects().length > 0)
            .slice(0, 5)
            .map((tick) => {
              const bar = tick.parentElement!.getBoundingClientRect();
              const box = tick.getBoundingClientRect();
              const ground = groundOf(tick.parentElement!);
              const a = luminance(composite(getComputedStyle(tick).backgroundColor, ground));
              const b = luminance(paint(ground).slice(0, 3));
              const [hi, lo] = a > b ? [a, b] : [b, a];
              return {
                above: bar.top - box.top,
                below: box.bottom - bar.bottom,
                inside: box.left >= bar.left - 2 && box.right <= bar.right + 2,
                ratio: (hi + 0.05) / (lo + 0.05),
              };
            });
        });

        expect(ticks.length, label).toBeGreaterThan(0);
        for (const tick of ticks) {
          expect(tick.above, `${label} 上へのはみ出し`).toBeGreaterThan(0);
          expect(tick.below, `${label} 下へのはみ出し`).toBeGreaterThan(0);
          expect(tick.inside, `${label} 棒の幅の中`).toBe(true);
          expect(tick.ratio, `${label} 行の地とのコントラスト`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});

test.describe("AC-14 偏差値", () => {
  /*
   * **偏差値は基準ごとの母集団で出す。** 1位も基準ごとに違いうる（2026-09 時点では
   * 実測値と35歳そろえで別の会社）。期待値は、そのURLの1行目の金額と、全社の分布
   * （`stats.json` の `population`＝`pickPopulationStats` が `/` に渡すもの）から出す。
   *
   * **母集団は絞り込み後ではなく全社。** 小さな業種に絞ったときの1位が「50.0」付近に
   * なったら、絞り込んだ集団で計算してしまっている。
   *
   * **上位◯%は併記しない**（運営者の指示。モックに無いものを足さない）。セルの文字が
   * 数字だけであることを `toHaveText` の完全一致で見る。
   */
  const topDeviation = (query: string, targetAge: TargetAge | null) => {
    const { bootstrap, population } = pageDataOf(query);
    const top = bootstrap.page.companies[0];
    const { mean, sd } = populationForBasis(population, targetAge)!;
    return {
      name: top.name,
      deviation: formatDeviation(deviationScore(displaySalary(top), mean, sd)),
    };
  };

  test("表示基準ごとの全社の分布で出し、列には数字だけを出す", async ({ page }) => {
    await page.goto("/");
    // 偏差値は3列目（index 2）。順位の列を廃した（アートボード 4d）ぶん1つ左。
    const raw = topDeviation("", null);
    await expect(rows(page).first()).toContainText(raw.name);
    await expect(rows(page).first().locator("td").nth(2)).toHaveText(raw.deviation);
    await expect(page.getByText(/上位[\d.]+%/)).toHaveCount(0);
    await expect(page.getByRole("table").locator("caption")).toContainText("100を超える");

    await page.goto("/?age=35");
    const age35 = topDeviation("age=35", 35);
    await expect(rows(page).first()).toContainText(age35.name);
    await expect(rows(page).first().locator("td").nth(2)).toHaveText(age35.deviation);

    await page.goto("/?ind=海運業");
    const shipping = topDeviation("ind=海運業", null);
    await expect(rows(page).first().locator("[data-rank-badge]")).toHaveText("1位");
    await expect(rows(page).first()).toContainText(shipping.name);
    await expect(rows(page).first().locator("td").nth(2)).toHaveText(shipping.deviation);
  });
});

test.describe("サイドバーと適用中のチップ", () => {
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

  // 外れ方の規則（patch・`CLEAR_ALL_FILTERS`）は `lib/activeFilters.test.ts` が持つ。
  test("適用中のチップは1つずつ外せ、「すべて解除」でも表示基準は残る", async ({ page }) => {
    await page.goto("/?age=35&ind=海運業&emp=1000-&q=商船");
    await expect(page.getByText("適用中")).toBeVisible();

    await page.getByRole("button", { name: /業種の絞り込み「海運業」を解除/ }).click();
    await expect(page).not.toHaveURL(/ind=/);
    await expect(page).toHaveURL(/emp=1000-/);

    await page.getByRole("button", { name: "すべて解除" }).click();
    await expect(page).toHaveURL(/\/\?age=35$/);
  });
});

test.describe("業種チップ", () => {
  /*
   * 業種ごとの `<a href="/?ind=…">` はクローラの経路（ADR-0006）。左クリックを横取りして
   * 遷移させないことは `ranking-url-sync.spec.ts` のネットワークの流れで見ている。
   * 業種の数と社数はデータから取る（`bootstrap.industries`・`industryCounts`）。
   */
  test("全業種が社数つきで本文カラムの中に並び、href はクロールできる形をしている", async ({
    page,
  }) => {
    const { industries, industryCounts } = pageDataOf("").bootstrap;

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "業種から見る" });
    const chips = nav.getByRole("link");
    await expect(chips).toHaveCount(industries.length);
    await expect(chips.first()).toHaveAttribute("href", /^\/\?ind=/);
    await expect(
      nav.getByRole("link", {
        name: `${industries[0]} ${formatInt(industryCounts[0])}社`,
        exact: true,
      })
    ).toBeVisible();

    // 表と左端が揃っている＝サイドバーの下ではなく本文カラムの中にいる。
    const navBox = (await nav.boundingBox())!;
    const tableBox = (await page.getByRole("table").boundingBox())!;
    expect(Math.abs(navBox.x - tableBox.x)).toBeLessThanOrEqual(1);
  });
});

test.describe("ヘッダの検索", () => {
  // `/` 以外では素の `<form action="/">`。遷移先は新しい文書なので、`?q=` を直接
  // 開いたときと同じく検索欄に語が入っている。
  test("/about から検索すると /?q= に遷移し、検索欄に語が残る", async ({ page }) => {
    await page.goto("/about");
    const search = page.getByRole("banner").getByRole("searchbox", { name: "会社名で検索" });
    await search.fill("商船三井");
    await search.press("Enter");

    await expect(page).toHaveURL(/\/\?q=/);
    // 遷移先で絞り込まれている。件数表示を同じ語で絞ったデータと突き合わせる。
    await expect(page.getByText(countLabel("q=商船三井"), { exact: true })).toBeVisible();
    await expect(search).toHaveValue("商船三井");
  });

  /*
    F0（#208）で `usePathname` を剥がすときに壊れうる1点。

    **ヘッダはレイアウトが持っていてページ遷移で作り直されない。** いまは
    `usePathname` が React の context なので、パスが変わるとヘッダが再レンダー
    され、`?q=` を見て入力欄を合わせる effect が走り直す。context を外すと
    その経路が消える——**送信せずに打ちかけた語が `/` へ移っても残る**形になる。

    ここを固定しておく。落ちたら「その場でパスを読む」だけでは足りないという
    ことなので、パスの変化を購読する側で直す。サイト名で `/about` からランキングへ
    移れること自体（`docs/site-chrome/spec.md` の AC-2）もここで見る。
  */
  test("/about で打ちかけた語は、サイト名から / へ移ると消える", async ({ page }) => {
    await page.goto("/about");
    const search = page.getByRole("banner").getByRole("searchbox", { name: "会社名で検索" });
    await search.fill("商船三井");
    await expect(search).toHaveValue("商船三井");

    // 送信しない。ヘッダのサイト名で `/` へ移る。
    await page.getByRole("banner").getByRole("link", { name: "OpenReport" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(rows(page).first()).toContainText(firstOf("").name);
    await expect(search).toHaveValue("");
  });
});

/*
 * U13（Issue #88）でモックに合わせ直した見た目（PC）。**機能ではなく形**を固定する。
 * ここが動くと Claude Design の 5a / 5c とまた食い違うので、変えるときは
 * `docs/ranking/ranking-mock-alignment/design.md` の対照表も直すこと。
 */
test.describe("U13 モックとの一致", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  // 順位の列が残っていれば4列になる（順位はロゴ左上のバッジ）。
  test("表は3列で、社名は省略記号で切れない", async ({ page }) => {
    await page.goto("/");

    const headers = page.getByRole("table").locator("thead th");
    await expect(headers).toHaveCount(3);
    await expect(headers.first()).toHaveText("順位・会社名");

    // 社名のリンクが、割り当てられた列の中に収まっている（はみ出すと … で切れる）。
    const link = rows(page).first().getByRole("link").first();
    const overflow = await link.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  /*
   * 業種は meta 行に出さない（運営者の指示。行が長くなって末尾が見切れていた）。
   * **年齢そろえでも同じ1行のまま**——PC の末尾に付けていた「実績 ◯万円」は冗長なので
   * 外した（8巡目・運営者の指示）。同じ会社を両方の表示基準で開き、完全一致で見る。
   * 会社は実測値の1位をデータから選び、社名で検索して開く。期待する1行はその会社の
   * 値をアプリの整形関数に通して組む。
   */
  test("meta 行は平均年齢・在籍年数・従業員数の1行で、表示基準によらず同じ中身", async ({
    page,
  }) => {
    const target = firstOf("");
    const meta = `平均${formatDecimal1(target.avgAge)}歳 ・ 在籍${formatDecimal1(target.avgTenure)}年 ・ ${formatInt(target.employees)}人`;
    const q = `q=${encodeURIComponent(target.name)}`;
    for (const path of [`/?${q}`, `/?${q}&age=35`]) {
      await page.goto(path);
      const row = rows(page).filter({
        has: page.getByRole("link", { name: target.name, exact: true }),
      });
      await expect(row.getByText(meta, { exact: true }), path).toBeVisible();
    }
  });

  test("表示基準の帯にラベルと説明文が付いている", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("並べ方")).toBeVisible();
    // 2文目はPCだけ（モバイルは1行に収める）。ここはPC幅で見ている。
    await expect(page.getByText("有価証券報告書の数値のまま。")).toBeVisible();
    // 同じ文が脚注にもあるので、帯の中のものを厳密に指す。
    await expect(page.getByText("年齢の違いは補正していません。", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page.getByText("業種の賃金カーブで補正した推定値です。")).toBeVisible();
  });

  test("ヘッダの検索は入力欄と検索ボタンが1つの帯になっている", async ({ page }) => {
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

  /*
   * `Table` の器は `overflow-x-auto` だけを持つ。CSS の仕様では片方が `visible` で
   * ないと `visible` は `auto` に計算されるため、**縦にも `auto` になっていて、
   * 端数で1pxはみ出すと表だけがスクロールする小窓になっていた**（公開後の報告）。
   */
  test("表の器が縦スクロールを持たない", async ({ page }) => {
    await page.goto("/");
    const overflowY = await page
      .locator('[data-slot="table-container"]')
      .first()
      .evaluate((el) => getComputedStyle(el).overflowY);
    expect(["visible", "hidden", "clip"]).toContain(overflowY);
  });
});

/*
 * 順位バッジ（アートボード 3e / 4d）。順位カラムを廃して、ロゴ左上のホームベース型
 * バッジに移した。**固定幅のレーンに桁数の変わる数字を入れていたのが元の不具合**で、
 * 3〜4桁がレーンからあふれてロゴ画像に重なっていた。ここで固定したいのは
 * 「**桁数が変わっても左端・上端が動かない**」こと——バッジは右へだけ伸びる。
 */
test.describe("順位バッジ", () => {
  /*
   * 1桁・2桁・3桁・4桁の順位。各桁のいちばん小さい順位（1・10・100・1000）を使い、
   * 出るページは `rankSample` がデータで確かめる。順位は金額の並びでの位置（1から
   * 連番）なので、社数がその順位に届いていれば必ず居る。
   */
  test("1桁・2桁・3桁・4桁の順位のどれでも左端・上端が揃い、4桁でも社名・金額に届かない", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const RANKS = [1, 10, 100, 1000].map(rankSample);

    const offsets = [];
    for (const { url, rank } of RANKS) {
      await page.goto(url);
      const badge = page.locator("tbody tr [data-rank-badge]", { hasText: rankText(rank) });
      const row = badge.locator("xpath=ancestor::tr");
      const badgeBox = (await badge.boundingBox())!;
      const rowBox = (await row.boundingBox())!;
      offsets.push({ dx: badgeBox.x - rowBox.x, dy: badgeBox.y - rowBox.y, width: badgeBox.width });

      if (rank.length === 4) {
        /*
         * バッジはロゴの器に**左上の角だけ**乗る。4桁で右へ伸びても器の中に留まり、
         * 社名にも金額にも届かない——元の不具合は数字が社名の側へあふれることだった。
         */
        const right = badgeBox.x + badgeBox.width;
        const logo = (await row.locator("[data-logo]").first().boundingBox())!;
        const name = (await row.getByRole("link").first().boundingBox())!;
        const salary = (await row.locator("td").nth(1).boundingBox())!;
        expect(right, "ロゴの器の右端").toBeLessThan(logo.x + logo.width);
        expect(right, "社名の左端").toBeLessThan(name.x);
        expect(right, "金額の列の左端").toBeLessThan(salary.x);
      }
    }

    // 左端・上端は1pxも動かない（min-width が下限で、伸びるのは右だけ）。
    for (const [i, offset] of offsets.entries()) {
      expect(offset.dx, RANKS[i].rank).toBeCloseTo(offsets[0].dx, 1);
      expect(offset.dy, RANKS[i].rank).toBeCloseTo(offsets[0].dy, 1);
    }
    // 1桁と2桁は min-width で同じ幅、4桁はそれより広い。
    expect(offsets[1].width).toBeCloseTo(offsets[0].width, 1);
    expect(offsets[3].width).toBeGreaterThan(offsets[0].width);
  });
});

/*
 * リード文の掲載条件（運営者の指示 2026-08-27）と金額の出どころ。**どちらも PC でも
 * モバイルでも出す**——`hidden md:inline` に入れると、狭い画面の読者にだけ「なぜ数人の
 * 持株会社が載っていないのか」「何の金額か」が届かない（年齢そろえの「有価証券報告書」は
 * 実際に PC でだけ出ていた）。数は `meta.excluded.minEmployees` から引くので、期待値も
 * 同じところから取る。**表示基準を切り替えても消えない**ことも見る。
 */
test("リード文の掲載条件（従業員数の下限）と有価証券報告書は PC・モバイルの両方、どちらの表示基準でも出る", async ({
  page,
}) => {
  const condition = `従業員${formatInt(companies.meta.excluded.minEmployees)}人以上が対象。`;
  for (const [label, width] of [
    ["PC", 1280],
    ["モバイル", 390],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    for (const [basis, path] of [
      ["実測値", "/"],
      ["年齢そろえ", "/?age=35"],
    ] as const) {
      await page.goto(path);
      // `useInnerText`: 既定の `textContent` は `hidden md:inline` で消えた字も拾う。
      const lead = page.locator("h1 + p");
      for (const text of [condition, "有価証券報告書の平均年間給与"]) {
        await expect(lead, `${label}・${basis}`).toContainText(text, { useInnerText: true });
      }
    }
  }
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

    await dialog
      .getByRole("group", { name: "従業員数" })
      .getByRole("button", { name: "〜300人" })
      .click();
    await expect(page).toHaveURL(/emp=-300/);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByText("適用中")).toBeVisible();
  });
});

/*
 * モバイルの行の形（アートボード 2a、Issue #119）と、U13 でモックに合わせた
 * モバイルの見た目。**描かれた形が崩れていないこと**——重なり・列のずれ・折り返し——
 * を見る。器の寸法（68×48・バー3px・金額16px 等）そのものは写さない。
 * `docs/ranking/ranking-mock-alignment/design.md` の「モバイルの行を4カラムにする」に対応。
 */
test.describe("モバイルの行（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const mobileRows = (page: Page) => page.locator("div.md\\:hidden > div");

  /*
   * 390px で折り返すと本文が画面外へ押し出されるものを、1画面ぶんまとめて見る。
   * - 表（`hidden md:block`）は隠れて行の一覧が出る。**`h1` はページに1つ**
   *   （`locator("h1")` の strict mode。`astro.config.mjs` の開発ツールバーの件）
   * - 並び替えのチップと「絞り込み」が1行に収まる（方向の語を `sm` 以上に限った理由）
   * - ヘッダが1段に収まる
   * - 見出しは1行、説明文は2行まで。掲載条件（従業員100人以上）を両方の幅に出す
   *   （運営者の指示 2026-08-27）ぶん 390px では1行に収まらないので、上限だけを固定する
   */
  test("表は行の一覧に替わり、並び替え・ヘッダ・見出しが折り返さない", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("table")).toBeHidden();
    await expect(page.locator("h1")).toBeVisible();

    const groupBox = (await page.getByRole("group", { name: "並び替え" }).boundingBox())!;
    const filterBox = (await page.getByRole("button", { name: /絞り込み/ }).boundingBox())!;
    expect(Math.abs(groupBox.y - filterBox.y), "並び替えと絞り込みが同じ行").toBeLessThanOrEqual(2);

    const banner = page.getByRole("banner");
    const brandBox = (await banner.getByRole("link", { name: "OpenReport" }).boundingBox())!;
    const aboutBox = (await banner.getByRole("link", { name: "計算方法" }).boundingBox())!;
    expect(Math.abs(brandBox.y - aboutBox.y), "ヘッダが1段").toBeLessThanOrEqual(4);

    expect(await renderedLines(page.getByRole("heading", { level: 1 })), "見出し").toHaveLength(1);
    expect((await renderedLines(page.locator("h1 + p"))).length, "説明文").toBeLessThanOrEqual(2);
    expect(
      await renderedLines(page.getByText("有価証券報告書の数値のまま。")),
      "帯のヒント"
    ).toHaveLength(1);
  });

  /*
   * **順位はロゴに載るので独立した列ではない。** ロゴ / 社名 / 金額 が左から重ならずに
   * 並び、バーは**金額ブロックの中**に収まる（Issue #119）——行の全幅に伸ばすと順位と
   * ロゴの下まで掛かり、どの社名に対する帯なのかが読めない。
   */
  test("ロゴ / 社名 / 金額が重ならずに並び、バーは金額ブロックの中で金額と左端が揃う", async ({
    page,
  }) => {
    await page.goto("/");
    const row = mobileRows(page).first();

    const logo = row.locator('[data-logo="image"], [data-logo="initial"]');
    const name = row.getByRole("link").first();
    const salary = row.getByText(formatManYen(firstOf("").avgSalary));

    const boxes = await Promise.all(
      [logo, name, salary].map(async (l) => (await l.boundingBox())!)
    );
    const lefts = boxes.map((b) => Math.round(b.x));
    expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
    for (let i = 0; i < boxes.length - 1; i++) {
      expect(boxes[i].x + boxes[i].width).toBeLessThanOrEqual(boxes[i + 1].x + 1);
    }

    // バッジだけはロゴの左上に重なる（列ではない）。社名には届かない。
    const badge = (await row.locator("[data-rank-badge]").boundingBox())!;
    expect(badge.x).toBeLessThan(boxes[0].x);
    expect(badge.x + badge.width).toBeGreaterThan(boxes[0].x);
    expect(badge.x + badge.width).toBeLessThan(boxes[1].x);

    const bar = (await row.locator('[aria-hidden="true"]').last().boundingBox())!;
    const rowBox = (await row.boundingBox())!;
    const salaryBox = boxes[2];
    // **数値の左端とバーの左端が揃う。** 金額を左寄せにした狙いがこれ。
    expect(Math.abs(bar.x - salaryBox.x), "バーの左端").toBeLessThanOrEqual(1);
    expect(
      Math.abs(bar.x + bar.width - (rowBox.x + rowBox.width)),
      "バーの右端は行の右端"
    ).toBeLessThanOrEqual(2);
    expect(bar.x, "バーは行の右半分に収まる").toBeGreaterThan(rowBox.x + rowBox.width / 2);
  });

  /*
   * 9行ぶんをまとめて測る。
   * - **金額の左端とバーの左端が全行で1つの値に揃う**（桁数の少ない会社でも崩れない）
   * - **金額は1行に収まる。** このサイトは webfont を持たず OS のフォントで組むので、
   *   4桁の金額（「◯,◯◯◯万円」）の実測幅は環境で変わる。80px に詰めていたとき「円」
   *   だけが2行目に落ちた（報告あり）。幅の値ではなく1行に収まっていることを見る
   * - **行の高さが揃う**（社名の長さによらずロゴが高さを決める）
   */
  test("9行ぶん、金額とバーの左端が揃い、金額は1行に収まり、行の高さも揃う", async ({ page }) => {
    await page.goto("/");
    const measured = await mobileRows(page).evaluateAll((els) =>
      els.slice(0, 9).map((el) => {
        const block = el.lastElementChild!;
        const amount = block.firstElementChild!;
        const bar = block.lastElementChild!;
        return {
          amountLeft: Math.round(amount.getBoundingClientRect().left),
          barLeft: Math.round(bar.getBoundingClientRect().left),
          amountLines: amount.getClientRects().length,
          height: Math.round(el.getBoundingClientRect().height),
        };
      })
    );
    expect(measured).toHaveLength(9);
    expect(new Set(measured.flatMap((m) => [m.amountLeft, m.barLeft])).size, "左端").toBe(1);
    expect(
      measured.map((m) => m.amountLines),
      "金額の行数"
    ).toEqual(Array(9).fill(1));
    expect(new Set(measured.map((m) => m.height)).size, "行の高さ").toBe(1);
  });

  // PC と同じ記号に統一してある（アートボード 3e）。
  test("順位はロゴ左上のバッジで、桁が増えても左端・上端が動かない", async ({ page }) => {
    const offset = async ({ url, rank }: { url: string; rank: string }) => {
      await page.goto(url);
      const badge = page.locator("div.md\\:hidden [data-rank-badge]", { hasText: rankText(rank) });
      const logo = badge.locator("xpath=preceding-sibling::*[1]");
      const badgeBox = (await badge.boundingBox())!;
      const logoBox = (await logo.boundingBox())!;
      return { dx: badgeBox.x - logoBox.x, dy: badgeBox.y - logoBox.y, width: badgeBox.width };
    };

    const one = await offset(rankSample(1));
    const four = await offset(rankSample(1000));

    expect(four.dx).toBeCloseTo(one.dx, 1);
    expect(four.dy).toBeCloseTo(one.dy, 1);
    expect(four.width).toBeGreaterThan(one.width);
  });
});

/*
 * 受け入れ条件（Issue #119）——**社名が切れても偏差値と金額は常に全部見える**。
 * 360px は最も狭い実機の幅で、ここで偏差値が省略記号に飲まれると「他社と見比べる」
 * 数値が2つとも読めなくなる。
 *
 * **ランキングの横スクロールの検査はここに集めてある。** 以前は絞り込み・表示基準・
 * 並び替え・シートのファイルごとに 375 / 390px で1本ずつ持っていた。共通ヘッダの
 * 横スクロール（`docs/site-chrome/spec.md` の AC-9・AC-27。`theme.spec.ts`・
 * `branding.spec.ts` にあった）も `/` の1行で見ている。状態ごとの最悪ケースを全部回す——
 * - `/`・`/?age=35`: 金額の桁が表示基準で変わる
 * - `/?sort=emp`: 並び替えのチップが選ばれた状態（390px で「絞り込み」と並ぶ幅）
 * - 社名がいちばん長い会社の行: 390px でも切れる長い社名（金額を16pxに落として社名の幅が
 *   広がったので、「大和証券グループ本社」では切れなくなった）。両方の表示基準で、その会社が
 *   出るページを開いて見る
 * - `?ind=<業種名がいちばん長い業種>&age=60`: いちばん長い見出し（`◯◯の60歳年収ランキング`）
 *   とリード文。年齢そろえは実測値より長い
 *
 * 社名と業種名はデータから選ぶ（どちらも長さで決まる最悪ケース）。長い社名の会社は
 * `?q=` で絞らず、その会社が出るページで開く——2026-09 時点では、長い検索語が「適用中」の
 * チップを縮めずに押し出して横スクロールを出す（社名の行とは別の崩れ）。
 *
 * **リード文はどの状態でも3行まで。** 360px では業種が無くても年齢そろえで3行になる
 * （掲載条件を両方の幅に出すと決めた代償。運営者の指示 2026-08-27）。業種で絞ると
 * 業種名と社数のぶん長くなるが、4行にはしない。
 */
const LONGEST_NAME = companies.rows.reduce((a, b) => (b[1].length > a[1].length ? b : a))[1];
const LONGEST_INDUSTRY = companies.industries.reduce((a, b) => (b.length > a.length ? b : a));

/**
 * 社名がいちばん長い会社が出るページ。既定の並びでは順位＝並びの位置なので、全社の中の
 * 順位（`populationRank`。社名で絞っても変わらない）からページを逆算する。
 */
function longNamePath(age: TargetAge | null): string {
  const base: Record<string, string> = age === null ? {} : { age: String(age) };
  const query = (params: Record<string, string>) => new URLSearchParams(params).toString();
  const [company] = pageDataOf(query({ ...base, q: LONGEST_NAME })).bootstrap.page.companies;
  const pageNumber = Math.ceil(company.populationRank / PAGE_SIZE);
  return `/?${query({ ...base, page: String(pageNumber) })}`;
}

const MOBILE_CASES: { path: string; longName?: true }[] = [
  { path: "/" },
  { path: "/?age=35" },
  { path: "/?sort=emp" },
  { path: longNamePath(null), longName: true },
  { path: longNamePath(35), longName: true },
  { path: `/?ind=${encodeURIComponent(LONGEST_INDUSTRY)}&age=60` },
];

for (const width of [390, 360]) {
  test.describe(`モバイルの行が縮んでも数値が残る（${width}px）`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("横スクロールが出ず、社名だけが切れて偏差値と金額は切り詰められない", async ({ page }) => {
      for (const { path, longName } of MOBILE_CASES) {
        await page.goto(path);
        expect(await horizontalOverflow(page), `${path} の横スクロール`).toBeLessThanOrEqual(0);

        expect(
          (await renderedLines(page.locator("h1 + p"))).length,
          `${path} のリード文`
        ).toBeLessThanOrEqual(3);

        if (path.includes("ind=")) {
          // 業種つきの見出しは「◯◯の」の後ろでだけ折り返す（`break-keep` ＋ `<wbr>`）。
          // 何もしないと `…ランキン` / `グ` のように語の途中で切れる。
          expect(
            await renderedLines(page.getByRole("heading", { level: 1 })),
            `${path} の見出し`
          ).toEqual([`${LONGEST_INDUSTRY}の`, "60歳年収ランキング"]);
        }

        const mobileRows = page.locator("div.md\\:hidden > div");
        const nameLink = page.getByRole("link", { name: LONGEST_NAME, exact: true });
        const row = longName ? mobileRows.filter({ has: nameLink }) : mobileRows.first();
        const rowBox = (await row.boundingBox())!;

        if (longName) {
          // 社名は1行で切れる。折り返していれば矩形が2つになる。
          const name = row.getByRole("link").first();
          expect(await name.evaluate((el) => el.getClientRects().length), `${path} の社名`).toBe(1);
          expect(
            await name.evaluate((el) => el.scrollWidth > el.clientWidth),
            `${path} の社名が切れている`
          ).toBe(true);
        }

        for (const [label, target] of [
          ["偏差値", row.getByText(/^偏差値/)],
          ["金額", row.getByText(/万円$/)],
        ] as const) {
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
          const where = `${path} の${label}`;
          // 1行に収まり、必要な幅がそのまま与えられている（省略記号に飲まれない）。
          expect(fits.lines, where).toBe(1);
          expect(fits.drawn, where).toBeGreaterThanOrEqual(fits.needed - 0.5);
          // 行の中に収まっている（押し出されていない）。
          expect(fits.left, where).toBeGreaterThanOrEqual(rowBox.x - 0.5);
          expect(fits.right, where).toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
        }
      }
    });
  });
}
