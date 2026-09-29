import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { companies, pickCompany, rowIndexOf, worklife } from "@/testing/realData";
import { parseCsv } from "../../../pipeline/worklife/csv";
import { decodeWorklife, type WorklifeRecord, type WorklifeUnit } from "./worklife";

/**
 * **実物の `worklife.json` に対して固定する。** 並びの定義は
 * `pipeline/worklife/json.ts` にあり、`lib/data/worklife.ts` はその写しなので、
 * **合成データでテストしても写し違いを検出できない**（両側が同じ勘違いをしていれば
 * 通ってしまう）。
 *
 * 期待値は取り込み元の `pipeline/data/worklife.csv` から**列の名前で**組む。
 * `worklife.json` はこの CSV を添字の並びに詰めたものなので、読み戻した値が列の名前
 * どおりに戻れば、並びの写し違いは無い。値は書き写さない（毎日の更新で動く）。
 * spec.md の AC-6〜AC-8・AC-10 が見る状態は、その状態の会社をデータから選んで見る。
 * 選んだ会社を使わずに `pickRegistered` だけを呼んでいるところは、比べる項目に値を
 * 持つ会社が居ること（突き合わせが空の値どうしで通っていないこと）を確かめている。
 */

type Cells = Record<string, string>;

/** 取り込み元の CSV を ID で引く。読み方は `pipeline/scripts/build-data.ts` と同じ。 */
const csvById: Map<string, Cells> = (() => {
  const text = readFileSync(
    new URL("../../../pipeline/data/worklife.csv", import.meta.url),
    "utf-8"
  );
  const [header, ...lines] = parseCsv(text);
  return new Map(
    lines.map((line) => {
      const cells: Cells = {};
      header.forEach((name, i) => (cells[name] = line[i] ?? ""));
      return [cells.id, cells];
    })
  );
})();

const num = (raw: string) => (raw === "" ? null : Number(raw));

/** 雇用管理区分。列は `<prefix>1`・`<prefix>1<suffix>` … と番号で並ぶ。名前も値も空の枠は飛ばす。 */
function unitsOf(cells: Cells, prefix: string, suffix: string): WorklifeUnit[] {
  const units: WorklifeUnit[] = [];
  for (let n = 1; `${prefix}${n}` in cells; n++) {
    const unit = cells[`${prefix}${n}`];
    const value = cells[`${prefix}${n}${suffix}`];
    if (unit === "" && value === "") continue;
    units.push({ unit: unit.trim(), value: num(value) });
  }
  return units;
}

/** CSV の1行から、読み戻したときに得られるはずの値を組む。 */
function expectedOf(cells: Cells): WorklifeRecord {
  return {
    overtimeAll: num(cells.overtime_all),
    overtimeScope: cells.overtime_scope.trim(),
    overtimeUnits: unitsOf(cells, "overtime_unit", "_hours"),
    paidLeaveAll: num(cells.paid_leave_all),
    paidLeaveUnits: unitsOf(cells, "paid_leave_unit", "_rate"),
    wageGapAll: num(cells.wage_gap_all),
    wageGapRegular: num(cells.wage_gap_regular),
    wageGapNonRegular: num(cells.wage_gap_nonregular),
    wageGapPeriod: cells.wage_gap_period.trim(),
    asOf: cells.as_of.trim(),
    updatedAt: cells.updated_at.trim(),
    note: cells.wage_gap_note,
  };
}

const indexOf = new Map(companies.rows.map((row, i) => [row[0], i]));

function recordOf(id: string) {
  return decodeWorklife(worklife, indexOf.get(id) ?? rowIndexOf(id));
}

/** CSV に行がある会社のうち、条件に合う会社を選ぶ（無ければ落ちる）。 */
const pickRegistered = (what: string, pred: (cells: Cells) => boolean) =>
  pickCompany(what, (row) => {
    const cells = csvById.get(row[0]);
    return cells !== undefined && pred(cells);
  });

/** CSV に行がある全社で、読み戻した値の指定した項目が CSV の列と一致する。 */
function expectFieldsMatchCsv<K extends keyof WorklifeRecord>(keys: K[]) {
  const pick = (record: WorklifeRecord | null) =>
    record === null ? null : Object.fromEntries(keys.map((k) => [k, record[k]]));
  const ids = companies.rows.map((row) => row[0]).filter((id) => csvById.has(id));
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) {
    expect(pick(recordOf(id)), id).toEqual(pick(expectedOf(csvById.get(id)!)));
  }
}

/** 全社の読み戻した値（掲載の無い会社は除く）。 */
const decodedAll = () =>
  companies.rows
    .map((row) => ({ id: row[0], record: recordOf(row[0]) }))
    .filter((x): x is { id: string; record: WorklifeRecord } => x.record !== null);

describe("decodeWorklife", () => {
  it("行数が companies.rows と揃っている（ずれると別の会社の残業時間を出す）", () => {
    expect(worklife.rows.length).toBe(companies.rows.length);
    expect(worklife.notes.length).toBe(companies.rows.length);
  });

  it("AC-6 残業の全体値と公表する範囲が、取り込み元の CSV と一致する", () => {
    pickRegistered(
      "残業の全体値と公表する範囲がある会社",
      (c) => c.overtime_all !== "" && c.overtime_scope !== ""
    );
    expectFieldsMatchCsv(["overtimeAll", "overtimeScope"]);
  });

  it("AC-6・AC-6b 雇用管理区分ごとの残業時間が、会社が登録した区分名・登録順のまま揃う", () => {
    // **平均して1つの値にしない**（spec 1.4）。**区分名を「正規/非正規」のような軸に
    // 振り替えない**（spec 2.2b）。区分が2つ以上ある会社が居ることを先に確かめる。
    pickRegistered(
      "残業の区分が2つ以上ある会社",
      (c) => unitsOf(c, "overtime_unit", "_hours").length >= 2
    );
    expectFieldsMatchCsv(["overtimeUnits"]);
  });

  it("AC-7 有給取得率（全体値だけの会社も、区分だけの会社も）", () => {
    pickRegistered("有給の全体値がある会社", (c) => c.paid_leave_all !== "");
    pickRegistered(
      "有給の全体値が無く、区分だけがある会社",
      (c) => c.paid_leave_all === "" && unitsOf(c, "paid_leave_unit", "_rate").length > 0
    );
    expectFieldsMatchCsv(["paidLeaveAll", "paidLeaveUnits"]);
  });

  it("AC-8 男女の賃金の差異・対象期間・時点と、会社が登録した注釈", () => {
    pickRegistered(
      "賃金の差異の全体・正規・非正規と対象期間があり、注釈もある会社",
      (c) =>
        c.wage_gap_all !== "" &&
        c.wage_gap_regular !== "" &&
        c.wage_gap_nonregular !== "" &&
        c.wage_gap_period !== "" &&
        c.wage_gap_note !== ""
    );
    expectFieldsMatchCsv([
      "wageGapAll",
      "wageGapRegular",
      "wageGapNonRegular",
      "wageGapPeriod",
      "asOf",
      "updatedAt",
      "note",
    ]);
  });

  it("AC-10 掲載が無い会社は null", () => {
    // 持株会社は法人番号で突合できないことが多い。**子会社の値で代用しない**（ADR-0009）。
    const id = pickCompany("女性活躍DBに掲載が無い会社", (row) => !csvById.has(row[0]));
    expect(recordOf(id)).toBeNull();
    // 掲載があれば null にしない。
    for (const row of companies.rows) {
      expect(recordOf(row[0]) === null, row[0]).toBe(!csvById.has(row[0]));
    }
  });

  it("AC-10 一部だけ無い会社は、その指標だけが null", () => {
    const id = pickRegistered(
      "残業が無く、有給と賃金の差異はある会社",
      (c) =>
        c.overtime_all === "" &&
        unitsOf(c, "overtime_unit", "_hours").length === 0 &&
        unitsOf(c, "paid_leave_unit", "_rate").length > 0 &&
        c.wage_gap_all !== ""
    );
    const record = recordOf(id);
    expect(record?.overtimeAll).toBeNull();
    expect(record?.overtimeUnits).toEqual([]);
    // 残業が無くても有給と賃金の差異は出る。
    expect(record?.paidLeaveUnits.length).toBeGreaterThan(0);
    expect(record?.wageGapAll).not.toBeNull();
  });

  it("値が空の区分も、区分の行そのものは残す（値だけ null）", () => {
    /*
     * **W2（#185）で方針を変えた。** 以前は「欠測と 0 を分ける」として 0 を
     * そのまま持っていたが、**未記入を 0 で埋めたのか本当に 0 なのかを
     * 区別できない**ので取り込み時に落とすことにした（spec.md 1.4）。
     * **区分名は残る**——その会社が自社をどう切っているかは消えない（spec 2.2b）。
     */
    const id = pickRegistered("残業の区分名はあるが値が空の区分を持つ会社", (c) =>
      unitsOf(c, "overtime_unit", "_hours").some((u) => u.unit !== "" && u.value === null)
    );
    const units = recordOf(id)?.overtimeUnits ?? [];
    expect(units.some((u) => u.unit !== "" && u.value === null)).toBe(true);
  });

  it("有給の全体値 100% ちょうどで区分別がすべてそれ未満の会社は、全体値を持たない（Issue 185 例1）", () => {
    // 区分別が 100% を否定しているので、全体値の 100 のほうが入力ミス（W2）。区分別は残す。
    const misentered = decodedAll().filter(({ record }) => {
      const values = record.paidLeaveUnits
        .map((u) => u.value)
        .filter((v): v is number => v !== null);
      return record.paidLeaveAll === 100 && values.length > 0 && values.every((v) => v < 100);
    });
    expect(misentered.map(({ id }) => id)).toEqual([]);
  });

  it("残業時間と有給取得率に 0 以下の値は残っていない（全体値も区分別も落とす・Issue 185 例2）", () => {
    const nonPositive = decodedAll().filter(({ record }) =>
      [
        record.overtimeAll,
        record.paidLeaveAll,
        ...record.overtimeUnits.map((u) => u.value),
        ...record.paidLeaveUnits.map((u) => u.value),
      ].some((v) => v !== null && v <= 0)
    );
    expect(nonPositive.map(({ id }) => id)).toEqual([]);
  });
});
