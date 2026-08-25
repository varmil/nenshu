import { describe, it, expect } from "vitest";
import { buildLogoMask, logoIdSet } from "./mask";
import { initialOf } from "./initial";
import type { CompanyRow } from "@/features/ranking/types";

const row = (id: string, name = "テスト"): CompanyRow => [id, name, 0, 0, 40, 10, 5_000_000, 100, 0, 0];

describe("ロゴの有無を配るマスク", () => {
  const rows = [row("6861"), row("8058"), row("E01234")];

  it("行の並びのまま 1/0 を並べる", () => {
    expect(buildLogoMask(rows, { "6861": {}, E01234: {} })).toBe("101");
  });

  it("1社もロゴが無ければ全部 0", () => {
    expect(buildLogoMask(rows, {})).toBe("000");
  });

  it("マスクを id の集合に開く", () => {
    const ids = logoIdSet(rows, "101");
    expect([...ids].sort()).toEqual(["6861", "E01234"]);
  });

  it("開いた集合は元のマスクと往復する", () => {
    const byId = { "8058": {} };
    const mask = buildLogoMask(rows, byId);
    expect(logoIdSet(rows, mask)).toEqual(new Set(["8058"]));
  });

  it("**行1つにつき1文字。** ここがずれると別の会社のロゴを出す", () => {
    expect(buildLogoMask(rows, { "6861": {} })).toHaveLength(rows.length);
  });

  it("マスクが短ければ足りない行はロゴ無しとして扱う（壊れた入力で例外にしない）", () => {
    expect(logoIdSet(rows, "1")).toEqual(new Set(["6861"]));
  });
});

describe("頭文字", () => {
  it("法人格を落としてから1文字目を採る", () => {
    expect(initialOf("株式会社キーエンス")).toBe("キ");
    expect(initialOf("三菱商事株式会社")).toBe("三");
    expect(initialOf("（株）テスト")).toBe("テ");
    expect(initialOf("㈱テスト")).toBe("テ");
    expect(initialOf("合同会社ほげ")).toBe("ほ");
  });

  it("法人格しか無い名前でも空にしない", () => {
    expect(initialOf("株式会社")).toBe("株");
  });
});
