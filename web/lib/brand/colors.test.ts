import { describe, expect, it } from "vitest";
import { oklchToHex } from "@/design-system/tokens/oklch";
import { readTokenBlock } from "@/design-system/tokens/readTokens";
import { BRAND_COLOR, BRAND_COLOR_DARK, BRAND_ICON_BACKGROUND } from "./colors";

/*
 * ブランド色がトークンから離れないことを固定する（S4・Issue #163・AC-26）。
 *
 * ファビコンやアプリアイコンは CSS 変数を読めないので `colors.ts` が hex を持つ。
 * その代わり、**トークンを差し替えたらここが落ちる**ようにしておく——落ちなければ、
 * 配色を変えた次のデプロイでタブのアイコンだけ前の色のまま残る。
 */

const root = readTokenBlock(":root");
const dark = readTokenBlock(".dark");

describe("ブランド色", () => {
  it.each([
    ["明るい面", BRAND_COLOR, root.primary],
    ["濃色サーフェス", BRAND_COLOR_DARK, dark.primary],
    ["アイコンの地", BRAND_ICON_BACKGROUND, root.background],
  ])("%s の hex は tokens.css の値と一致する", (_label, hex, token) => {
    expect(hex).toBe(oklchToHex(token));
  });

  it("明るい面と濃色サーフェスで別の色になっている", () => {
    // 同じ値だと、どちらかのモードで背景に沈む（ダークの --primary を
    // 分けた経緯は `docs/site-chrome/site-header-theme/design.md`）。
    expect(BRAND_COLOR).not.toBe(BRAND_COLOR_DARK);
  });
});
