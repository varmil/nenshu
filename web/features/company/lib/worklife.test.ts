import { describe, expect, it } from "vitest";
import type { WorklifeRecord } from "@/lib/data/worklife";
import {
  buildWorklifeView,
  metricFootnote,
  OVERTIME_DEFINITION_NOTE,
  WORKLIFE_BAR_MAX,
} from "./worklife";

const EMPTY: WorklifeRecord = {
  overtimeAll: null,
  overtimeScope: "",
  overtimeUnits: [],
  paidLeaveAll: null,
  paidLeaveUnits: [],
  wageGapAll: null,
  wageGapRegular: null,
  wageGapNonRegular: null,
  wageGapPeriod: "",
  asOf: "",
  updatedAt: "",
  note: "",
};

const record = (over: Partial<WorklifeRecord>): WorklifeRecord => ({ ...EMPTY, ...over });

const metric = (view: ReturnType<typeof buildWorklifeView>, key: string) =>
  view.metrics.find((m) => m.key === key)!;

describe("buildWorklifeView", () => {
  it("AC-10 掲載が無くても3指標の器が揃う", () => {
    const view = buildWorklifeView(null);
    expect(view.listed).toBe(false);
    expect(view.metrics.map((m) => m.key)).toEqual(["overtime", "paidLeave", "wageGap"]);
    // **項目ごと消さない。** 消すと「残業が少ない会社」と見分けがつかない。
    for (const m of view.metrics) expect(m.rows).toEqual([]);
  });

  /*
   * 単位は**値の隣**に出す（運営者の指示）。見出し側には、単位では表せない
   * 情報（残業の期間）だけを残す——同じ単位を2か所に出さない。
   */
  it("3指標とも値の隣に単位を持つ", () => {
    const view = buildWorklifeView(null);
    expect(view.metrics.map((m) => [m.key, m.valueSuffix])).toEqual([
      ["overtime", "h"],
      ["paidLeave", "%"],
      ["wageGap", "%"],
    ]);
  });

  it("見出しに単位を重ねない（残業は期間だけが残る）", () => {
    const view = buildWorklifeView(null);
    expect(view.metrics.map((m) => m.unit)).toEqual(["月あたり", "", ""]);
    for (const m of view.metrics) expect(m.unit).not.toContain(m.valueSuffix);
    // `時間` は値の `h` が持つので、見出しからは落ちている。
    expect(view.metrics[0].unit).not.toContain("時間");
  });

  /**
   * Issue #192。iPhone 12 Pro（横幅390px）で本文幅は358px、12px の字で29文字。
   * **文言を書き写さず長さで固定する**——書き写すと、文言を直すたびにテストも
   * 直すことになり、そのとき何も守らない。
   */
  it("掲載なしの1文は390pxで1行に収まる長さに収める", () => {
    for (const m of buildWorklifeView(null).metrics) {
      expect(m.emptyNote.length).toBeLessThanOrEqual(29);
      // 指標名は隣の見出しが持っているので繰り返さない。
      expect(m.emptyNote).not.toContain(m.label);
    }
  });

  it("AC-6 全体値を先に置き、区分は登録順のまま", () => {
    const view = buildWorklifeView(
      record({
        overtimeAll: 10.5,
        overtimeScope: "その他",
        overtimeUnits: [
          { unit: "総合職", value: 14.1 },
          { unit: "一般職", value: 3.3 },
        ],
      })
    );
    expect(metric(view, "overtime").rows.map((r) => [r.label, r.value])).toEqual([
      ["その他", 10.5],
      ["総合職", 14.1],
      ["一般職", 3.3],
    ]);
  });

  it("AC-6b 値の大小で並べ替えない（会社が主たる区分を先に置いている）", () => {
    const view = buildWorklifeView(
      record({
        overtimeUnits: [
          { unit: "営業・管理系", value: 10.7 },
          { unit: "技術系", value: 28.1 },
        ],
      })
    );
    expect(metric(view, "overtime").rows.map((r) => r.label)).toEqual([
      "営業・管理系",
      "技術系",
    ]);
  });

  it("値が null の区分は行にしない（欠測と 0 を分ける）", () => {
    const view = buildWorklifeView(
      record({
        overtimeUnits: [
          { unit: "登録なし", value: null },
          { unit: "パートタイム", value: 0 },
        ],
      })
    );
    expect(metric(view, "overtime").rows.map((r) => [r.label, r.value])).toEqual([
      ["パートタイム", 0],
    ]);
  });

  it("AC-7 100%超はそのまま出し、棒の長さだけ上限で止める", () => {
    const view = buildWorklifeView(record({ paidLeaveAll: 103 }));
    const row = metric(view, "paidLeave").rows[0];
    expect(row.value).toBe(103);
    expect(row.ratio).toBe(1);
    expect(WORKLIFE_BAR_MAX).toBe(100);
  });

  it("AC-8 賃金の差異は3行・バーを描かず、定義を添える", () => {
    const view = buildWorklifeView(
      record({ wageGapAll: 67, wageGapRegular: 66.8, wageGapNonRegular: 59.7 })
    );
    const wageGap = metric(view, "wageGap");
    expect(wageGap.rows.map((r) => [r.label, r.value])).toEqual([
      ["全労働者", 67],
      ["うち正規", 66.8],
      ["うち非正規", 59.7],
    ]);
    // **数字だけを単独で置かない**（spec 2.4）。何の割合かがラベルの隣に要る。
    expect(wageGap.definition).toBe("女性の平均賃金 ÷ 男性の平均賃金 × 100");
    for (const row of wageGap.rows) expect(row.ratio).toBeNull();
  });

  it("全労働者だけが会社全体の値で、うち正規・うち非正規は内訳として弱める", () => {
    const view = buildWorklifeView(
      record({ wageGapAll: 67, wageGapRegular: 66.8, wageGapNonRegular: 59.7 })
    );
    // **太字が3つ並ぶと、どれが会社全体の値なのかが読み取れない**（Issue 191）。
    expect(metric(view, "wageGap").rows.map((r) => r.subordinate === true)).toEqual([
      false,
      true,
      true,
    ]);
  });

  it("残業・有給の行は内訳ではない（全体値も区分も対等に並べる）", () => {
    const view = buildWorklifeView(
      record({
        overtimeAll: 20.3,
        overtimeScope: "対象正社員",
        overtimeUnits: [{ unit: "総合職", value: 26 }],
      })
    );
    // spec 2.2b の「代表を選ばない」は、見た目の強弱を付けないことでもある。
    for (const row of metric(view, "overtime").rows) {
      expect(row.subordinate).toBeUndefined();
    }
  });

  it("非正規が `-`（欠測）の会社は、その行だけ落ちる", () => {
    const view = buildWorklifeView(record({ wageGapAll: 67, wageGapNonRegular: null }));
    expect(metric(view, "wageGap").rows.map((r) => r.label)).toEqual(["全労働者"]);
  });

  it("節に「推定」「実測値」の語を持ち込まない（AC-9・glossary）", () => {
    const view = buildWorklifeView(record({ overtimeAll: 20.3, overtimeScope: "対象正社員" }));
    const text = JSON.stringify(view);
    expect(text).not.toContain("推定");
    expect(text).not.toContain("実測値");
  });

  it("公表する範囲が空なら「全体」に倒す", () => {
    const view = buildWorklifeView(record({ overtimeAll: 12 }));
    expect(metric(view, "overtime").rows[0].label).toBe("全体");
  });
});

/*
 * Issue #224——平均残業時間の定義の注記。
 *
 * **数値は補正しない。定義を明示する。** 女性活躍データベースの値は法定労働時間
 * を起点に数えるので、所定労働時間が8時間より短い会社（三菱商事は1日7時間15分）
 * では自社公表値より構造的に小さく出る。**所定労働時間はどの一次情報にも無い**
 * ので、補正すると推定値になる。
 */
describe("平均残業時間の定義の注記（Issue 224）", () => {
  it("注記は残業だけが持つ（有給・賃金の差異には付けない）", () => {
    expect(metricFootnote("overtime")).toBe(OVERTIME_DEFINITION_NOTE);
    expect(metricFootnote("paidLeave")).toBe("");
    expect(metricFootnote("wageGap")).toBe("");
  });

  /*
   * **島の props は HTML の属性に直列化される**ので、指標ごとに固定の110字を
   * ビューに持たせると同じ文が props と本文の2か所に出る（実測 +490 B／ページ）。
   * 会社ごとに変わる値ではないので、描画側で `metricFootnote` から引く。
   */
  it("ビューは注記を運ばない（props に載せない）", () => {
    const view = buildWorklifeView(
      record({ overtimeAll: 10.5, overtimeScope: "その他" })
    );
    expect(JSON.stringify(view)).not.toContain("法定労働時間");
  });

  it("算式の起点（法定労働時間）と除外規定が読める", () => {
    for (const word of ["法定労働時間", "1日8時間", "週40時間"]) {
      expect(OVERTIME_DEFINITION_NOTE).toContain(word);
    }
    expect(OVERTIME_DEFINITION_NOTE).toContain(
      "管理職・事業場外みなし労働の適用者は算入されません"
    );
  });

  /*
   * **注記は指標に1つ。行には持たせない。** 行が持つと区分5件の会社で同じ3文が
   * 5回並び、区分によって定義が違うように見える（描画側も `rows` の外に置く）。
   */
  it("区分がいくつあっても注記は1つ", () => {
    const view = buildWorklifeView(
      record({
        overtimeAll: 10.5,
        overtimeScope: "その他",
        overtimeUnits: [
          { unit: "総合職", value: 14.1 },
          { unit: "一般職", value: 3.3 },
          { unit: "嘱託その他", value: 3.2 },
          { unit: "派遣社員", value: 5.6 },
        ],
      })
    );
    const overtime = metric(view, "overtime");
    expect(overtime.rows).toHaveLength(5);
    // **注記は指標に1つ。行は持たない**——行が持つと同じ3文が5回並ぶ。
    for (const row of overtime.rows) {
      expect(JSON.stringify(row)).not.toContain("法定労働時間");
    }
  });

  /*
   * **「推定」の語を持ち込まない**（AC-9）。補正しないと決めたぶん、注記が
   * 推定の体裁を帯びる書き方にならないこと。
   */
  it("注記に「推定」「実測値」の語が無い", () => {
    expect(OVERTIME_DEFINITION_NOTE).not.toContain("推定");
    expect(OVERTIME_DEFINITION_NOTE).not.toContain("実測値");
  });
});
