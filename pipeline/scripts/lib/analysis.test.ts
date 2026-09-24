import { describe, it, expect } from "vitest";
import { dropRepeatedHeadline, generatedMonth, parseSources, toAnalysisRecord } from "./analysis";

describe("dropRepeatedHeadline", () => {
  it("本文が一言と同じ文で始まっていれば1文目を落とす", () => {
    expect(
      dropRepeatedHeadline("通行台数も収入も伸びたのに、営業利益は9割近く消えた。", "通行台数も収入も伸びたのに、営業利益は9割近く消えた一年である。料金収入は伸びた。")
    ).toBe("料金収入は伸びた。");
  });

  it("かぎ括弧の種類が違っても同じ文とみなす（8001）", () => {
    expect(
      dropRepeatedHeadline("『川下』で稼ぐ路線を貫いている。", "「川下」で稼ぐ路線を貫いている。中国の事業が伸びた。")
    ).toBe("中国の事業が伸びた。");
  });

  it("書き出しが違えば本文をそのまま返す", () => {
    const body = "当期の売上高は海外が伸びた。会社も海外を課題に掲げている。";
    expect(dropRepeatedHeadline("成長の重心は海外にある会社である。", body)).toBe(body);
  });

  it("本文が1文だけなら空にしない", () => {
    expect(dropRepeatedHeadline("伸びている会社だ。", "伸びている会社だ。")).toBe("伸びている会社だ。");
  });
});

describe("parseSources", () => {
  it("url・title・accessed を読む", () => {
    expect(
      parseSources('[{"url": "https://www.mitsui.com/jp/ja/release/a.html", "title": " お知らせ ", "accessed": "2026-09-08"}]', "8031")
    ).toEqual([{ url: "https://www.mitsui.com/jp/ja/release/a.html", title: "お知らせ", accessed: "2026-09-08" }]);
  });

  it("空は資料なし", () => {
    expect(parseSources("[]", "6861")).toEqual([]);
    expect(parseSources("", "6861")).toEqual([]);
  });

  it("形が崩れていたら落とす", () => {
    expect(() => parseSources('[{"url": "javascript:alert(1)", "title": "x", "accessed": "2026-09-08"}]', "x")).toThrow();
    expect(() => parseSources('[{"url": "https://a.jp/", "title": "", "accessed": "2026-09-08"}]', "x")).toThrow();
    expect(() => parseSources('[{"url": "https://a.jp/", "title": "x", "accessed": "9月8日"}]', "x")).toThrow();
    expect(() => parseSources('{"url": "https://a.jp/"}', "x")).toThrow();
  });
});

describe("toAnalysisRecord（AC-28）", () => {
  const line = {
    digest: "要約。",
    headline: "一言。",
    body: "本文。",
    sources: "[]",
    generatedAt: "2026-09-08T06:47:16+00:00",
  };

  it("要約と分析がそろっていれば記録を作る", () => {
    expect(toAnalysisRecord(line, "x")).toEqual({
      digest: "要約。",
      headline: "一言。",
      body: "本文。",
      sources: [],
      generatedAt: "2026-09",
    });
  });

  it("どちらかが空なら対で落とす", () => {
    expect(toAnalysisRecord({ ...line, digest: "" }, "x")).toBeNull();
    expect(toAnalysisRecord({ ...line, headline: " " }, "x")).toBeNull();
    expect(toAnalysisRecord({ ...line, body: "" }, "x")).toBeNull();
  });
});

describe("generatedMonth", () => {
  it("日本時間の年月にする", () => {
    expect(generatedMonth("2026-09-08T06:47:16+00:00", "x")).toBe("2026-09");
  });

  it("UTC の月末の夜は日本時間では翌月になる", () => {
    expect(generatedMonth("2026-08-31T20:00:00+00:00", "x")).toBe("2026-09");
    expect(generatedMonth("2026-12-31T15:00:00+00:00", "x")).toBe("2027-01");
  });

  it("日時でなければ落とす", () => {
    expect(() => generatedMonth("", "x")).toThrow();
    expect(() => generatedMonth("2026-09", "x")).toThrow();
    expect(() => generatedMonth("9月8日", "x")).toThrow();
  });
});
