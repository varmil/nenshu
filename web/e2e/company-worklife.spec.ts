import { test, expect } from "./appTest";
import type { Page } from "@playwright/test";
import { collectPageRequests } from "./network";

/**
 * W1（Issue #150）——企業詳細ページの「残業・有給・男女の賃金の差異」の節。
 * `docs/worklife/spec.md` の AC-6〜AC-12・AC-16 に対応する。
 *
 * 値そのもの（spec が名指しする7社）は `lib/data/worklife.test.ts` が実データで、
 * 並べ方・単位・範囲・内訳の規則は `features/company/lib/worklife.test.ts` が固定して
 * いるので、ここは**ブラウザでどう出るか**（区分が5つある会社で崩れないか・長い区分名を
 * 切らないか・表示基準と独立か・JS実行前のHTMLに入っているか）と、各規則が画面に
 * 届いていることの代表だけを見る。
 */

const section = (page: Page) =>
  page.getByRole("heading", { name: "残業・有給・男女の賃金の差異" }).locator("xpath=..");

/** 1指標ぶんの器。`dt` の親（2カラムの行）を取る。 */
const metric = (page: Page, label: string) =>
  section(page).getByRole("term").filter({ hasText: label }).locator("xpath=../..");

/** 定義の注記（Issue 224）の中でも**書き写す価値のある語だけ**（AC-16 が名指ししている語）。 */
const OVERTIME_NOTE_WORDS = [
  "法定労働時間",
  "1日8時間",
  "週40時間",
  "管理職・事業場外みなし労働の適用者は算入されません",
];

test.describe("節の中身", () => {
  test("AC-6〜AC-9 値・定義・注記・出典と時点が出て、「推定」「実測値」の語は無い（トヨタ自動車）", async ({
    page,
  }) => {
    await page.goto("/company/7203");
    // AC-6: 全体値と公表する範囲。単位は値の隣（`20.3h`）で、見出しには期間だけが残る。
    const overtime = metric(page, "平均残業時間");
    await expect(overtime).toContainText("20.3");
    await expect(overtime).toContainText("対象正社員");
    await expect(overtime).toContainText("月あたり");

    // AC-8: 3つの値と、**数字だけを単独で置かない**ための定義（spec 2.4）。
    const gap = metric(page, "男女の賃金の差異");
    for (const value of ["67.0", "66.8", "59.7"]) await expect(gap).toContainText(value);
    await expect(gap).toContainText("女性の平均賃金 ÷ 男性の平均賃金 × 100");

    /*
     * AC-7・AC-8・AC-9 の断りと出典。「自己申告値」の語は節の出典の1行から外した
     * （運営者の指示で短くした）。区分名はページ末尾の「このページの出典」（C12）が
     * 持ち、監査を経ていないことは節の末尾の文が書く。
     */
    const worklife = section(page);
    for (const text of [
      "繰越分の消化により100%を超えることがあります",
      "職種構成や勤続年数の差が主因",
      "厚生労働省「女性の活躍推進企業データベース」の公表値（2026年3月時点）。",
      "2025年4月1日～2026年3月31日",
      "監査を経ていません",
    ]) {
      await expect(worklife).toContainText(text);
    }
    // 「実測値」は有報の平均年間給与を指す語で、ここで使うと意味が衝突する（glossary）。
    await expect(worklife).not.toContainText("推定");
    await expect(worklife).not.toContainText("実測値");
  });

  test("AC-6・AC-8 区分4件が登録順に並び、値の隣に単位が付き、会社の説明がそのまま出る（三菱商事）", async ({
    page,
  }) => {
    await page.goto("/company/8058");
    const overtime = metric(page, "平均残業時間");
    // **平均して1つの値にしない**（spec 1.4）。全体値＋4区分がそのまま並ぶ。
    for (const value of ["10.5", "14.1", "3.3", "3.2", "5.6"]) {
      await expect(overtime).toContainText(value);
    }
    const text = (await overtime.innerText()).replace(/\s+/g, "");
    // 登録順（総合職 → 一般職 → 嘱託その他 → 派遣社員）。値の大小で並べ替えない。
    expect(text.indexOf("総合職")).toBeLessThan(text.indexOf("一般職"));
    expect(text.indexOf("一般職")).toBeLessThan(text.indexOf("嘱託その他"));
    expect(text.indexOf("嘱託その他")).toBeLessThan(text.indexOf("派遣社員"));

    /*
     * 単位は**値の隣**に出す（運営者の指示）。数字だけが並ぶと、残業の `10.5` と
     * 有給の `73.1` が同じ尺度に見える。見出し側に単位を重ねないことは
     * `worklife.test.ts` が固定している。
     */
    await expect(overtime.locator("dd")).toContainText("10.5h");
    await expect(metric(page, "年次有給休暇の取得率").locator("dd")).toContainText("73.1%");
    await expect(metric(page, "男女の賃金の差異").locator("dd")).toContainText("64.7%");

    // AC-8: 会社が登録した説明はそのまま出す（要約も編集もしない）。
    await expect(section(page).getByText("会社が登録した説明")).toBeVisible();
    await expect(section(page)).toContainText("同一資格・同一職務レベル");
  });

  /*
   * ~~全体値のラベルは公表する範囲そのもの~~ → **ラベルは「全体」、範囲は2行目に
   * 小さく添える**（運営者の指摘）。`その他 9.9h` と並ぶと、全体値ではなく
   * 「その他」という区分の値に読めた。区分名に「全体」を登録している会社（残業で5社）
   * でも、範囲の有無で全体値の行と見分けられる。
   */
  test("AC-6 全体値の行は「全体」に範囲を添え、区分名が「全体」の行と見分けられる（オーテック）", async ({
    page,
  }) => {
    await page.goto("/company/1736");
    const rows = metric(page, "平均残業時間").locator("div.items-center");
    await expect(rows).toHaveCount(4);
    // 先頭は全体値（範囲つき）、末尾は会社が「全体」と名付けた区分。
    await expect(rows.first().locator("span").first()).toHaveText("全体（対象正社員）");
    await expect(rows.first()).toContainText("13.3");
    await expect(rows.last().locator("span").first()).toHaveText("全体");
    await expect(rows.last()).toContainText("12.8");
  });
});

test.describe("AC-10 データが無いとき", () => {
  test("一部だけ無い会社は、その指標だけ「掲載なし」で、定義の注記も出さない（キーエンス）", async ({
    page,
  }) => {
    await page.goto("/company/6861");
    const overtime = metric(page, "平均残業時間");
    await expect(overtime).toContainText("掲載なし");
    await expect(overtime).toContainText("残業時間をデータベースに登録していません");
    // AC-16: 定義を添える相手の数字が画面に無いので、注記は出さない。
    await expect(overtime).not.toContainText("法定労働時間");
    // 節ごと消さない。有給と賃金の差異は出る。
    await expect(metric(page, "年次有給休暇の取得率")).toContainText("38.8");
    await expect(metric(page, "男女の賃金の差異")).toContainText("43.2");
  });

  /**
   * Issue #192。ベンチマークの iPhone 12 Pro（横幅390px）で、3指標の1文が
   * **どれも1行に収まる**こと。**文言ではなく高さで見る**——折り返しは字数と
   * 器の幅の兼ね合いで決まるので、文言を書き写しても崩れは捕まらない。
   */
  test("掲載が無い会社でも節と3指標の器が出て、「掲載なし」の1文が390pxで1行に収まる（三菱UFJ）", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/company/8306");
    const worklife = section(page);
    await expect(worklife).toBeVisible();
    await expect(worklife).toContainText("掲載がありません");
    await expect(worklife).toContainText("掲載は任意");
    // 3指標の器はすべて残る。
    for (const label of ["平均残業時間", "年次有給休暇の取得率", "男女の賃金の差異"]) {
      await expect(metric(page, label)).toContainText("掲載なし");
      const note = metric(page, label).getByText("データベースに登録していません");
      const lines = await note.evaluate(
        (el) =>
          el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)
      );
      expect(Math.round(lines), `${label} の1文が折り返している`).toBe(1);
    }
  });
});

/*
 * AC-11・AC-16（Issue 224 の注記を含む）。年齢そろえは有報の金額にしか効かない。
 * 三菱商事は区分5件・定義の注記・会社の説明がそろっていて、節の中身が最も多い会社。
 */
test("AC-11 表示基準を切り替えても節の中身が1文字も変わらず、ページ遷移も起きない（三菱商事）", async ({
  page,
}) => {
  // **ハイドレーションを待つ**（company-radar.spec.ts の AC-11 と同じ理由）。
  // 値は SSR の HTML にあるので、`toContainText` は押せる状態を待たない。
  await page.goto("/company/8058", { waitUntil: "networkidle" });
  const worklife = section(page);
  const before = await worklife.innerText();
  expect(before).toContain("法定労働時間");

  const requests = collectPageRequests(page);
  await page.getByRole("button", { name: "年齢そろえ" }).click();
  await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
  expect(await worklife.innerText()).toBe(before);

  // 表示基準は URL に出さない（R1・ADR-0012）。端の60歳を選んでも変わらない。
  await page.getByRole("group", { name: "目標年齢" }).getByRole("button", { name: "60歳" }).click();
  await expect(page.getByText("60歳時点の推定年収")).toBeVisible();
  expect(await worklife.innerText()).toBe(before);
  await expect(page).toHaveURL(/\/company\/8058$/);
  expect(requests).toHaveLength(0);
});

test.describe("AC-12 レイアウトと初期HTML", () => {
  /*
   * 390px の最悪ケースを1本にまとめた（AC-12・AC-16 の横スクロールと、長い区分名・範囲）。
   * - 三菱商事: 区分5件と定義の注記（行も文も最も多い）
   * - 商船三井: `契約社員(フルタイム)` のような16文字級の区分名
   * - 電通総研: 最長の範囲（`（基幹的な職種）`）
   *
   * 区分名は**字を一段落として収める。省略記号にしない**（切ると「技術系…」だけが
   * 残って何の区分か読めない）。文字列は `textContent` なら切れていても全部取れて
   * しまうので、**器から溢れていないこと**で見る。範囲は `全体` の下に添える2行目で、
   * 最長でも1行に収まる（`全体（対象正社員）` を1行に書くと 96px の器の途中で折れた）。
   */
  test("390px で横スクロールが出ず、区分名を切らずに収め、範囲は1行に収まる", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    for (const [label, id, text] of [
      ["区分5件と定義の注記（三菱商事）", "8058", "法定労働時間"],
      ["16文字級の区分名（商船三井）", "9104", "契約社員(フルタイム)"],
      ["最長の範囲（電通総研）", "4812", "（基幹的な職種）"],
    ] as const) {
      await page.goto(`/company/${id}`);
      await expect(metric(page, "平均残業時間"), label).toContainText(text);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${label}: 横スクロール`).toBeLessThanOrEqual(0);

      const labels = await section(page)
        .locator("dd div.items-center > span:first-child")
        .evaluateAll((spans) =>
          spans.map((el) => {
            const scope = el.querySelector("span");
            return {
              text: el.textContent,
              clipped: el.scrollWidth - el.clientWidth,
              scopeLines:
                scope === null
                  ? 1
                  : scope.getBoundingClientRect().height /
                    parseFloat(getComputedStyle(scope).lineHeight),
            };
          })
        );
      expect(labels.length, label).toBeGreaterThan(0);
      for (const row of labels) {
        expect(row.clipped, `${label}: ${row.text} が器から溢れている`).toBeLessThanOrEqual(0);
        expect(Math.round(row.scopeLines), `${label}: ${row.text} の範囲が折れている`).toBe(1);
      }
    }
  });

  /*
   * JS実行前のHTMLに値（SEO・spec 3.）と定義の注記（AC-16）の本文が入っている。
   * **注記は島の props に載せていない**（`worklife.test.ts`）ので、HTML に出ていれば
   * サーバーが描いたことになる。
   */
  test("JS実行前のHTMLに値と定義の注記が入っている（トヨタ自動車）", async ({ request }) => {
    const html = await (await request.get("/company/7203")).text();
    expect(html).toContain("残業・有給・男女の賃金の差異");
    expect(html).toContain("20.3");
    expect(html).toContain("67.0");
    for (const word of OVERTIME_NOTE_WORDS) expect(html).toContain(word);
  });
});

/*
 * Issue 191（2巡目・アートボード 6b / 6c）。W1 は「空のメモリを描くと器の長さが
 * 先に目に入る」として塗られたメモリだけを並べていたが、**下敷きが無いと
 * 目盛りの基準が消え、10.5 と 14.1 の差がどれだけのうちの差か読めない。**
 */
test("モックとの一致（2巡目）: バーは下敷きに値の割合を塗り、器は全行そろう。賃金の差異は全労働者だけ太い（三菱商事）", async ({
  page,
}) => {
  await page.goto("/company/8058");

  /** 実際に塗られている面積を持つか。`transparent` は 0 で返る。 */
  const alphaOf = (color: string) => {
    const m = color.match(/[\d.]+/g);
    if (m === null) return 0;
    return m.length >= 4 ? Number(m[3]) : 1;
  };
  for (const label of ["平均残業時間", "年次有給休暇の取得率"]) {
    const track = metric(page, label).locator("dd span[aria-hidden]").first();
    const bg = await track.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(alphaOf(bg), `${label} の下敷き`).toBeGreaterThan(0);
  }

  const tracks = await metric(page, "平均残業時間")
    .locator("dd span[aria-hidden]")
    .evaluateAll((els) =>
      els.map((t) => {
        const r = t.getBoundingClientRect();
        const fill = t.firstElementChild as HTMLElement | null;
        return {
          box: [Math.round(r.left), Math.round(r.width)],
          fill: fill === null ? -1 : Math.round(fill.getBoundingClientRect().width),
        };
      })
    );
  // 「全体 10.5」「総合職 14.1」——器は同じ幅なので、塗りの長さで比べられる。
  expect(tracks[0].fill).toBeGreaterThan(0);
  expect(tracks[1].fill).toBeGreaterThan(tracks[0].fill);
  /*
   * **器の左端も幅も全行そろう。** 区分名の列（`w-24`）と値の列（`min-w-14`）が固定幅
   * なので、`10.5h` と `3.3h` のように桁や単位が違っても器の右端は動かない——
   * 値の列を固定する前は9pxずれていて、棒を見比べられなかった（実測）。
   */
  expect(tracks.length).toBeGreaterThan(1);
  for (const t of tracks) expect(t.box).toEqual(tracks[0].box);

  // **太字が3つ並ぶと、どれが会社全体の値なのかが読み取れない**（Issue 191）。
  // うち正規・うち非正規は太字をやめ、一段小さく、ラベルを muted に。
  const gapRows = await metric(page, "男女の賃金の差異")
    .locator("dd > div > div")
    .evaluateAll((lines) =>
      lines.map((line) => {
        const [label, value] = [...line.children] as HTMLElement[];
        return {
          labelColor: getComputedStyle(label).color,
          weight: Number(getComputedStyle(value).fontWeight),
          size: Math.round(parseFloat(getComputedStyle(value).fontSize)),
        };
      })
    );
  expect(gapRows).toHaveLength(3);
  expect(gapRows[0].weight).toBeGreaterThanOrEqual(600);
  for (const row of gapRows.slice(1)) {
    expect(row.weight).toBeLessThan(600);
    expect(row.size).toBeLessThan(gapRows[0].size);
    expect(row.labelColor).not.toBe(gapRows[0].labelColor);
  }
});

/*
 * Issue #224——平均残業時間の定義の注記（AC-16）。
 *
 * 女性活躍データベースの算式は**法定労働時間**（1日8時間・週40時間）を起点に
 * 数える。所定労働時間が8時間より短い会社（三菱商事は1日7時間15分）では、会社が
 * 自社サイトに出す所定外労働時間より構造的に小さく出る（自社公表 31.0時間／月 に
 * 対してデータベースは全体10.5時間・総合職14.1時間）。**数値は補正せず、定義を
 * 画面に置く**——所定労働時間はどの一次情報にも無く、補正すると推定値になる。
 *
 * 掲載なしの会社に出さないことは AC-10（キーエンス）、表示基準との独立は AC-11、
 * JS実行前のHTMLは AC-12 のテストが見ている。
 */
test("定義の注記は残業にだけ、値の並びの下に1つ置く（三菱商事）", async ({ page }) => {
  await page.goto("/company/8058");
  const overtime = metric(page, "平均残業時間");
  for (const word of OVERTIME_NOTE_WORDS) await expect(overtime).toContainText(word);

  const text = await overtime.innerText();
  // 区分は4件＋全体値の5行。注記が行に付いていれば5回出る——区分によって定義が
  // 違うように見える。
  expect(text.split("法定労働時間")).toHaveLength(2);
  // 位置は値の並びの**下**——全体値と最後の区分（派遣社員）の後ろ。
  expect(text.indexOf("派遣社員")).toBeLessThan(text.indexOf("法定労働時間"));

  // 有給・賃金の差異には付けない（Issue 224 の対象外）。
  for (const label of ["年次有給休暇の取得率", "男女の賃金の差異"]) {
    await expect(metric(page, label), label).not.toContainText("法定労働時間");
  }
});
