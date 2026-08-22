import { describe, it, expect } from "vitest";
import { parseCsv, toCsv, escapeCell, stripBom } from "./csv";

describe("parseCsv", () => {
  it("引用符の中の改行で行を切らない", () => {
    const rows = parseCsv('a,"1行目\n2行目",c\nd,e,f\n');
    expect(rows).toEqual([
      ["a", "1行目\n2行目", "c"],
      ["d", "e", "f"],
    ]);
  });

  it("引用符の中のカンマと二重引用符を復元する", () => {
    expect(parseCsv('"a,b","彼は""はい""と言った"\n')).toEqual([["a,b", '彼は"はい"と言った']]);
  });

  it("CRLF を1つの区切りとして扱う", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("末尾に改行が無い最終行を落とさない", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("空のセルを保つ（欠測と 0 を混ぜないため）", () => {
    expect(parseCsv("a,,c\n")).toEqual([["a", "", "c"]]);
  });

  it("BOM を落とす", () => {
    expect(stripBom("﻿a")).toBe("a");
    expect(parseCsv("﻿企業名,法人番号\n")).toEqual([["企業名", "法人番号"]]);
  });
});

describe("toCsv", () => {
  it("必要なときだけ引用する", () => {
    expect(escapeCell("a")).toBe("a");
    expect(escapeCell("a,b")).toBe('"a,b"');
    expect(escapeCell("a\nb")).toBe('"a\nb"');
    expect(escapeCell('a"b')).toBe('"a""b"');
  });

  it("書いたものを読み直すと元に戻る（引用符の中の CRLF はそのまま残す）", () => {
    const rows = [
      ["id", "note"],
      ["6861", "1行目\r\n2行目, カンマと\"引用符\""],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
