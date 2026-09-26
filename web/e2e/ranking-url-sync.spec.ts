import { test, expect } from "./appTest";
import { collectPageRequests, waitForRankingReady } from "./network";

/**
 * URL クエリとの同期（U5・AC-7）と、ページを跨いだ戻る/進む（U14・AC-15）。
 *
 * URL ⇄ 状態の変換（既定値の省略・並び順・不正値の扱い・往復）は
 * `lib/urlState.test.ts` が固定している。ここで見るのは、ブラウザでしか分からない
 * こと——JS 実行前の HTML・URL を直接開いたときの復元・操作でネットワークが起きない
 * こと・履歴（戻る/進む）。
 */

/** `<table>…</table>` の中身。行数・社名はここで数える（ロゴやメタデータの文字列を拾わない）。 */
const tableHtml = (html: string) => html.match(/<table[\s\S]*?<\/table>/)?.[0] ?? "";

/**
 * `<script>`・コメント・タグを落とした地の文。React は文字列の境目に `<!-- -->` を
 * 挟むので、そのままでは「82社 中 1〜30社目」が1続きにならない。
 */
const visibleText = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "");

test.describe("URLクエリとの同期", () => {
  /*
   * ブラウザ・JSを介さない生のHTTPリクエスト。検索エンジンのクローラーが取得する
   * HTMLと同じものを見る。SSR化前（output:'export'）はここが常にビルド時の
   * 初期値（絞り込みなし）になっており、この検証自体が原理的に不可能だった
   * （`docs/ranking/ssr-migration/design.md`参照）。
   *
   * 以前は表示基準・ページ送り・範囲外のページのファイルごとに1本ずつ持っていた。
   * **どの状態も同じ経路（`src/pages/index.astro` がクエリを読んで描く）なので1本に
   * まとめ、URL ごとの期待を表にした。** `/` の上位30社が入っていて31社目以降が
   * 入っていないこと（E0 のペイロード）は `initial-payload.spec.ts` が見ている。
   */
  test("SSR: JS を実行しない生の HTML が、URL の状態で描かれている", async ({ request }) => {
    const cases: {
      url: string;
      /** 地の文に含まれるべき文字列。 */
      text?: string[];
      /** HTML 全体に含まれてはならない文字列。 */
      notInHtml?: string[];
      /** 表に含まれるべき／含まれてはならない社名。 */
      inTable?: string[];
      notInTable?: string[];
      rows?: number;
    }[] = [
      // 既定は実測値（ADR-0007）。ハイドレーション前の段階で固定する。
      {
        url: "/",
        text: ["平均年収ランキング", "平均年収（有報）"],
        notInHtml: ["35歳時点の推定年収"],
      },
      // AC-7。銀行業は82社で、1ページは PAGE_SIZE=30件（Issue #103）。絞り込みが
      // 効いていることは件数の表示で見る（行数は PAGE_SIZE で頭打ちのため）。
      {
        url: "/?age=45&ind=%E9%8A%80%E8%A1%8C%E6%A5%AD",
        text: ["銀行業の45歳年収ランキング", "82社 中 1〜30社目"],
        rows: 30,
      },
      // 2ページ目の先頭は実測値の並びで31位（PAGE_SIZE + 1）の会社。
      {
        url: "/?page=2",
        inTable: ["ジャフコ　グループ株式会社"],
        notInTable: ["ヒューリック株式会社"],
      },
      // 範囲外の page は最終ページに丸める（クラッシュしない）。
      { url: "/?page=999999", inTable: ["株式会社ＷＯＬＶＥＳ　ＨＡＮＤ"] },
    ];

    for (const c of cases) {
      const response = await request.get(c.url);
      expect(response.status(), c.url).toBe(200);
      const html = await response.text();
      const table = tableHtml(html);
      const text = visibleText(html);

      for (const s of c.text ?? []) expect(text, `${c.url} の地の文`).toContain(s);
      for (const s of c.notInHtml ?? []) expect(html, `${c.url} の HTML`).not.toContain(s);
      for (const s of c.inTable ?? []) expect(table, `${c.url} の表`).toContain(s);
      for (const s of c.notInTable ?? []) expect(table, `${c.url} の表`).not.toContain(s);
      if (c.rows !== undefined) {
        const rowCount = (table.match(/<tr/g) ?? []).length - 1; // thead の1行を除く
        expect(rowCount, `${c.url} の行数`).toBe(c.rows);
      }
    }
  });

  // `age` の有無が表示基準を表す（ADR-0007）。AC-7 の2つのシナリオ。
  test("AC-7: URL を直接開くと、表示基準・年齢・業種がその状態で復元される", async ({ page }) => {
    for (const [url, pressed, heading] of [
      ["/?age=45&ind=銀行業", "45歳", "銀行業の45歳年収ランキング"],
      ["/?ind=銀行業", "実測値", "銀行業の平均年収ランキング"],
    ] as const) {
      await page.goto(url);

      await expect(page.getByRole("button", { name: pressed }), url).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      await expect(page.getByRole("heading", { level: 1 }), url).toHaveText(heading);
      await expect(page.getByRole("combobox", { name: "業種" }), url).toContainText("銀行業");
      // 銀行業は82社。1ページはPAGE_SIZE=30件なので、82社であることは件数表示で見る。
      await expect(page.getByText("82社 中 1〜30社目"), url).toBeVisible();
      await expect(page.getByRole("table").locator("tbody tr"), url).toHaveCount(30);
    }
  });

  /*
   * 実測値 ⇄ 年齢そろえ の切替も、年齢・業種と同じく履歴に積まれる。
   * 最後の1回で「年齢そろえにしてから戻ると実測値に戻る」ことも見る。
   */
  test("ブラウザの戻るを押すと一つ前の絞り込み状態に戻る", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);

    await page.getByRole("button", { name: "45歳" }).click();
    await expect(page).toHaveURL(/[?&]age=45/);

    await page.getByRole("combobox", { name: "業種" }).click();
    await page.getByRole("option", { name: "海運業", exact: true }).click();
    await expect(page).toHaveURL(/[?&]ind=/);

    await page.goBack();
    await expect(page).toHaveURL(/[?&]age=45/);
    await expect(page).not.toHaveURL(/[?&]ind=/);
    await expect(page.getByRole("button", { name: "45歳" })).toHaveAttribute("aria-pressed", "true");

    await page.goBack();
    await expect(page).toHaveURL(/[?&]age=35/);
    await expect(page.getByRole("button", { name: "35歳" })).toHaveAttribute("aria-pressed", "true");

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "実測値" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByRole("button", { name: "45歳" })).toBeDisabled();
  });

  /*
   * **操作でネットワークリクエストが発生しない**（AC-7。全件は初回に1度だけ届く・
   * ADR-0013）。以前は表示基準・絞り込み・並び替え・向きの反転・ページ送り・業種チップ・
   * ヘッダの検索・サイト名・メタデータの更新と、操作ごとに10本近くに散らばっていた。
   * **1本の流れで続けて操作し、1手ごとに0件であることを見る**（どの手で起きたかが
   * 失敗のメッセージに出る）。
   *
   * 取り分けて危ないのは次の3つで、どれも実体のあるリンクや form を持っている。
   * - 業種チップ: `<a href="/?ind=…">` の左クリックを横取りしている（ADR-0006 の経路）
   * - ヘッダの検索: `/` の上だけ `pushState`、それ以外は素の `<form action="/">`
   * - サイト名: `/` の上ではクリックを横取りして `pushRankingReset()` を呼ぶ。
   *   `<Link href="/">` に任せていた頃は URL だけ `/` になって表が絞り込まれたまま
   *   だった（公開後の報告）。**`?age=35` から始める**のは、戻す先がサーバーの
   *   初期値ではなく既定の状態であることまで見るため
   */
  test("操作を続けてもネットワークリクエストが1件も発生しない", async ({ page }) => {
    await page.goto("/?age=35");
    await waitForRankingReady(page);
    const requests = collectPageRequests(page);

    const steps: [string, () => Promise<void>][] = [
      [
        "年齢スイッチ",
        async () => {
          await page.getByRole("button", { name: "45歳" }).click();
          await expect(page).toHaveURL(/\/\?age=45$/);
        },
      ],
      [
        "表示基準（実測値へ）",
        async () => {
          await page.getByRole("button", { name: "実測値" }).click();
          await expect(page).toHaveURL(/\/$/);
        },
      ],
      [
        "表示基準（年齢そろえへ）",
        async () => {
          await page.getByRole("button", { name: "年齢そろえ" }).click();
          await expect(page).toHaveURL(/\/\?age=35$/);
        },
      ],
      [
        "ページ送り",
        async () => {
          await page.getByRole("button", { name: "次のページへ" }).click();
          await expect(page).toHaveURL(/[?&]page=2$/);
        },
      ],
      [
        "ページ番号",
        async () => {
          await page.getByRole("button", { name: "4", exact: true }).click();
          await expect(page).toHaveURL(/[?&]page=4$/);
        },
      ],
      [
        "並び替え",
        async () => {
          await page
            .getByRole("group", { name: "並び替え" })
            .getByRole("button", { name: "平均年齢 高い順" })
            .click();
          await expect(page).toHaveURL(/\/\?age=35&sort=age$/);
        },
      ],
      [
        "並び替えの向きの反転",
        async () => {
          await page
            .getByRole("group", { name: "並び替え" })
            .getByRole("button", { name: "平均年齢 高い順" })
            .click();
          await expect(page).toHaveURL(/[?&]sort=age-asc$/);
        },
      ],
      [
        "業種セレクト",
        async () => {
          await page.getByRole("combobox", { name: "業種" }).click();
          await page.getByRole("option", { name: "海運業", exact: true }).click();
          await expect(page).toHaveURL(/[?&]ind=%E6%B5%B7%E9%81%8B%E6%A5%AD/);
        },
      ],
      [
        "業種チップ",
        async () => {
          await page
            .getByRole("navigation", { name: "業種から見る" })
            .getByRole("link", { name: "銀行業 82社", exact: true })
            .click();
          await expect(page).toHaveURL(/[?&]ind=%E9%8A%80%E8%A1%8C%E6%A5%AD/);
          await expect(page.getByText("82社 中 1〜30社目")).toBeVisible();
          // 見出しも業種を名乗る。表示基準は年齢そろえのまま。
          await expect(page.getByRole("heading", { level: 1 })).toHaveText(
            "銀行業の35歳年収ランキング"
          );
        },
      ],
      [
        "従業員数のスイッチ",
        async () => {
          await page
            .getByRole("group", { name: "従業員数" })
            .getByRole("button", { name: "1,000人以上", exact: true })
            .click();
          await expect(page).toHaveURL(/[?&]emp=1000-/);
        },
      ],
      [
        "ヘッダの検索",
        async () => {
          await page
            .getByRole("banner")
            .getByRole("searchbox", { name: "会社名で検索" })
            .fill("みずほ");
          await expect(page).toHaveURL(/[?&]q=/);
          await expect(page.getByText("2,961社 中")).toHaveCount(0);
        },
      ],
      [
        "サイト名",
        async () => {
          await page.getByRole("banner").getByRole("link", { name: "OpenReport" }).click();
          await expect(page).toHaveURL(/\/$/);
          await expect(page.getByText("2,961社 中 1〜30社目")).toBeVisible();
          await expect(page.getByRole("button", { name: "実測値" })).toHaveAttribute(
            "aria-pressed",
            "true"
          );
          await expect(page.getByRole("heading", { level: 1 })).toHaveText("平均年収ランキング");
        },
      ],
    ];

    for (const [label, step] of steps) {
      await step();
      expect(requests, `${label}の後`).toEqual([]);
    }
  });
});

/**
 * ページを跨いだ戻る/進む（Issue #108・AC-15）。
 *
 * 戻ったときの `RankingApp` は**サーバーが渡した初期値で作り直されるとは限らない**——
 * ブラウザのキャッシュから返った HTML は「それが作られたときのURL」の値を持つ。
 * URL を正として読み直せているか、そして**抜けていくページが行き先のURLを書き潰して
 * いないか**をここで固定する（`lib/history/useLocationSyncedState.ts` の3規則）。
 */
test.describe("ページを跨いだ戻る/進む", () => {
  /*
   * 絞り込み（URL を直接開いて作る）とページ番号（`pushState` で作る）の両方を
   * 持った状態で往復する。**進むで企業ページへ戻れることも見る**——戻った先で
   * `pushState` すると進む先が消える。
   */
  test("絞り込んだ2ページ目から企業ページへ入って戻ると、同じ状態に戻り、進むでまた入れる", async ({
    page,
  }) => {
    await page.goto("/?age=35&ind=銀行業");
    await expect(page.getByText("82社 中 1〜30社目")).toBeVisible();
    await page.getByRole("button", { name: "次のページへ" }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(page.getByText("82社 中 31〜60社目")).toBeVisible();

    const firstLink = page.getByRole("table").locator("tbody tr a[href^='/company/']").first();
    const name = (await firstLink.textContent())?.trim();
    await firstLink.click();
    await expect(page).toHaveURL(/\/company\//);

    await page.goBack();

    await expect(page).toHaveURL(/[?&]ind=.*page=2/);
    // URL だけでなく中身も同じ状態であること（1ページ目・既定の状態に描き替わっていない）。
    await expect(page.getByRole("heading", { level: 1 })).toContainText("35歳年収ランキング");
    await expect(page.getByText("82社 中 31〜60社目")).toBeVisible();
    await expect(firstLink).toHaveText(name!);

    await page.goForward();
    await expect(page).toHaveURL(/\/company\//);
  });

  test("クエリの並びが正規形でないURLでも、履歴が増えず、戻ればランキングに戻る", async ({
    page,
  }) => {
    // `?ind=…&age=…` は `buildSearchParams` の並び（age → ind）と違う。
    // 正規形に書き直して pushState すると、**戻っても同じページに留まる**
    // 履歴が1件挟まる（しかもハイドレート中に積まれるためルーター状態を持たず、
    // 戻ってもページが切り替わらない行き止まりになる）。
    await page.goto("/about"); // 履歴の基準を作る
    const before = await page.evaluate(() => history.length);

    await page.goto("/?ind=銀行業&age=35");
    await expect(page.getByText("82社 中 1〜30社目")).toBeVisible();
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    await expect(page).toHaveURL(/ind=.*age=35/);

    // 行き止まりの履歴を挟んでいると、戻っても**画面が企業ページのまま**動かない。
    await page.getByRole("table").locator("tbody tr a[href^='/company/']").first().click();
    await expect(page).toHaveURL(/\/company\//);
    await page.goBack();
    await expect(page).toHaveURL(/ind=/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("35歳年収ランキング");
  });

  // push と replace の分け方は `lib/queryBroadcast.test.ts` が持つ。ここでは実際の履歴の件数を見る。
  test("検索欄に打った文字数だけ履歴が増えない", async ({ page }) => {
    await page.goto("/");
    const before = await page.evaluate(() => history.length);

    await page.getByRole("searchbox", { name: "会社名で検索" }).pressSequentially("トヨタ自動車", {
      delay: 60,
    });
    await expect(page).toHaveURL(/[?&]q=/);
    await page.waitForTimeout(300);

    // 6文字打っても履歴は1件（検索を始めた1回ぶん）。
    expect(await page.evaluate(() => history.length)).toBe(before + 1);

    // 戻ると検索を始める前の一覧に戻る。
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("searchbox", { name: "会社名で検索" })).toHaveValue("");
  });
});
