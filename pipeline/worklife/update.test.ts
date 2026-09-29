import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { toCsv } from "./csv";
import { AGENTS, type Fetcher } from "./download";
import { DEFAULT_PATHS, readManifest, writeManifest, type ExtractPaths } from "./extract";
import { COL, EXPECTED_HEADER } from "./positivedb";
import { update } from "./update";

/**
 * 取得から取り込みまで（refresh の D7・#877・AC-17）。ネットワークには出ず、ページと ZIP を
 * 返す fetch を渡す。会社は実データの `ranking_unified.csv` の先頭3社（台帳に居る）を使う。
 */

const NOW = new Date("2026-09-30T01:00:00Z"); // 日本時間 2026-09-30 10:00
const PAGE = `<div id="download_nb"><table>
  <tr><td class="wt01">全体版</td><td><a href="/positivedb/opendata/download_nb.html?w=99">CSV</a></td></tr>
</table></div>`;

let dir: string;
let paths: ExtractPaths;
let companies: { corporateNumber: string }[];

beforeEach(() => {
  dir = mkdtempSync(resolve(tmpdir(), "worklife-update-"));
  const lines = readFileSync(DEFAULT_PATHS.unifiedCsv, "utf-8").split("\n");
  writeFileSync(resolve(dir, "unified.csv"), lines.slice(0, 4).join("\n") + "\n");
  const header = lines[0].replace(/^﻿/, "").split(",");
  companies = lines.slice(1, 4).map((line) => ({
    corporateNumber: line.split(",")[header.indexOf("corporate_number")],
  }));
  paths = {
    sourceDir: resolve(dir, "source"),
    manifest: resolve(dir, "manifest.json"),
    outCsv: resolve(dir, "worklife.csv"),
    unifiedCsv: resolve(dir, "unified.csv"),
    ledger: DEFAULT_PATHS.ledger,
  };
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** 女性活躍DB の CSV を ZIP にしたバイト列。`matched` 社ぶんに賃金の差異を入れる。 */
function positiveDbZip(opts: { matched?: number; header?: string[]; wageGap?: string } = {}) {
  const rows = companies.slice(0, opts.matched ?? companies.length).map((c) => {
    const r = new Array<string>(EXPECTED_HEADER.length).fill("");
    r[COL.name] = "テスト株式会社";
    r[COL.corporateNumber] = c.corporateNumber;
    r[COL.wageGapAll] = opts.wageGap ?? "70.1";
    r[COL.updatedAt] = "2026/09/29";
    return r;
  });
  const csv = resolve(dir, "99_utf8.csv");
  writeFileSync(csv, toCsv([opts.header ?? [...EXPECTED_HEADER], ...rows]));
  const zip = resolve(dir, "built.zip");
  rmSync(zip, { force: true });
  execFileSync("zip", ["-q", "-j", zip, csv]);
  return readFileSync(zip);
}

/** ページと ZIP を返す fetch。呼ばれた回数を数える。 */
function server(zip: Buffer, fileName = "99_20260930_utf8.zip") {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push(url);
    // 自サイト名の名乗りは弾く（いまの実際の挙動）
    if (init.headers["User-Agent"] === AGENTS[0].userAgent)
      return new Response("", { status: 403 });
    if (url.includes("download_nb")) {
      return new Response(new Uint8Array(zip), {
        headers: { "content-disposition": `attachment; filename="${fileName}"` },
      });
    }
    return new Response(PAGE);
  };
  return { calls, fetcher };
}

describe("update（AC-17）", () => {
  it("全件版を落として取り込み、取り込んだ版を manifest に残す", async () => {
    const { calls, fetcher } = server(positiveDbZip());
    const r = await update({ fetcher, now: NOW, paths });

    expect(r.status).toBe("imported");
    const manifest = readManifest(paths.manifest)!;
    expect(manifest).toMatchObject({
      file: "99_20260930_utf8.zip",
      fetchedAt: "2026-09-30",
      matched: companies.length,
      written: companies.length,
    });
    expect(manifest.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(paths.outCsv, "utf-8").trim().split("\n")).toHaveLength(
      companies.length + 1
    );
    // 取り込んだ ZIP は置き場に1つだけ残る（手で回し直す extract:worklife が読む）
    expect(readdirSync(paths.sourceDir)).toEqual(["99_20260930_utf8.zip"]);
    // ページは自サイト名 → ブラウザの順、ZIP はブラウザで1回
    expect(calls).toEqual([
      "https://positive-ryouritsu.mhlw.go.jp/positivedb/opendata/",
      "https://positive-ryouritsu.mhlw.go.jp/positivedb/opendata/",
      "https://positive-ryouritsu.mhlw.go.jp/positivedb/opendata/download_nb.html?w=99",
    ]);
  });

  it("取りに行くのは日本時間の1日に1回まで", async () => {
    await update({ fetcher: server(positiveDbZip()).fetcher, now: NOW, paths });
    const { calls, fetcher } = server(positiveDbZip());
    const again = await update({
      fetcher,
      now: new Date("2026-09-30T14:59:00Z"), // 日本時間 23:59
      paths,
    });
    expect(again.status).toBe("skipped");
    expect(calls).toEqual([]);

    const nextDay = await update({ fetcher, now: new Date("2026-09-30T15:00:00Z"), paths });
    expect(nextDay.status).toBe("imported");
  });

  it("版が同じでも取り込む。値は変わらない", async () => {
    const zip = positiveDbZip();
    await update({ fetcher: server(zip).fetcher, now: NOW, paths });
    const before = readFileSync(paths.outCsv, "utf-8");
    const r = await update({
      fetcher: server(zip).fetcher,
      now: new Date("2026-10-01T01:00:00Z"),
      paths,
    });
    expect(r.status === "imported" && r.result.changed).toBe(false);
    expect(readFileSync(paths.outCsv, "utf-8")).toBe(before);
    expect(readManifest(paths.manifest)!.fetchedAt).toBe("2026-10-01");
  });

  it("236列の検証に落ちた版は取り込まず、前の版のまま。落ちた版と理由を manifest に残す", async () => {
    await update({ fetcher: server(positiveDbZip()).fetcher, now: NOW, paths });
    const csvBefore = readFileSync(paths.outCsv, "utf-8");
    const manifestBefore = readManifest(paths.manifest)!;

    const shifted = [...EXPECTED_HEADER];
    shifted.splice(100, 0, "新しい列");
    shifted.pop();
    const r = await update({
      fetcher: server(positiveDbZip({ header: shifted, wageGap: "10.0" }), "99_20261001_utf8.zip")
        .fetcher,
      now: new Date("2026-10-01T01:00:00Z"),
      paths,
    });

    expect(r.status).toBe("rejected");
    expect(readFileSync(paths.outCsv, "utf-8")).toBe(csvBefore);
    const manifest = readManifest(paths.manifest)!;
    const { rejected, ...kept } = manifest;
    expect(kept).toEqual(manifestBefore);
    expect(rejected).toMatchObject({ file: "99_20261001_utf8.zip", fetchedAt: "2026-10-01" });
    expect(rejected!.reason).toContain("101列目");
    // 落とした版は置き場に置かない
    expect(readdirSync(paths.sourceDir)).toEqual(["99_20260930_utf8.zip"]);

    // 落とした日も「取りに行った日」に数える
    const again = await update({
      fetcher: server(positiveDbZip()).fetcher,
      now: new Date("2026-10-01T10:00:00Z"),
      paths,
    });
    expect(again.status).toBe("skipped");

    // 次に取り込めた版で、落とした版の記録は消える
    await update({
      fetcher: server(positiveDbZip(), "99_20261002_utf8.zip").fetcher,
      now: new Date("2026-10-02T01:00:00Z"),
      paths,
    });
    expect(readManifest(paths.manifest)!.rejected).toBeUndefined();
  });

  it("突合できた社数が前の版から大きく減った版は取り込まない", async () => {
    await update({ fetcher: server(positiveDbZip()).fetcher, now: NOW, paths });
    // 前の版が100社と突合できていたことにする（テストの会社は3社しかない）
    writeManifest(paths.manifest, { ...readManifest(paths.manifest)!, matched: 100 });
    const csvBefore = readFileSync(paths.outCsv, "utf-8");

    const r = await update({
      fetcher: server(positiveDbZip({ matched: 2 })).fetcher,
      now: new Date("2026-10-01T01:00:00Z"),
      paths,
    });
    expect(r.status).toBe("rejected");
    expect(readFileSync(paths.outCsv, "utf-8")).toBe(csvBefore);
    expect(readManifest(paths.manifest)!.rejected!.reason).toContain("100社から2社");
  });

  it("前の版が無いときに検証に落ちたら、何も書かずに止める", async () => {
    const shifted = [...EXPECTED_HEADER].reverse();
    await expect(
      update({ fetcher: server(positiveDbZip({ header: shifted })).fetcher, now: NOW, paths })
    ).rejects.toThrow();
    expect(existsSync(paths.manifest)).toBe(false);
    expect(existsSync(paths.outCsv)).toBe(false);
  });
});
