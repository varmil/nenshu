/**
 * コミットされた `web/public/data/` が、コミットされた `pipeline/data/` から作り直したものと一致するか
 * （refresh の D1・#871・`docs/refresh/ci/design.md`）。CI が PR ごとに回す。
 *
 *   cd pipeline && npm run check:data
 *
 * **止めたいのは「データを作り直し忘れた」「`web/public/data/` を手で直した」の2つ**（CLAUDE.md
 * 「データの再生成は build-data.ts に集約する」）。毎日の更新（D4）の PR は `pipeline/data/` と
 * `web/public/data/` を両方書き換えるので、片方だけの PR を通さない。
 *
 * **比べないのは `companies.json` の `meta.generatedAt` だけ**（作り直すたびに変わる）。`meta.version`
 * は中身から決まる（`datasetVersion`）ので比べる。`logos.json` は `build:logos`（ネットワークが要る）が
 * 書くもので、`build:data` は書かないので比べない。
 */
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildData } from "./build-data";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMMITTED = resolve(ROOT, "../web/public/data");

/** `companies.json` から `meta.generatedAt` を除いた文字列。ほかのファイルはそのまま。 */
function comparable(name: string, text: string): string {
  if (name !== "companies.json") return text;
  const data = JSON.parse(text);
  delete data.meta.generatedAt;
  return JSON.stringify(data);
}

/** 一致しないファイルの名前。 */
export function differingFiles(outDir: string, committedDir = COMMITTED): string[] {
  return readdirSync(outDir)
    .filter((name) => name.endsWith(".json"))
    .filter((name) => {
      const built = readFileSync(join(outDir, name), "utf-8");
      let committed: string;
      try {
        committed = readFileSync(join(committedDir, name), "utf-8");
      } catch {
        return true;
      }
      return comparable(name, built) !== comparable(name, committed);
    });
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const out = mkdtempSync(join(tmpdir(), "nenshu-check-data-"));
  try {
    // 社数の急な減り（`checkCountDrop`）はいまの `companies.json` を前回として見るので、写しておく
    copyFileSync(join(COMMITTED, "companies.json"), join(out, "companies.json"));
    buildData(out);
    const differing = differingFiles(out);
    if (differing.length > 0) {
      console.error(
        `web/public/data/ が pipeline/data/ から作り直したものと一致しません: ${differing.join(", ")}\n` +
          "cd pipeline && npm run build:data -- --out ../web/public/data を回してコミットすること"
      );
      process.exitCode = 1;
    } else {
      console.log("web/public/data/ は pipeline/data/ から作り直したものと一致する");
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}
