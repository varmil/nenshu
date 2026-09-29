import { describe, expect, it } from "vitest";
import {
  HISTORY_SPAN,
  coveringYears,
  historyWindowYears,
  indexInWindow,
  windowEnds,
} from "./historyWindow";

/** 会社 `code` の `from`〜`to` 年の行（値のある年だけ行がある、CSV と同じ形）。 */
const rowsOf = (code: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, k) => ({ edinetCode: code, year: from + k }));

describe("10年推移の窓（refresh の D5・AC-9）", () => {
  it("窓は右端から数えた10年", () => {
    expect(historyWindowYears(2026)).toEqual([
      2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
    ]);
    expect(historyWindowYears(2026)).toHaveLength(HISTORY_SPAN);
  });

  it("ある会社が新しい年の有報を出すと、その会社の窓だけが新しい年を右端にする", () => {
    const before = [...rowsOf("E00001", 2017, 2026), ...rowsOf("E00002", 2017, 2026)];
    const after = [...before, { edinetCode: "E00001", year: 2027 }];

    expect(windowEnds(before)).toEqual(
      new Map([
        ["E00001", 2026],
        ["E00002", 2026],
      ])
    );
    const ends = windowEnds(after);
    expect(historyWindowYears(ends.get("E00001")!)).toEqual(historyWindowYears(2027));
    // ほかの会社の窓は変わらない
    expect(ends.get("E00002")).toBe(2026);
  });

  it("右端は値のある最新の年で、途中の欠けや行の並びに左右されない", () => {
    const rows = [
      { edinetCode: "E00001", year: 2025 },
      { edinetCode: "E00001", year: 2019 },
      { edinetCode: "E00001", year: 2022 },
    ];
    expect(windowEnds(rows).get("E00001")).toBe(2025);
  });

  it("行は窓の添字に置き、窓より古い年と先の年は -1", () => {
    expect(indexInWindow(2027, 2018)).toBe(0);
    expect(indexInWindow(2027, 2027)).toBe(HISTORY_SPAN - 1);
    // 右端が進んだ会社の、窓から外れた年
    expect(indexInWindow(2027, 2017)).toBe(-1);
    expect(indexInWindow(2027, 2028)).toBe(-1);
  });

  it("業種の中央値の年は、全社の窓を覆う連続した年", () => {
    // 右端 2025・2026・2027 の会社が混ざる（2025年の会社の窓は2016年から）
    expect(coveringYears([2026, 2025, 2027])).toEqual(historyWindowYears(2027, 12));
    expect(coveringYears([2026])).toEqual(historyWindowYears(2026));
    expect(coveringYears([])).toEqual([]);
  });
});
