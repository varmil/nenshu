import { describe, expect, it } from "vitest";
import {
  AGENTS,
  DownloadError,
  PAGE_URL,
  fetchPage,
  fetchZip,
  findFullVersionLink,
  jstDate,
  parseHeaderDump,
  zipFileName,
  type Fetcher,
} from "./download";

/**
 * オープンデータのページの形（2026-09-30 に確かめた形を縮めたもの）。BOM 有りと BOM 無しの
 * 2つの表があり、どちらにも「全体版」と企業規模別の行が同じ形のリンクで並ぶ。
 */
function page(opts: { nbFull?: string | null; bFull?: string } = {}) {
  const table = (id: string, full: string | null, prefix: string) => `
    <div id="${id}"${id === "download_nb" ? ' style="display:none;"' : ""}>
      <ul class="title-list"><li>全体版</li><li>最終更新日：2026年09月29日</li></ul>
      <table>
        <tr><th class="wt01">データ名</th><th class="wt02">ダウンロード</th></tr>
        ${
          full === null
            ? ""
            : `<tr><td class="wt01" style="text-align: left;">全体版</td>
        <td class="wt02"><a
          href="${full}">CSV形式（ZIP圧縮）</a><br>10991KB</td></tr>`
        }
      </table>
      <table>
        <tr><td class="wt01" style="text-align: left;">5001人以上</td>
        <td class="wt02"><a href="${prefix}?w=57">CSV形式（ZIP圧縮）</a></td></tr>
      </table>
    </div>`;
  return `<html><body>
    <a href="javascript:open_b();">BOM有り</a>
    ${table("download_b", opts.bFull ?? "/positivedb/opendata/download_b.html?w=99", "/positivedb/opendata/download_b.html")}
    ${table("download_nb", opts.nbFull === undefined ? "/positivedb/opendata/download_nb.html?w=99" : opts.nbFull, "/positivedb/opendata/download_nb.html")}
  </body></html>`;
}

describe("findFullVersionLink", () => {
  it("BOM 無しの表の「全体版」の行のリンクを、絶対 URL にして返す", () => {
    expect(findFullVersionLink(page())).toBe(
      "https://positive-ryouritsu.mhlw.go.jp/positivedb/opendata/download_nb.html?w=99"
    );
  });

  it("リンクの形が変わっても、行で拾う（URL を決め打ちしない）", () => {
    expect(findFullVersionLink(page({ nbFull: "./files/4e6b3d07-99_20261001_utf8.zip" }))).toBe(
      "https://positive-ryouritsu.mhlw.go.jp/positivedb/opendata/files/4e6b3d07-99_20261001_utf8.zip"
    );
  });

  it("「全体版」の行が無ければ落とす。企業規模別や BOM 有りの表のリンクで代用しない", () => {
    expect(() => findFullVersionLink(page({ nbFull: null }))).toThrow(DownloadError);
  });

  it("BOM 無しの表そのものが無ければ落とす", () => {
    expect(() =>
      findFullVersionLink(page().replace('id="download_nb"', 'id="download_x"'))
    ).toThrow(DownloadError);
  });
});

describe("zipFileName", () => {
  it("Content-Disposition のファイル名を採る", () => {
    expect(zipFileName('attachment; filename="99_20260929_utf8.zip"', PAGE_URL)).toBe(
      "99_20260929_utf8.zip"
    );
    expect(zipFileName("attachment; filename*=UTF-8''99_20260929_utf8.zip", PAGE_URL)).toBe(
      "99_20260929_utf8.zip"
    );
  });

  it("無ければ URL の最後の部分。置き場所の外へ書かせない", () => {
    expect(zipFileName(null, "https://example.jp/a/99_x.zip")).toBe("99_x.zip");
    expect(zipFileName('attachment; filename="../../etc/x.zip"', PAGE_URL)).toBe("x.zip");
    expect(zipFileName(null, "https://example.jp/download_nb.html?w=99")).toBe(
      "download_nb.html.zip"
    );
  });
});

describe("jstDate", () => {
  it("日本時間の日付で数える。UTC の15時で日が替わる", () => {
    expect(jstDate(new Date("2026-09-29T14:59:59Z"))).toBe("2026-09-29");
    expect(jstDate(new Date("2026-09-29T15:00:00Z"))).toBe("2026-09-30");
  });
});

/** 呼ばれた URL と名乗りを記録し、決めた応答を返す fetch。 */
function recorder(respond: (url: string, agent: string) => Response) {
  const calls: { url: string; agent: string }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    const agent = AGENTS.find((a) => a.userAgent === init.headers["User-Agent"])!.name;
    calls.push({ url, agent });
    return respond(url, agent);
  };
  return { calls, fetcher };
}

describe("fetchPage", () => {
  it("まず自サイト名を名乗る。通ればブラウザを名乗らない", async () => {
    const { calls, fetcher } = recorder(() => new Response("<html></html>"));
    expect((await fetchPage(fetcher)).agent).toBe("self");
    expect(calls.map((c) => c.agent)).toEqual(["self"]);
  });

  it("403 のときだけブラウザを名乗って1回だけ取り直す", async () => {
    const { calls, fetcher } = recorder((_, agent) =>
      agent === "self" ? new Response("", { status: 403 }) : new Response("<html></html>")
    );
    expect((await fetchPage(fetcher)).agent).toBe("browser");
    expect(calls.map((c) => c.agent)).toEqual(["self", "browser"]);
  });

  it("403 以外の失敗では名乗りを変えずに落とす", async () => {
    const { calls, fetcher } = recorder(() => new Response("", { status: 503 }));
    await expect(fetchPage(fetcher)).rejects.toThrow(DownloadError);
    expect(calls.map((c) => c.agent)).toEqual(["self"]);
  });

  it("ブラウザを名乗っても 403 なら落とす", async () => {
    const { fetcher } = recorder(() => new Response("", { status: 403 }));
    await expect(fetchPage(fetcher)).rejects.toThrow(DownloadError);
  });
});

describe("fetchZip", () => {
  const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]);

  it("ページで通った名乗りで取り、ファイル名を添えて返す", async () => {
    const { calls, fetcher } = recorder(
      () =>
        new Response(zipBytes, {
          headers: { "content-disposition": 'attachment; filename="99_20260930_utf8.zip"' },
        })
    );
    const zip = await fetchZip(fetcher, "https://example.jp/dl?w=99", "browser");
    expect(zip.fileName).toBe("99_20260930_utf8.zip");
    expect(calls).toEqual([{ url: "https://example.jp/dl?w=99", agent: "browser" }]);
  });

  it("中身が ZIP でなければ落とす（エラーのページを ZIP として置かない）", async () => {
    const { fetcher } = recorder(() => new Response("<html>メンテナンス中</html>"));
    await expect(fetchZip(fetcher, "https://example.jp/dl?w=99", "self")).rejects.toThrow(
      DownloadError
    );
  });
});

describe("parseHeaderDump", () => {
  it("プロキシと転送のブロックを飛ばし、最後の応答の見出しを読む", () => {
    const dump = [
      "HTTP/1.1 200 Connection Established",
      "",
      "HTTP/2 302 ",
      "location: /files/a.zip",
      "",
      "HTTP/2 200 ",
      "content-type: application/zip",
      'content-disposition: attachment; filename="99_20260930_utf8.zip"',
      "",
      "",
    ].join("\r\n");
    const headers = parseHeaderDump(dump);
    expect(headers.get("content-disposition")).toBe('attachment; filename="99_20260930_utf8.zip"');
    expect(headers.get("location")).toBeNull();
  });
});
