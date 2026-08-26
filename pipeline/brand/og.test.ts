import { describe, expect, it } from "vitest";
import {
  group,
  ogAlt,
  ogColumns,
  ogHeadline,
  ogOverflow,
  ogSvg,
  OG_HEIGHT,
  OG_WIDTH,
  type OgFacts,
} from "./og";
import { WORDMARK } from "./lettering";
import { OG_IMAGE } from "../../web/lib/brand/assets";
import { OG_FACTS } from "../../web/lib/brand/ogFacts";

/*
 * OG画像の版面（S2・Issue #116・`docs/site-chrome/spec.md` 4.3）。
 *
 * 見るのは**版面の性質**で、画素ではない。焼いた実物の寸法と透過は
 * `web/lib/brand/assets.test.ts` が、焼いた数字がいまのデータと合っているかは
 * `web/lib/brand/ogFacts.test.ts` が見る。
 */

const facts: OgFacts = { count: 2961, averageManYen: 693, fiscalPeriod: "2025年3月期〜2026年5月期" };

const svg = ogSvg(
  { brand: "#007595", text: "#090b0c", muted: "#67787c", rule: "#e3e7e8", background: "#ffffff" },
  facts
);

describe("ogSvg", () => {
  it("SNS が要求する寸法で、`assets.ts` の表と一致する（AC-13）", () => {
    expect([OG_WIDTH, OG_HEIGHT]).toEqual([OG_IMAGE.width, OG_IMAGE.height]);
    expect(svg).toContain(`width="${OG_WIDTH}" height="${OG_HEIGHT}"`);
  });

  it("地の色を敷く", () => {
    // 敷かないと、暗い背景に置く SNS で文字が読めなくなる。
    expect(svg).toContain(`<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#ffffff"/>`);
  });

  it("シンボルとワードマークが入っている", () => {
    // シンボルは `symbol.ts` の1か所から来る（形を書き写していない）。
    expect(svg).toContain('<circle cx="24" cy="24" r="16"');
    expect(svg).toContain(WORDMARK.path);
  });

  it("公開ホストを載せない", () => {
    // 貼られたカードにはURLが別枠で出るので、絵の中の1行は情報を足さないまま
    // 広告の体裁だけを持ち込む（運営者の指示）。
    expect(svg).not.toContain("openreport");
  });

  it("`<text>` を1つも使わない", () => {
    /*
      文字のまま書くと `sharp`（librsvg）が実行環境の fontconfig を引く。
      日本語フォントの入っていない機械で焼くと豆腐（□）が並んだ画像ができ、
      **寸法もバイト数も正しいので `assets.test.ts` では捕まらない。**
    */
    expect(svg).not.toContain("<text");
  });

  it("版面からはみ出さない", () => {
    expect(ogOverflow(facts)).toBeNull();
  });

  it("いま焼いてある値でもはみ出さない", () => {
    // 版面を触ったとき、手で書いた見本ではなく**実際に載っている値**で確かめる。
    expect(ogOverflow(OG_FACTS)).toBeNull();
  });

  it("対象期間が伸びると検算が捕まえる", () => {
    // データで文字列が変わる版面なので、はみ出しの検算が効いていること自体を見る。
    const long = `${facts.fiscalPeriod}${facts.fiscalPeriod}`;
    expect(ogOverflow({ ...facts, fiscalPeriod: long })).toContain("はみ出している");
  });
});

describe("書いてある文字", () => {
  it("見出しは固定文＋社数の2行（spec 4.3）", () => {
    expect(ogHeadline(facts)).toEqual(["有価証券報告書の数値のまま、", "2,961社の平均年収。"]);
  });

  it("数値の帯は 対象社数・全体平均・対象期間と出典 の3区画", () => {
    expect(ogColumns(facts)).toEqual([
      { label: "対象社数", lines: ["2,961社"] },
      { label: "全体平均", lines: ["693万円"] },
      { label: "対象期間・出典", lines: ["2025年3月期〜2026年5月期", "金融庁 EDINET"] },
    ]);
  });

  it("3桁ごとの区切りは自前で入れる", () => {
    // `toLocaleString` を使わない——焼く機械のロケールで `2961` のままになりうる。
    expect([group(2961), group(693), group(1234567)]).toEqual(["2,961", "693", "1,234,567"]);
  });

  it("代替テキストが絵の中の文字と一致する", () => {
    // 絵を組み替えたら `assets.ts` の `alt` も変わる、を型ではなくここで担保する。
    const alt = ogAlt(facts);
    expect(alt).toContain(WORDMARK.text);
    for (const line of ogHeadline(facts)) expect(alt).toContain(line);
    for (const { label, lines } of ogColumns(facts)) {
      expect(alt).toContain(label);
      for (const line of lines) expect(alt).toContain(line);
    }
  });

  it("`OG_IMAGE.alt` は焼いた値から組んだ1文になっている", () => {
    expect(OG_IMAGE.alt).toBe(ogAlt(OG_FACTS));
  });
});
