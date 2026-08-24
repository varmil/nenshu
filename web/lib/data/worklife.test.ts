import { describe, expect, it } from "vitest";
import companiesData from "@/public/data/companies.json";
import worklifeData from "@/public/data/worklife.json";
import { decodeWorklife, type WorklifeData } from "./worklife";

/**
 * **実物の `worklife.json` に対して固定する。** 並びの定義は
 * `pipeline/worklife/json.ts` にあり、`lib/data/worklife.ts` はその写しなので、
 * **合成データでテストしても写し違いを検出できない**（両側が同じ勘違いをしていれば
 * 通ってしまう）。spec.md の AC-6〜AC-8・AC-10 が名指しする会社をそのまま使う。
 */

const worklife = worklifeData as unknown as WorklifeData;
const companies = companiesData as { rows: (string | number)[][] };
const indexOf = new Map(companies.rows.map((row, i) => [String(row[0]), i]));

function recordOf(id: string) {
  const index = indexOf.get(id);
  expect(index, `${id} が companies.json に無い`).toBeDefined();
  return decodeWorklife(worklife, index as number);
}

describe("decodeWorklife", () => {
  it("行数が companies.rows と揃っている（ずれると別の会社の残業時間を出す）", () => {
    expect(worklife.rows.length).toBe(companies.rows.length);
    expect(worklife.notes.length).toBe(companies.rows.length);
  });

  it("AC-6 全体値と公表する範囲（トヨタ自動車）", () => {
    const record = recordOf("7203");
    expect(record?.overtimeAll).toBe(20.3);
    expect(record?.overtimeScope).toBe("対象正社員");
  });

  it("AC-6 雇用管理区分ごとの残業時間が登録順で揃う（三菱商事）", () => {
    const record = recordOf("8058");
    expect(record?.overtimeAll).toBe(10.5);
    expect(record?.overtimeScope).toBe("その他");
    // **平均して1つの値にしない**（spec 1.4）。総合職と派遣社員の平均には意味がない。
    expect(record?.overtimeUnits).toEqual([
      { unit: "総合職", value: 14.1 },
      { unit: "一般職", value: 3.3 },
      { unit: "嘱託その他", value: 3.2 },
      { unit: "派遣社員", value: 5.6 },
    ]);
  });

  it("AC-6b 区分名は会社が登録したまま（新日本空調・みずほ銀行）", () => {
    // 職能で切る会社。**「正規/非正規」のような軸に振り替えない。**
    expect(recordOf("1952")?.overtimeUnits.map((u) => u.unit)).toEqual([
      "営業・管理系",
      "技術系",
    ]);
    // 組織階層と雇用形態が**1社の中で混ざる**。軸を1本に決められる前提が成り立たない。
    expect(recordOf("E03532")?.overtimeUnits.map((u) => u.unit)).toEqual([
      "カンパニー",
      "ユニット",
      "グループ",
      "無期契約フルタイム",
      "無期契約パートタイム",
    ]);
  });

  it("AC-7 有給取得率（LINEヤフーは全体値・キーエンスは区分つき）", () => {
    expect(recordOf("4689")?.paidLeaveAll).toBe(87.4);
    const keyence = recordOf("6861");
    expect(keyence?.paidLeaveAll).toBeNull();
    expect(keyence?.paidLeaveUnits).toEqual([{ unit: "正社員", value: 38.8 }]);
  });

  it("AC-8 男女の賃金の差異と対象期間（トヨタ自動車）", () => {
    const record = recordOf("7203");
    expect(record?.wageGapAll).toBe(67);
    expect(record?.wageGapRegular).toBe(66.8);
    expect(record?.wageGapNonRegular).toBe(59.7);
    expect(record?.wageGapPeriod).toBe("2025年4月1日～2026年3月31日");
    expect(record?.asOf).toBe("2026年3月時点");
    // 会社が登録した注釈（716社）はそのまま持つ。
    expect(record?.note.length).toBeGreaterThan(0);
  });

  it("AC-10 掲載が無い会社は null（三菱UFJフィナンシャル・グループ）", () => {
    // 持株会社は法人番号で突合できない。**子会社の値で代用しない**（ADR-0009）。
    expect(recordOf("8306")).toBeNull();
  });

  it("AC-10 一部だけ無い会社は、その指標だけが null（キーエンス）", () => {
    const record = recordOf("6861");
    expect(record?.overtimeAll).toBeNull();
    expect(record?.overtimeUnits).toEqual([]);
    // 残業が無くても有給と賃金の差異は出る。
    expect(record?.paidLeaveUnits.length).toBe(1);
    expect(record?.wageGapAll).toBe(43.2);
  });

  it("欠測と 0 を分ける（みずほ銀行の無期契約パートタイムは残業 0 時間）", () => {
    const units = recordOf("E03532")?.overtimeUnits ?? [];
    expect(units[units.length - 1]).toEqual({ unit: "無期契約パートタイム", value: 0 });
  });
});
