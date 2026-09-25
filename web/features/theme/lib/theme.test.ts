import { describe, expect, it } from "vitest";
import {
  DARK_CLASS,
  THEME_STORAGE_KEY,
  parseStoredTheme,
  resolveTheme,
  toggleTheme,
  type Theme,
} from "./theme";
import { buildThemeScript } from "./themeScript";

/*
 * 表示モードの判定（Issue #68、`docs/site-chrome/spec.md` 3）。
 *
 * DOM 操作（applyTheme・readAppliedTheme・syncSystemTheme）はここでは扱わない。
 * 実際にブラウザで class が付くかは E2E（`e2e/theme.spec.ts`）の担当で、
 * ここは「保存値と OS 設定から何を選ぶか」だけを固定する。
 */

describe("parseStoredTheme", () => {
  it("保存値 light・dark はそのまま読む", () => {
    expect(parseStoredTheme("light")).toBe("light");
    expect(parseStoredTheme("dark")).toBe("dark");
  });

  it("保存が無い・壊れた値のときは null（OS の設定に委ねる）", () => {
    // 他のアプリが同じキーを使った場合や手で書き換えられた場合に、
    // 壊れた値でモードを決めてしまわないこと。**大文字や前後の空白も読まない**——
    // インラインスクリプトが `=== "dark"` で比べているので、ここだけ緩めると食い違う。
    for (const raw of [null, "", "system", "Dark", " dark "]) {
      expect(parseStoredTheme(raw), String(raw)).toBeNull();
    }
  });
});

describe("resolveTheme", () => {
  // 読者が選んだ値は OS の設定に上書きされない（spec.md 3.1「一度切り替えたら、その
  // 選択を維持する」の核心）。保存値のある行は、OS と逆の組み合わせで見る。
  it.each([
    ["未選択 × OSライト", null, false, "light"],
    ["未選択 × OSダーク", null, true, "dark"],
    ["light選択 × OSダーク", "light", true, "light"],
    ["dark選択 × OSライト", "dark", false, "dark"],
  ] as const)("%s → %s", (_label, stored, prefersDark, expected) => {
    expect(resolveTheme(stored as Theme | null, prefersDark)).toBe(expected);
  });
});

describe("toggleTheme", () => {
  it("押すたびに反転する", () => {
    expect(toggleTheme("light")).toBe("dark");
    expect(toggleTheme("dark")).toBe("light");
  });
});

/*
 * `<body>` の先頭で走るインラインスクリプト。**判定を `resolveTheme` と別に書いている**
 * （関数を渡せないので文字列で持つ）ので、両者が同じモードを選ぶことを、スクリプトを
 * 実際に走らせて突き合わせる。
 */
describe("buildThemeScript", () => {
  /** localStorage・matchMedia・`<html>` を差し替えて走らせ、dark が付いたかを返す。 */
  function run(stored: string | null | Error, prefersDark: boolean): boolean {
    let dark = false;
    const localStorage = {
      getItem(key: string) {
        if (stored instanceof Error) throw stored;
        return key === THEME_STORAGE_KEY ? stored : null;
      },
    };
    const window = {
      matchMedia: (query: string) => ({
        matches: query === "(prefers-color-scheme: dark)" && prefersDark,
      }),
    };
    const document = {
      documentElement: {
        classList: {
          toggle(name: string, force: boolean) {
            if (name === DARK_CLASS) dark = force;
          },
        },
      },
    };
    new Function("localStorage", "window", "document", buildThemeScript())(
      localStorage,
      window,
      document,
    );
    return dark;
  }

  it("保存値と OS の設定から resolveTheme と同じモードを選ぶ（即時実行される）", () => {
    for (const stored of [null, "light", "dark", "Dark"]) {
      for (const prefersDark of [false, true]) {
        const expected = resolveTheme(parseStoredTheme(stored), prefersDark) === "dark";
        expect(run(stored, prefersDark), `${stored} × OS${prefersDark ? "ダーク" : "ライト"}`).toBe(
          expected,
        );
      }
    }
  });

  it("localStorage が使えなくてもページを壊さず、HTMLを閉じる文字列を含まない", () => {
    // プライベートモード等で localStorage が例外を投げても、`<body>` の先頭で止まらない。
    expect(() => run(new Error("SecurityError"), true)).not.toThrow();
    // 値は JSON.stringify を通しているので、</script> で閉じられることはない。
    expect(buildThemeScript()).not.toContain("</script");
  });
});
