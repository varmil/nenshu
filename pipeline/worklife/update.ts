/**
 * 女性活躍DB の全件版を落として取り込む（refresh の D7・#877・`docs/refresh/worklife-fetch/design.md`）。
 *
 *   cd pipeline && npm run update:worklife
 *
 * 定期実行（D8）が毎日1回呼ぶ。ページ → 全件版のリンク → ZIP → 検証 → 取り込み の順で、
 * **取りに行くのは日本時間の1日に1回まで**（ADR-0008 の 2026-09-29 の追記）。
 *
 * - **版が変わっていなくても取り込む。** 取り込みは同じ ZIP なら同じ値を返す。数字の差分更新
 *   （D4）がその日に足した会社は、取り込み直さないと働きやすさが空のまま残る
 * - **検証に落ちた版は取り込まない。** `worklife.csv` と取り込んだ版の記録は前のまま残し、
 *   落ちた版と理由を `manifest.json` の `rejected` に書く。知らせるのは D8
 * - 取得そのものの失敗（ページが開けない・リンクが見つからない・ZIP でない）は例外で止まる。
 *   何も書かないので、次の日にそのままやり直す
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  curlFetcher,
  fetchPage,
  fetchZip,
  findFullVersionLink,
  jstDate,
  type Fetcher,
} from "./download";
import {
  DEFAULT_PATHS,
  RejectedSourceError,
  extract,
  printExtractResult,
  readManifest,
  writeManifest,
  type ExtractPaths,
} from "./extract";
import { HeaderMismatchError } from "./positivedb";

export type UpdateResult =
  | { status: "skipped"; reason: string }
  | { status: "imported"; file: string; result: ReturnType<typeof extract> }
  | { status: "rejected"; file: string; reason: string };

export async function update(
  opts: { fetcher?: Fetcher; now?: Date; paths?: ExtractPaths } = {}
): Promise<UpdateResult> {
  const paths = opts.paths ?? DEFAULT_PATHS;
  const today = jstDate(opts.now ?? new Date());
  const manifest = readManifest(paths.manifest);
  // 取りに行った日は、取り込めた版（`fetchedAt`）と落とした版（`rejected.fetchedAt`）の両方で数える
  if (manifest && (manifest.fetchedAt === today || manifest.rejected?.fetchedAt === today)) {
    return { status: "skipped", reason: `今日（${today}）はもう取りに行った。1日1回まで` };
  }

  const fetcher: Fetcher = opts.fetcher ?? curlFetcher;
  const { html, agent } = await fetchPage(fetcher);
  const link = findFullVersionLink(html);
  const { bytes, fileName } = await fetchZip(fetcher, link, agent);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const staging = mkdtempSync(resolve(tmpdir(), "positivedb-"));
  try {
    const staged = resolve(staging, fileName);
    writeFileSync(staged, bytes);
    let result: ReturnType<typeof extract>;
    try {
      result = extract({ zipPath: staged, fetchedAt: today, paths });
    } catch (e) {
      const rejected = e instanceof HeaderMismatchError || e instanceof RejectedSourceError;
      // 前の版が無ければ「前の版のまま」にできないので、そのまま止める
      if (!rejected || manifest === null) throw e;
      writeManifest(paths.manifest, {
        ...manifest,
        rejected: { file: fileName, sha256, fetchedAt: today, reason: e.message },
      });
      return { status: "rejected", file: fileName, reason: e.message };
    }
    // 取り込んだ ZIP を置き場に移す。前の版は消す（`extract:worklife` はちょうど1つを読む）
    mkdirSync(paths.sourceDir, { recursive: true });
    for (const f of readdirSync(paths.sourceDir)) {
      if (f.toLowerCase().endsWith(".zip")) rmSync(resolve(paths.sourceDir, f));
    }
    copyFileSync(staged, resolve(paths.sourceDir, fileName));
    return { status: "imported", file: fileName, result };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const r = await update();
  if (r.status === "skipped") {
    console.log(r.reason);
  } else if (r.status === "rejected") {
    console.error(`${r.file} は取り込まなかった: ${r.reason}`);
    console.error("worklife.csv は前の版のまま。manifest.json の rejected に残した");
  } else {
    console.log(`${r.file} を取り込んだ（${r.result.changed ? "新しい版" : "前と同じ版"}）`);
    printExtractResult(r.result, DEFAULT_PATHS.outCsv);
  }
}
