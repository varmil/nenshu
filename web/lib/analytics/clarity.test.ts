import { describe, expect, it } from "vitest";
import {
  CLARITY_PROJECT_ID,
  buildClarityScript,
  isClarityEnabled,
} from "./clarity";

describe("isClarityEnabled", () => {
  it("本番ビルドでだけ有効になる", () => {
    expect(isClarityEnabled("production")).toBe(true);
  });

  it("開発サーバーとテストでは無効（計測データにテスト実行が混ざらない）", () => {
    expect(isClarityEnabled("development")).toBe(false);
    expect(isClarityEnabled("test")).toBe(false);
    expect(isClarityEnabled(undefined)).toBe(false);
  });
});

describe("buildClarityScript", () => {
  const script = buildClarityScript(CLARITY_PROJECT_ID);

  it("Issue #44 で指定されたプロジェクトIDを埋め込む", () => {
    expect(CLARITY_PROJECT_ID).toBe("y45c6ky1j1");
    expect(script).toContain('"y45c6ky1j1"');
  });

  it("Clarityの配信元を指す", () => {
    expect(script).toContain("https://www.clarity.ms/tag/");
  });

  it("本体スクリプトを非同期で読み込む（描画を止めない）", () => {
    expect(script).toContain("t.async=1");
  });

  it("インラインスクリプトを閉じてしまう文字列を含まない", () => {
    expect(script).not.toContain("</script");
  });
});
