import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_HEADER,
  COL,
  assertHeader,
  HeaderMismatchError,
  normalizeRow,
  hasAnyMetric,
  toNumber,
  dropReasonForRate,
  isMisenteredFullRate,
} from "./positivedb";
import { parseCsv } from "./csv";
import { WORKLIFE_HEADER } from "./extract";

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), "../data/worklife_2026.csv");

/** 236列の空行に、見出し番号（1始まり）で値を差す。 */
function row(values: Record<number, string>): string[] {
  const r = new Array<string>(EXPECTED_HEADER.length).fill("");
  for (const [heading, v] of Object.entries(values)) r[Number(heading) - 1] = v;
  return r;
}

describe("assertHeader", () => {
  it("想定どおりの見出しは通す", () => {
    expect(() => assertHeader([...EXPECTED_HEADER])).not.toThrow();
  });

  // 見出しには重複がある（`-女性(%)` が5回など）ので、列は名前ではなく位置で引く。
  // 位置で引く以上、1列でもずれたら止めないと別の指標を読むことになる。
  it("列が1つでも違えば止まる（別の指標を残業時間として出さないため）", () => {
    const h = [...EXPECTED_HEADER];
    h[COL.overtimeAll] = "6.一月当たりの労働者の平均残業時間-平均残業時間(分)";
    expect(() => assertHeader(h)).toThrow(HeaderMismatchError);
    expect(() => assertHeader(h)).toThrow(/129列目/);
  });

  it("列が増えても減っても止まる", () => {
    expect(() => assertHeader([...EXPECTED_HEADER, "新しい列"])).toThrow(HeaderMismatchError);
    expect(() => assertHeader(EXPECTED_HEADER.slice(0, -1))).toThrow(HeaderMismatchError);
  });
});

describe("toNumber", () => {
  it("欠測と 0 を区別する", () => {
    expect(toNumber("0")).toBe(0);
    expect(toNumber("")).toBeNull();
    expect(toNumber("   ")).toBeNull();
    expect(toNumber("-")).toBeNull();
    expect(toNumber("非公表")).toBeNull();
  });

  it("小数と負数を読む", () => {
    expect(toNumber("20.3")).toBe(20.3);
    expect(toNumber("-16.8")).toBe(-16.8);
  });
});

describe("normalizeRow", () => {
  it("負の残業時間は落とし、落としたことを報告する", () => {
    const { record, dropped } = normalizeRow(row({ 2: "9010001101119", 1: "テスト株式会社", 129: "-16.8" }));
    expect(record.overtimeAll).toBeNull();
    expect(dropped).toEqual([
      {
        corporateNumber: "9010001101119",
        name: "テスト株式会社",
        field: "overtime_all",
        raw: "-16.8",
        reason: "負の値",
      },
    ]);
  });

  it("残業 0 時間・有給取得率 0% は全体値も区分別も落とす（W2・#185 例2）", () => {
    const { record, dropped } = normalizeRow(
      row({ 129: "0", 132: "総合職", 133: "0", 134: "事務職", 135: "0", 145: "全従業員", 146: "0" })
    );
    expect(record.overtimeAll).toBeNull();
    // **区分の行そのものは残す**——その会社が何を切っているかは情報（spec 2.2b）。
    expect(record.overtimeUnits).toEqual([
      { unit: "総合職", value: null },
      { unit: "事務職", value: null },
    ]);
    expect(record.paidLeaveUnits).toEqual([{ unit: "全従業員", value: null }]);
    expect(dropped.map((d) => d.field)).toEqual([
      "overtime_unit:総合職",
      "overtime_unit:事務職",
      "overtime_all",
      "paid_leave_unit:全従業員",
    ]);
    expect(new Set(dropped.map((d) => d.reason))).toEqual(new Set(["0"]));
  });

  it("100%ちょうどの全体値は、区分別がすべてそれ未満なら落とす（W2・#185 例1）", () => {
    const { record, dropped } = normalizeRow(row({ 143: "100", 145: "全体", 146: "63.7" }));
    expect(record.paidLeaveAll).toBeNull();
    expect(record.paidLeaveUnits).toEqual([{ unit: "全体", value: 63.7 }]);
    expect(dropped).toEqual([
      {
        corporateNumber: "",
        name: "",
        field: "paid_leave_all",
        raw: "100",
        reason: "全体値が100%ちょうど",
      },
    ]);
  });

  it("極端な賃金の差異も落とさない（少人数区分の外れ値だが値としては正しい）", () => {
    const { record } = normalizeRow(row({ 206: "43.2", 207: "638.6", 208: "-" }));
    expect(record.wageGapAll).toBe(43.2);
    expect(record.wageGapRegular).toBe(638.6);
    expect(record.wageGapNonRegular).toBeNull();
  });

  it("残業は全体と区分別の両方を読み、区分を畳まない（片方だけだと4割落とす・正社員と派遣を平均しない）", () => {
    const both = normalizeRow(
      row({ 128: "その他", 129: "10.5", 132: "総合職", 133: "14.1", 134: "一般職", 135: "3.3" })
    ).record;
    expect(both.overtimeAll).toBe(10.5);
    expect(both.overtimeScope).toBe("その他");
    expect(both.overtimeUnits).toEqual([
      { unit: "総合職", value: 14.1 },
      { unit: "一般職", value: 3.3 },
    ]);

    const unitOnly = normalizeRow(row({ 145: "正社員", 146: "38.8" })).record;
    expect(unitOnly.paidLeaveAll).toBeNull();
    expect(unitOnly.paidLeaveUnits).toEqual([{ unit: "正社員", value: 38.8 }]);
  });

  it("時点と注釈をそのまま持つ", () => {
    const { record } = normalizeRow(
      row({ 219: "計算の前提\r\n・労働者", 220: "2025年4月1日～2026年3月31日", 223: "2026年3月時点", 236: "2026年06月26日" })
    );
    expect(record.wageGapNote).toBe("計算の前提\r\n・労働者");
    expect(record.wageGapPeriod).toBe("2025年4月1日～2026年3月31日");
    expect(record.asOf).toBe("2026年3月時点");
    expect(record.updatedAt).toBe("2026年06月26日");
  });
});

describe("dropReasonForRate / isMisenteredFullRate", () => {
  // 100 を超える有給取得率は前年繰越の消化で、値として正しい。
  it("負と 0 だけを落とす", () => {
    expect(dropReasonForRate(-16.8)).toBe("負の値");
    expect(dropReasonForRate(0)).toBe("0");
    expect(dropReasonForRate(0.1)).toBeNull();
    expect(dropReasonForRate(103)).toBeNull();
  });

  it("100 ちょうど、かつ区分別がすべて 100 未満のときだけ入力ミスとみなす", () => {
    expect(isMisenteredFullRate(100, [{ unit: "全体", value: 63.7 }])).toBe(true);
    // 区分別が無い（値が無い）会社・100 以上の区分がある会社は、100 が本物でありうる。
    expect(isMisenteredFullRate(100, [])).toBe(false);
    expect(isMisenteredFullRate(100, [{ unit: "正社員", value: null }])).toBe(false);
    expect(isMisenteredFullRate(100, [{ unit: "正社員", value: 103 }])).toBe(false);
    // **100 ちょうど以外は判定しない。** 98.8 / 34.5 は怪しいが、どちらが正しいか決める根拠が無い。
    expect(isMisenteredFullRate(98.8, [{ unit: "正社員・契約社員", value: 34.5 }])).toBe(false);
  });
});

describe("hasAnyMetric", () => {
  it("3指標が1つも無ければ行を作らない", () => {
    expect(hasAnyMetric(normalizeRow(row({ 223: "2026年3月時点" })).record)).toBe(false);
  });

  it("区分別だけでも持っていれば行を作る", () => {
    expect(hasAnyMetric(normalizeRow(row({ 146: "38.8" })).record)).toBe(true);
  });

  it("残業0時間しか持たない会社は「持っていない」（W2 で 0 を落としたため）", () => {
    expect(hasAnyMetric(normalizeRow(row({ 129: "0" })).record)).toBe(false);
  });
});

/*
 * 取り込み済みの実データ。**個々の会社の値（トヨタ・三菱商事・キーエンス・ソニーグループ・
 * 野村総合研究所）は、この CSV から作って実際に配る `worklife.json` を web の読み手で読む
 * `web/lib/data/worklife.test.ts` が固定している。** ここは CSV 全体に効く性質だけを見る。
 */
describe("worklife_2026.csv（取り込み済みの実データ）", () => {
  const rows = parseCsv(readFileSync(DATA, "utf-8"));
  const header = rows[0];
  const body = rows.slice(1);
  const col = (name: string) => header.indexOf(name);

  it("見出しが extract.ts の想定と一致する", () => {
    expect(header).toEqual([...WORKLIFE_HEADER]);
  });

  it("法人番号で突合できた会社のうち、3指標のいずれかを持つ2,367社が入っている", () => {
    // W2（#185）で 0 を落とした結果、残業 0 しか持たなかった2社が行ごと消えた。
    expect(body).toHaveLength(2367);
  });

  it("すべての行が13桁の法人番号を持つ", () => {
    const bad = body.filter((r) => !/^\d{13}$/.test(r[col("corporate_number")]));
    expect(bad).toEqual([]);
  });

  it("id が重複しない", () => {
    const ids = body.map((r) => r[col("id")]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("0 以下の残業時間・有給取得率が1件も残っていない（W2・#185）", () => {
    const cells = (prefix: string, suffix: string, allColumn: string) =>
      body.flatMap((r) =>
        [col(allColumn), ...[1, 2, 3, 4, 5].map((n) => col(`${prefix}${n}${suffix}`))]
          .map((i) => r[i])
          .filter((v) => v !== "" && Number(v) <= 0)
      );
    expect(cells("overtime_unit", "_hours", "overtime_all")).toEqual([]);
    expect(cells("paid_leave_unit", "_rate", "paid_leave_all")).toEqual([]);
  });

  it("100%を超える有給取得率は残っている（前年繰越の消化。丸めていない）", () => {
    const cols = [col("paid_leave_all"), ...[1, 2, 3, 4, 5].map((n) => col(`paid_leave_unit${n}_rate`))];
    const over = body.filter((r) => cols.some((i) => r[i] !== "" && Number(r[i]) > 100));
    expect(over.length).toBeGreaterThan(0);
  });

  it("持株会社は突合できないので行が無い（子会社で代用しない。ADR-0009）", () => {
    for (const id of ["8306", "9843", "2810"]) {
      expect(body.find((x) => x[col("id")] === id)).toBeUndefined();
    }
  });
});
