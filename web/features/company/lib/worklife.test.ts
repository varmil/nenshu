import { describe, expect, it } from "vitest";
import type { WorklifeRecord } from "@/lib/data/worklife";
import {
  buildWorklifeView,
  metricFootnote,
  OVERTIME_DEFINITION_NOTE,
  unitLabel,
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
  it("単位は3指標とも値の隣に持ち、見出しには重ねない（残業は期間だけが残る）", () => {
    const view = buildWorklifeView(null);
    expect(view.metrics.map((m) => [m.key, m.unit, m.valueSuffix])).toEqual([
      ["overtime", "月あたり", "h"],
      ["paidLeave", "", "%"],
      ["wageGap", "", "%"],
    ]);
    // `時間` は値の `h` が持つので、見出しからは落ちている（`時間 / 月` にしない）。
    expect(view.metrics[0].unit).not.toContain("時間");
  });

  /**
   * Issue #192。iPhone 12 Pro（横幅390px）で本文幅は358px、12px の字で29文字。
   * **文言を書き写さず長さで固定する**——書き写すと、文言を直すたびにテストも
   * 直すことになり、そのとき何も守らない。実際に1行に収まることは
   * `e2e/company-worklife.spec.ts` が高さで見ている。
   */
  it("掲載なしの1文は390pxで1行に収まる長さに収める", () => {
    for (const m of buildWorklifeView(null).metrics) {
      expect(m.emptyNote.length).toBeLessThanOrEqual(29);
      // 指標名は隣の見出しが持っているので繰り返さない。
      expect(m.emptyNote).not.toContain(m.label);
    }
  });

  /*
   * AC-6・AC-6b。区分は**会社が登録した順・名前のまま**（spec 2.2b）。三菱商事の
   * 区分は値が単調でない（14.1 → 3.3 → 3.2 → 5.6）ので、昇順・降順のどちらに
   * 並べ替えても落ちる。
   */
  it("AC-6 全体値を先に置き、区分は登録順のまま（値の大小で並べ替えない）", () => {
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
    expect(metric(view, "overtime").rows.map((r) => [r.label, r.value])).toEqual([
      ["全体", 10.5],
      ["総合職", 14.1],
      ["一般職", 3.3],
      ["嘱託その他", 3.2],
      ["派遣社員", 5.6],
    ]);
  });

  /*
   * ~~全体値のラベルは公表する範囲そのもの~~ → **ラベルは `全体`、範囲は添える**
   * （運営者の指摘）。`その他 9.9h` と並ぶと、全体値ではなく「その他」という
   * 区分の値に読める。範囲は spec 2.2 のとおり読めるように残す（AC-6）。
   */
  it("残業の全体値は「全体」とし、公表する範囲を添える", () => {
    const view = buildWorklifeView(
      record({
        overtimeAll: 9.9,
        overtimeScope: "その他",
        overtimeUnits: [
          { unit: "正社員", value: 10 },
          { unit: "契約社員等", value: 4 },
        ],
      })
    );
    const rows = metric(view, "overtime").rows;
    expect(rows[0]).toMatchObject({ label: "全体", scope: "その他", value: 9.9 });
    // 範囲を持つのは全体値の行だけ。
    expect(rows.slice(1).every((r) => r.scope === undefined)).toBe(true);
  });

  /*
   * 有給の全体値には原典に対応する語が無く、残業も範囲が空の会社がある。
   * **島の props に直列化されるので、空文字も運ばない**（キーごと持たない）。
   */
  it("範囲が空なら持たない（有給の全体値・範囲の無い残業）", () => {
    const view = buildWorklifeView(record({ overtimeAll: 12, paidLeaveAll: 73.1 }));
    for (const key of ["overtime", "paidLeave"]) {
      const [row] = metric(view, key).rows;
      expect(row.label).toBe("全体");
      expect("scope" in row, key).toBe(false);
    }
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

  /*
   * **太字が3つ並ぶと、どれが会社全体の値なのかが読み取れない**（Issue 191）。
   * 一方、残業・有給の全体値と区分は対等に並べる——片方を弱めるのは spec 2.2b の
   * 「代表を選ばない」に反する。
   */
  it("内訳として弱めるのは賃金の差異の うち正規・うち非正規 だけ", () => {
    const view = buildWorklifeView(
      record({
        overtimeAll: 20.3,
        overtimeScope: "対象正社員",
        overtimeUnits: [{ unit: "総合職", value: 26 }],
        wageGapAll: 67,
        wageGapRegular: 66.8,
        wageGapNonRegular: 59.7,
      })
    );
    expect(metric(view, "wageGap").rows.map((r) => r.subordinate === true)).toEqual([
      false,
      true,
      true,
    ]);
    for (const row of metric(view, "overtime").rows) expect(row.subordinate).toBeUndefined();
  });

  it("非正規が `-`（欠測）の会社は、その行だけ落ちる", () => {
    const view = buildWorklifeView(record({ wageGapAll: 67, wageGapNonRegular: null }));
    expect(metric(view, "wageGap").rows.map((r) => r.label)).toEqual(["全労働者"]);
  });

  /*
   * AC-9・glossary。「実測値」は有報の平均年間給与を指す語で衝突する。
   * 定義の注記（Issue #224）も、補正しないと決めたぶん推定の体裁を帯びない書き方にする。
   */
  it("ビューにも定義の注記にも「推定」「実測値」の語を持ち込まない", () => {
    const view = buildWorklifeView(record({ overtimeAll: 20.3, overtimeScope: "対象正社員" }));
    for (const text of [JSON.stringify(view), OVERTIME_DEFINITION_NOTE]) {
      expect(text).not.toContain("推定");
      expect(text).not.toContain("実測値");
    }
  });
});

/*
 * Issue #224——平均残業時間の定義の注記。
 *
 * **数値は補正しない。定義を明示する。** 女性活躍データベースの値は法定労働時間
 * を起点に数えるので、所定労働時間が8時間より短い会社（三菱商事は1日7時間15分）
 * では自社公表値より構造的に小さく出る。**所定労働時間はどの一次情報にも無い**
 * ので、補正すると推定値になる。注記の中身と、値の並びの下に1つだけ出ることは
 * `e2e/company-worklife.spec.ts` が画面で見ている。
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
   * 行にも持たせない——行が持つと区分5件の会社で同じ3文が5回並ぶ。
   */
  it("ビューは注記を運ばない（props に載せない）", () => {
    const view = buildWorklifeView(
      record({
        overtimeAll: 10.5,
        overtimeScope: "その他",
        overtimeUnits: [{ unit: "総合職", value: 14.1 }],
      })
    );
    expect(JSON.stringify(view)).not.toContain("法定労働時間");
  });
});

/*
 * W3（Issue 802）。レーダーの断りは「先頭の区分「◯◯」」と節の行を名指しするので、
 * **節の行の名前と同じ関数を通す。** ずれると断りと節を突き合わせられない。
 */
describe("unitLabel", () => {
  it("区分名はそのまま、名前の無い区分は「全体」。節の行も同じ名前になる", () => {
    expect(unitLabel("正社員")).toBe("正社員");
    expect(unitLabel("")).toBe("全体");
    const view = buildWorklifeView(
      record({
        paidLeaveUnits: [
          { unit: "", value: 63.7 },
          { unit: "契約社員", value: 70 },
        ],
      })
    );
    expect(metric(view, "paidLeave").rows.map((r) => r.label)).toEqual([
      unitLabel(""),
      unitLabel("契約社員"),
    ]);
  });
});
