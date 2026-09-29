import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  addMonths,
  checkStageDocs,
  companyIdOf,
  isLapsed,
  LEDGER_COLUMNS,
  parseLedgerCsv,
  readLedger,
  selectUniverse,
} from "./ledger";

/**
 * 更新台帳を読む側（refresh の D2・#872）。**合成データで見る。** 書く側の規則（ID の振り方・
 * 入る条件）は `pipeline/ledger/test_ledger.py`。
 */

const HEADER = LEDGER_COLUMNS.join(",");

const csv = (...lines: string[]) => [HEADER, ...lines].join("\n") + "\n";

describe("parseLedgerCsv", () => {
  it("EDINETコードを鍵に、工程ごとの書類を読む（空は空のまま）", () => {
    const ledger = parseLedgerCsv(
      csv(
        "E01967,6861,2026-06-12,S100AAAA,S100AAAA,S100AAAA,",
        "E03532,E03532,2026-06-20,S100BBBB,,,"
      )
    );
    expect(ledger.get("E01967")).toEqual({
      edinetCode: "E01967",
      id: "6861",
      filed: "2026-06-12",
      docs: { numbers: "S100AAAA", description: "S100AAAA", analysis: "S100AAAA", payPolicy: "" },
    });
    expect(ledger.get("E03532")?.id).toBe("E03532");
  });

  it("同じ ID が2社にあったら落とす（ADR-0017）", () => {
    expect(() =>
      parseLedgerCsv(csv("E00001,1234,2026-06-12,S1,,,", "E00002,1234,2026-06-12,S2,,,"))
    ).toThrow(/2社に振られています/);
  });

  it("同じ会社が2行あったら落とす", () => {
    expect(() =>
      parseLedgerCsv(csv("E00001,1234,2026-06-12,S1,,,", "E00001,5678,2026-06-12,S2,,,"))
    ).toThrow(/2行あります/);
  });

  it("見出しが違えば落とす", () => {
    expect(() => parseLedgerCsv("edinet_code,id\nE00001,1234\n")).toThrow(/見出し/);
  });

  it("提出日の形が違えば落とす", () => {
    expect(() => parseLedgerCsv(csv("E00001,1234,2026/06/12,S1,,,"))).toThrow(/行の形/);
  });
});

describe("addMonths", () => {
  it.each([
    ["2026-08-25", -12, "2025-08-25"],
    ["2025-08-26", 24, "2027-08-26"],
    ["2026-03-31", -1, "2026-02-28"],
    ["2028-03-31", -1, "2028-02-29"],
    ["2024-02-29", 24, "2026-02-28"],
    ["2025-11-30", 3, "2026-02-28"],
  ])("%s の %i か月後は %s（月末は丸める）", (from, n, to) => {
    expect(addMonths(from, n)).toBe(to);
  });
});

/*
 * AC-7（母集団の側）。前の有報から12か月を過ぎても24か月に満たない会社は残り、
 * 24か月を過ぎた会社は外れる。
 */
describe("isLapsed", () => {
  const filed = "2025-06-26";
  it.each([
    ["12か月と1日たっても残る", "2026-06-27", false],
    ["23か月たっても残る", "2027-05-26", false],
    ["24か月の前日まで残る", "2027-06-25", false],
    ["ちょうど24か月で外れる", "2027-06-26", true],
    ["24か月を過ぎたら外れる", "2028-01-01", true],
  ])("%s", (_, asOf, lapsed) => {
    expect(isLapsed(filed, asOf)).toBe(lapsed);
  });

  it("2月29日に出した会社は、24か月後の2月28日に外れる", () => {
    expect(isLapsed("2024-02-29", "2026-02-27")).toBe(false);
    expect(isLapsed("2024-02-29", "2026-02-28")).toBe(true);
  });
});

describe("selectUniverse", () => {
  const ledger = parseLedgerCsv(
    csv(
      "E00001,1111,2026-06-25,S1,,,", // 直近の提出
      "E00002,2222,2025-06-25,S2,,,", // 12か月を過ぎて24か月に満たない
      "E00003,E00003,2024-06-25,S3,,," // 24か月を過ぎた
    )
  );
  const row = (edinetCode: string) => ({ edinetCode, name: `会社${edinetCode}` });
  const asOf = "2026-08-25";

  it("24か月に満たない会社は最後の有報の数字で残り、過ぎた会社は外れる", () => {
    const { rows, ids, lapsed } = selectUniverse(
      [row("E00001"), row("E00002"), row("E00003")],
      ledger,
      asOf
    );
    expect(rows.map((r) => r.edinetCode)).toEqual(["E00001", "E00002"]);
    expect(ids).toEqual(["1111", "2222"]);
    expect(lapsed.map((r) => r.edinetCode)).toEqual(["E00003"]);
  });

  it("台帳に無い会社が行にあれば落とす（ID を振るのは台帳を書く側）", () => {
    expect(() =>
      selectUniverse([row("E00001"), row("E00002"), row("E00003"), row("E00009")], ledger, asOf)
    ).toThrow(/更新台帳/);
  });

  it("台帳の会社が行に無ければ落とす（一度載った会社を黙って消さない）", () => {
    expect(() => selectUniverse([row("E00001"), row("E00003")], ledger, asOf)).toThrow(
      /1社が ranking_unified.csv にありません/
    );
  });
});

describe("checkStageDocs", () => {
  const ledger = parseLedgerCsv(
    csv("E00001,1111,2026-06-25,S1,S0,S0,", "E00002,2222,2026-06-25,S2,,,")
  );

  it("工程の中で台帳と成果物が一致すれば通る（工程どうしのずれは通す）", () => {
    expect(() => checkStageDocs(ledger, "description", new Map([["E00001", "S0"]]))).not.toThrow();
  });

  it("台帳と成果物の書類が違えば落とす", () => {
    expect(() => checkStageDocs(ledger, "description", new Map([["E00001", "S1"]]))).toThrow(
      /E00001 の description/
    );
  });

  it("成果物に行が無いのに台帳が書類を持っていたら落とす", () => {
    expect(() => checkStageDocs(ledger, "analysis", new Map())).toThrow(/E00001 の analysis/);
  });

  it("台帳に無い会社が成果物にあれば落とす", () => {
    expect(() => checkStageDocs(ledger, "payPolicy", new Map([["E00009", "S9"]]))).toThrow(
      /更新台帳にありません/
    );
  });
});

describe("companyIdOf", () => {
  it("台帳の ID を返し、無ければ社名を添えて落とす", () => {
    const ledger = parseLedgerCsv(csv("E00001,1111,2026-06-25,S1,,,"));
    expect(companyIdOf(ledger, { edinetCode: "E00001", name: "架空" })).toBe("1111");
    expect(() => companyIdOf(ledger, { edinetCode: "E00002", name: "架空株式会社" })).toThrow(
      /架空株式会社/
    );
  });
});

/*
 * git に置いてある台帳そのもの。社数・ID の値は書き写さず、Python 側と同じ見出しで読めることと、
 * 数字の行（`ranking_unified.csv`）と1社ずつ対応していることだけを見る。
 */
describe("pipeline/data/ledger.csv", () => {
  it("読めて、ranking_unified.csv と同じ会社を持つ", () => {
    const ledger = readLedger();
    const unified = readFileSync(join(__dirname, "../../data/ranking_unified.csv"), "utf-8");
    const [header, ...lines] = unified.replace(/^﻿/, "").trim().split("\n");
    const code = header.split(",").indexOf("edinet_code");
    const codes = lines.map((line) => line.split(",")[code]);
    expect(new Set(codes)).toEqual(new Set(ledger.keys()));
  });
});

// D1: CI が赤くなることを確かめるための、わざと落とすテスト（すぐ戻す）
describe("CI の確認", () => {
  it("わざと落とす", () => {
    expect(1).toBe(2);
  });
});
