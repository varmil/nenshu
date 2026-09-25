import { describe, expect, it } from "vitest";
import {
  CLARITY_PROJECT_ID,
  buildClarityScript,
  isClarityEnabled,
} from "./clarity";

describe("isClarityEnabled", () => {
  it("本番ビルドでだけ有効になる（開発サーバーとテストの実行ぶんを計測に混ぜない）", () => {
    expect(isClarityEnabled("production")).toBe(true);
    expect(isClarityEnabled("development")).toBe(false);
    expect(isClarityEnabled("test")).toBe(false);
    expect(isClarityEnabled(undefined)).toBe(false);
  });
});

describe("buildClarityScript", () => {
  const script = buildClarityScript(CLARITY_PROJECT_ID);

  it("Issue #44 で指定されたプロジェクトIDで、Clarity の配信元から本体を非同期で読む", () => {
    expect(CLARITY_PROJECT_ID).toBe("y45c6ky1j1");
    expect(script).toContain('"y45c6ky1j1"');
    expect(script).toContain("https://www.clarity.ms/tag/");
    // 描画を止めない。
    expect(script).toContain("t.async=1");
  });

  it("インラインスクリプトを閉じてしまう文字列を含まない", () => {
    expect(script).not.toContain("</script");
  });
});
