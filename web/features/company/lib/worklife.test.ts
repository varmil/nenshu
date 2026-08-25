import { describe, expect, it } from "vitest";
import type { WorklifeRecord } from "@/lib/data/worklife";
import { buildWorklifeView, WORKLIFE_BAR_MAX } from "./worklife";

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
