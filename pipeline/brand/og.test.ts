import { describe, expect, it } from "vitest";
import { ogOverflow, ogSvg, OG_HEIGHT, OG_WIDTH } from "./og";
import { TAGLINE_1, TAGLINE_2, WORDMARK } from "./lettering";
import { OG_IMAGE } from "../../web/lib/brand/assets";

/*
 * OG画像の版面（S2・Issue #116・`docs/site-chrome/spec.md` 4.3）。
 *
 * 見るのは**版面の性質**で、画素ではない。焼いた実物の寸法と透過は
 * `web/lib/brand/assets.test.ts` が見る。
 */

const svg = ogSvg({ brand: "#007595", text: "#090b0c", background: "#ffffff" });

describe("ogSvg", () => {
  it("SNS が要求する寸法で、`assets.ts` の表と一致する（AC-13）", () => {
    expect([OG_WIDTH, OG_HEIGHT]).toEqual([OG_IMAGE.width, OG_IMAGE.height]);
    expect(svg).toContain(`width="${OG_WIDTH}" height="${OG_HEIGHT}"`);
  });

  it("地の色を敷く", () => {
    // 敷かないと、暗い背景に置く SNS で文字が読めなくなる。
    expect(svg).toContain(`<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#ffffff"/>`);
  });

  it("シンボルとワードマークと説明文が入っている", () => {
    // シンボルは `symbol.ts` の1か所から来る（形を書き写していない）。
    expect(svg).toContain('<circle cx="24" cy="24" r="16"');
    for (const lettering of [WORDMARK, TAGLINE_1, TAGLINE_2]) {
      expect(svg).toContain(lettering.path);
    }
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
    expect(ogOverflow()).toBeNull();
  });
});

describe("書いてある文字", () => {
  it("ブランドと説明文が読める（spec 4.3）", () => {
    expect(WORDMARK.text).toBe("OpenReport");
    expect(`${TAGLINE_1.text}${TAGLINE_2.text}`).toBe("有価証券報告書ベースの平均年収ランキング");
  });

  it("代替テキストが絵の中の文字と一致する", () => {
    // 絵を組み替えたら `assets.ts` の `alt` も直す、を型ではなくここで担保する。
    expect(OG_IMAGE.alt).toContain(WORDMARK.text);
    expect(OG_IMAGE.alt).toContain(`${TAGLINE_1.text}${TAGLINE_2.text}`);
  });

  it("数字を1つも載せない", () => {
    // 社数も金額も載せない。載せると年1回のデータ更新のたびに焼き直しが要り、
    // 更新を忘れた1枚が SNS のキャッシュに残る。
    const text = [WORDMARK, TAGLINE_1, TAGLINE_2].map((l) => l.text).join("");
    expect(text).not.toMatch(/[0-9０-９]/);
  });
});
