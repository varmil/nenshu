import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { differingFiles } from "./check-data";

/** 作り直した側とコミットされた側の2つの置き場所に、同じ名前のファイルを書く。 */
function dirs(built: Record<string, string>, committed: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "nenshu-check-data-test-"));
  const [out, com] = [join(root, "out"), join(root, "com")];
  for (const [dir, files] of [
    [out, built],
    [com, committed],
  ] as const) {
    mkdirSync(dir, { recursive: true });
    for (const [name, text] of Object.entries(files)) {
      writeFileSync(join(dir, name), text, { flag: "w" });
    }
  }
  return { out, com, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const companies = (generatedAt: string, count: number) =>
  JSON.stringify({ meta: { version: "v", count, generatedAt }, rows: [] });

describe("differingFiles（refresh の D1）", () => {
  it("companies.json の generatedAt だけが違うなら一致とみなす", () => {
    const { out, com, cleanup } = dirs(
      { "companies.json": companies("2026-09-29T00:00:00Z", 1), "stats.json": "{}" },
      { "companies.json": companies("2026-09-28T00:00:00Z", 1), "stats.json": "{}" }
    );
    try {
      expect(differingFiles(out, com)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("中身が違うファイルと、コミットされていないファイルを挙げる", () => {
    const { out, com, cleanup } = dirs(
      {
        "companies.json": companies("2026-09-29T00:00:00Z", 2),
        "stats.json": '{"a":1}',
        "new.json": "{}",
      },
      { "companies.json": companies("2026-09-29T00:00:00Z", 1), "stats.json": '{"a":2}' }
    );
    try {
      expect(differingFiles(out, com).sort()).toEqual(["companies.json", "new.json", "stats.json"]);
    } finally {
      cleanup();
    }
  });
});
