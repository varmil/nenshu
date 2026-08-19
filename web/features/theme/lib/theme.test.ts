import { describe, expect, it } from "vitest";
import { parseStoredTheme, resolveTheme, toggleTheme, type Theme } from "./theme";
import { buildThemeScript } from "./themeScript";

/*
 * 表示モードの判定（Issue #68、`docs/site-chrome/spec.md` 3）。
 *
 * DOM 操作（applyTheme・readAppliedTheme・syncSystemTheme）はここでは扱わない。
 * 実際にブラウザで class が付くかは E2E（`e2e/theme.spec.ts`）の担当で、
 * ここは「保存値と OS 設定から何を選ぶか」だけを固定する。
 */

describe("parseStoredTheme", () => {
  it.each([
    ["light", "light"],
    ["dark", "dark"],
  ])("保存値 %s はそのまま読む", (raw, expected) => {
    expect(parseStoredTheme(raw)).toBe(expected);
  });

  it.each([
    ["保存が無い", null],
    ["空文字", ""],
    ["想定外の値", "system"],
    ["大文字", "Dark"],
    ["前後に空白", " dark "],
  ])("%s のときは null（OS の設定に委ねる）", (_label, raw) => {
    // 他のアプリが同じキーを使った場合や手で書き換えられた場合に、
    // 壊れた値でモードを決めてしまわないこと。
    expect(parseStoredTheme(raw)).toBeNull();
  });
});

describe("resolveTheme", () => {
  it.each([
    ["未選択 × OSライト", null, false, "light"],
    ["未選択 × OSダーク", null, true, "dark"],
    ["light選択 × OSライト", "light", false, "light"],
    ["light選択 × OSダーク", "light", true, "light"],
    ["dark選択 × OSライト", "dark", false, "dark"],
    ["dark選択 × OSダーク", "dark", true, "dark"],
  ] as const)("%s → %s", (_label, stored, prefersDark, expected) => {
    expect(resolveTheme(stored as Theme | null, prefersDark)).toBe(expected);
  });

  it("読者が選んだ値は OS の設定に上書きされない", () => {
    // spec.md 3.1「一度切り替えたら、その選択を維持する」の核心。
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("toggleTheme", () => {
  it("押すたびに反転する", () => {
    expect(toggleTheme("light")).toBe("dark");
    expect(toggleTheme("dark")).toBe("light");
  });

  it("2回押すと元に戻る", () => {
    expect(toggleTheme(toggleTheme("light"))).toBe("light");
  });
});

describe("buildThemeScript", () => {
  const script = buildThemeScript();

  it("localStorage と prefers-color-scheme の両方を見る", () => {
    expect(script).toContain("localStorage");
    expect(script).toContain("prefers-color-scheme: dark");
  });

  it("try/catch で囲まれている", () => {
    // localStorage が使えない環境（プライベートモード等）でページを壊さないため。
    expect(script).toContain("try{");
    expect(script).toContain("catch");
  });

  it("即時実行される（定義だけで終わらない）", () => {
    // <body> の先頭でパーサを止めて走りきる必要があるので、関数定義では足りない。
    expect(script.trimEnd()).toMatch(/\}\)\(\);?$/);
  });

  it("HTMLを壊す文字列を素で埋め込まない", () => {
    // 値は JSON.stringify を通しているので、</script> で閉じられることはない。
    expect(script).not.toContain("</script");
  });
});
