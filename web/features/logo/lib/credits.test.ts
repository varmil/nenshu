import { describe, it, expect } from "vitest";
import { attributionCredits, creditCounts, type LogoEntry } from "./credits";
import type { CompanyRow } from "@/features/ranking/types";

const row = (id: string, name: string): CompanyRow => [id, name, 0, 0, 40, 10, 5_000_000, 100, 0];

const rows = [row("1", "あ株式会社"), row("2", "い株式会社"), row("3", "う株式会社")];

const entry = (over: Partial<LogoEntry>): LogoEntry => ({
  w: 100,
  h: 40,
  src: "commons",
  from: "https://commons.wikimedia.org/wiki/File:X.svg",
  ...over,
});

describe("ロゴの帰属表示", () => {
  const byId: Record<string, LogoEntry> = {
    "1": entry({ lic: "CC BY-SA 4.0", by: " 作者A ", attr: true }),
    "2": entry({ lic: "Public domain", by: "作者B", attr: false }),
    "3": entry({ src: "header", from: "https://example.co.jp/logo.svg" }),
  };

  it("帰属が要るものだけを出す", () => {
    const credits = attributionCredits(rows, byId);
    expect(credits).toHaveLength(1);
    expect(credits[0]).toEqual({
      id: "1",
      name: "あ株式会社",
      license: "CC BY-SA 4.0",
      author: "作者A",
      from: "https://commons.wikimedia.org/wiki/File:X.svg",
    });
  });

  it("パブリックドメインは並べない（本当に帰属が要るものが埋もれる）", () => {
    expect(attributionCredits(rows, byId).map((c) => c.id)).not.toContain("2");
  });

  it("公式サイト由来は帰属表示の対象にしない", () => {
    expect(attributionCredits(rows, byId).map((c) => c.id)).not.toContain("3");
  });

  it("社名で並べる", () => {
    const many: Record<string, LogoEntry> = {
      "2": entry({ lic: "CC BY 2.5", attr: true }),
      "1": entry({ lic: "CC BY-SA 4.0", attr: true }),
    };
    expect(attributionCredits(rows, many).map((c) => c.name)).toEqual(["あ株式会社", "い株式会社"]);
  });

  it("出典ごとの件数を数える", () => {
    expect(creditCounts(byId)).toEqual({ commons: 2, site: 1, total: 3 });
  });
});
