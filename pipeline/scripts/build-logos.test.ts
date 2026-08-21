import { describe, it, expect } from "vitest";
import { extractCandidates, manifestIcons, manifestUrl, absolute } from "./lib/logo/site";
import { sortCandidates, parseSizes, toOrigin, Candidate } from "./lib/logo/candidates";
import { parseEdinetCodeList, splitCsvLine } from "./lib/logo/houjin";
import { icoMaxSize, looksLikeSvg } from "./lib/logo/image";
import { titleFromP154 } from "./lib/logo/commons";

const BASE = "https://example.co.jp/";

describe("公式サイトからの候補の抽出", () => {
  it("JSON-LD の Organization.logo を拾う（@graph の中も見る）", () => {
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"WebSite","name":"x"},
        {"@type":"Organization","logo":{"@type":"ImageObject","url":"/img/logo.png"}}]}
    </script></head><body></body></html>`;
    const got = extractCandidates(html, BASE);
    expect(got).toContainEqual({ source: "jsonld", url: "https://example.co.jp/img/logo.png" });
  });

  it("ヘッダの中の logo を含む img だけを拾う", () => {
    const html = `<header>
      <img src="/img/header-logo.svg" alt="会社ロゴ">
      <img src="/img/campaign-banner.png" alt="キャンペーン">
    </header><img src="/img/logo-in-body.png">`;
    const got = extractCandidates(html, BASE).filter((c) => c.source === "header");
    expect(got).toEqual([{ source: "header", url: "https://example.co.jp/img/header-logo.svg" }]);
  });

  it("header 要素が無ければ先頭だけを見る", () => {
    const html = `<div class="nav"><img src="/logo.png" alt="logo"></div>`;
    const got = extractCandidates(html, BASE).filter((c) => c.source === "header");
    expect(got).toEqual([{ source: "header", url: "https://example.co.jp/logo.png" }]);
  });

  it("data URI とスキーム違いは候補にしない", () => {
    const html = `<header><img src="data:image/png;base64,AAAA" alt="logo"></header>
      <link rel="icon" href="data:image/x-icon;base64,AAAA">
      <link rel="icon" href="javascript:0">`;
    expect(extractCandidates(html, BASE)).toEqual([]);
  });

  it("link rel=icon の sizes を読み、apple-touch-icon は180px相当として扱う", () => {
    const html = `<link rel="icon" sizes="32x32" href="/f32.png">
      <link rel="apple-touch-icon" href="/apple.png">
      <link rel="shortcut icon" href="/favicon.ico">`;
    const got = extractCandidates(html, BASE);
    expect(got).toEqual([
      { source: "icon", url: "https://example.co.jp/f32.png", declared: { w: 32, h: 32 } },
      { source: "icon", url: "https://example.co.jp/apple.png", declared: { w: 180, h: 180 } },
      { source: "icon", url: "https://example.co.jp/favicon.ico", declared: undefined },
    ]);
  });

  it("&amp; を含む href を戻してから解決する", () => {
    const html = `<link rel="icon" href="/i.php?a=1&amp;b=2">`;
    expect(extractCandidates(html, BASE)[0].url).toBe("https://example.co.jp/i.php?a=1&b=2");
  });

  it("manifest の参照と icons を読む", () => {
    const html = `<link rel="manifest" href="/site.webmanifest">`;
    const href = manifestUrl(html, BASE);
    expect(href).toBe("https://example.co.jp/site.webmanifest");
    const icons = manifestIcons(
      { icons: [{ src: "icon-192.png", sizes: "192x192" }, { src: "/icon-512.png", sizes: "512x512" }] },
      href!
    );
    expect(icons).toEqual([
      { source: "icon", url: "https://example.co.jp/icon-192.png", declared: { w: 192, h: 192 } },
      { source: "icon", url: "https://example.co.jp/icon-512.png", declared: { w: 512, h: 512 } },
    ]);
  });
});

describe("候補の優先順", () => {
  const cands: Candidate[] = [
    { source: "icon", url: "a", declared: { w: 512, h: 512 } },
    { source: "header", url: "b" },
    { source: "commons", url: "c" },
    { source: "icon", url: "d", declared: { w: 32, h: 32 } },
    { source: "jsonld", url: "e" },
  ];

  it("出典の確からしさを解像度より優先する", () => {
    expect(sortCandidates(cands).map((c) => c.url)).toEqual(["c", "e", "b", "a", "d"]);
  });

  it("同じ出典の中では宣言サイズの大きいものが先", () => {
    const icons = sortCandidates(cands).filter((c) => c.source === "icon");
    expect(icons.map((c) => c.url)).toEqual(["a", "d"]);
  });

  it("同じURLは1度しか試さない", () => {
    const dup: Candidate[] = [
      { source: "header", url: "x" },
      { source: "icon", url: "x" },
    ];
    expect(sortCandidates(dup)).toHaveLength(1);
  });
});

describe("sizes とURLの正規化", () => {
  it("複数の sizes から最大を採る", () => {
    expect(parseSizes("16x16 180x180 32x32")).toEqual({ w: 180, h: 180 });
    expect(parseSizes("any")).toBeUndefined();
    expect(parseSizes(undefined)).toBeUndefined();
  });

  it("gBizINFO の深いURLをオリジンに寄せる", () => {
    expect(toOrigin("https://www.example.co.jp/recruit/env#a")).toBe("https://www.example.co.jp/");
    expect(toOrigin("http://example.jp")).toBe("http://example.jp/");
    expect(toOrigin("ftp://example.jp")).toBeNull();
    expect(toOrigin("これはURLではない")).toBeNull();
  });

  it("相対URLを解決し、http(s) 以外は捨てる", () => {
    expect(absolute("../a.png", "https://x.jp/b/c/")).toBe("https://x.jp/b/a.png");
    expect(absolute("mailto:a@b.c", BASE)).toBeNull();
  });
});

describe("EDINETコード一覧", () => {
  const csv = [
    "ダウンロード実行日,2026年08月18日現在,件数,11383件",
    "ＥＤＩＮＥＴコード,提出者名,証券コード,提出者法人番号",
    '"E00004","カネコ種苗株式会社","13760","5070001000715"',
    '"E99999","値の無い会社","",""',
  ].join("\r\n");

  it("2行目のヘッダを見て法人番号を引く", () => {
    const map = parseEdinetCodeList(csv);
    expect(map.get("E00004")).toBe("5070001000715");
    expect(map.has("E99999")).toBe(false);
  });

  it("引用符の中のカンマを割らない", () => {
    expect(splitCsvLine('"a,b",c,"d""e"')).toEqual(["a,b", "c", 'd"e']);
  });
});

describe("画像の判定", () => {
  it("ICO のディレクトリから最大サイズを読む（0 は 256）", () => {
    const buf = Buffer.alloc(6 + 16 * 2);
    buf.writeUInt16LE(0, 0);
    buf.writeUInt16LE(1, 2);
    buf.writeUInt16LE(2, 4);
    buf[6] = 16;
    buf[7] = 16;
    buf[22] = 0;
    buf[23] = 0;
    expect(icoMaxSize(buf)).toEqual({ w: 256, h: 256 });
  });

  it("ICO でないものは null", () => {
    expect(icoMaxSize(Buffer.from("<html>"))).toBeNull();
  });

  it("SVG を中身で見分ける（Content-Type を信用しない）", () => {
    expect(looksLikeSvg(Buffer.from('<?xml version="1.0"?><svg xmlns="..."></svg>'))).toBe(true);
    expect(looksLikeSvg(Buffer.from("\x89PNG\r\n\x1a\n"))).toBe(false);
  });
});

describe("Commons のファイル名", () => {
  it("P154 のURLから File: タイトルを作る", () => {
    expect(titleFromP154("http://commons.wikimedia.org/wiki/Special:FilePath/Keyence.svg")).toBe(
      "File:Keyence.svg"
    );
    expect(
      titleFromP154("http://commons.wikimedia.org/wiki/Special:FilePath/Nippon%20Steel_logo.png")
    ).toBe("File:Nippon Steel logo.png");
  });
});

describe("壊れている画像の判定", () => {
  const png = async (w: number, h: number, rgba: [number, number, number, number]) => {
    const sharp = (await import("sharp")).default;
    return sharp({
      create: { width: w, height: h, channels: 4, background: { r: rgba[0], g: rgba[1], b: rgba[2], alpha: rgba[3] / 255 } },
    })
      .png()
      .toBuffer();
  };

  it("1x1 は落とす", async () => {
    const { probe, reject } = await import("./lib/logo/image");
    const buf = await png(1, 1, [255, 0, 0, 255]);
    const p = await probe(buf);
    expect(await reject(buf, p!)).toBe("tooTiny");
  });

  it("全面が不透明な単色は落とす", async () => {
    const { probe, reject } = await import("./lib/logo/image");
    const buf = await png(64, 64, [10, 20, 30, 255]);
    const p = await probe(buf);
    expect(await reject(buf, p!)).toBe("solidColor");
  });

  it("透明の上に置かれた単色のワードマークは落とさない", async () => {
    const sharp = (await import("sharp")).default;
    const { probe, reject } = await import("./lib/logo/image");
    // 透明な地に、1色の帯を1本だけ置いた図（＝単色のロゴ）
    const buf = await sharp({
      create: { width: 120, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: {
            create: { width: 90, height: 12, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
          },
          left: 15,
          top: 14,
        },
      ])
      .png()
      .toBuffer();
    const p = await probe(buf);
    expect(await reject(buf, p!)).toBeNull();
  });

  it("実質透明な画像は落とす", async () => {
    const { probe, reject } = await import("./lib/logo/image");
    const buf = await png(64, 64, [0, 0, 0, 0]);
    const p = await probe(buf);
    expect(await reject(buf, p!)).toBe("almostTransparent");
  });

  it("画像でないものは probe が null", async () => {
    const { probe } = await import("./lib/logo/image");
    expect(await probe(Buffer.from("<html>404 Not Found</html>"))).toBeNull();
  });

  it("罫線のような極端な横長は落とす", async () => {
    const { probe, reject } = await import("./lib/logo/image");
    const buf = await png(400, 4, [1, 2, 3, 255]);
    const p = await probe(buf);
    expect(await reject(buf, p!)).toBe("extremeRatio");
  });
});

describe("ICO の展開（sharp は ICO を読めない）", () => {
  const dirEntry = (w: number, h: number, length: number, offset: number) => {
    const b = Buffer.alloc(16);
    b[0] = w === 256 ? 0 : w;
    b[1] = h === 256 ? 0 : h;
    b.writeUInt32LE(length, 8);
    b.writeUInt32LE(offset, 12);
    return b;
  };

  it("PNG を内包する ICO からその PNG を取り出す", async () => {
    const sharp = (await import("sharp")).default;
    const { icoToImage, probe } = await import("./lib/logo/image");
    const png = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const head = Buffer.alloc(6);
    head.writeUInt16LE(0, 0);
    head.writeUInt16LE(1, 2);
    head.writeUInt16LE(1, 4);
    const ico = Buffer.concat([head, dirEntry(64, 64, png.length, 22), png]);
    const got = await icoToImage(ico);
    expect(got).not.toBeNull();
    expect(await probe(got!)).toEqual({ w: 64, h: 64, format: "png" });
  });

  it("32bpp の BMP を内包する ICO を PNG に開く（上下が逆に入っている）", async () => {
    const { icoToImage, probe } = await import("./lib/logo/image");
    const w = 4;
    const h = 4;
    const dib = Buffer.alloc(40 + w * h * 4);
    dib.writeUInt32LE(40, 0);
    dib.writeInt32LE(w, 4);
    dib.writeInt32LE(h * 2, 8); // AND マスクを含むので2倍
    dib.writeUInt16LE(1, 12);
    dib.writeUInt16LE(32, 14);
    for (let i = 0; i < w * h; i++) {
      dib[40 + i * 4] = 10; // B
      dib[40 + i * 4 + 1] = 20; // G
      dib[40 + i * 4 + 2] = 30; // R
      dib[40 + i * 4 + 3] = 255;
    }
    const head = Buffer.alloc(6);
    head.writeUInt16LE(1, 2);
    head.writeUInt16LE(1, 4);
    const ico = Buffer.concat([head, dirEntry(w, h, dib.length, 22), dib]);
    const got = await icoToImage(ico);
    expect(got).not.toBeNull();
    expect(await probe(got!)).toEqual({ w, h, format: "png" });
  });

  it("ICO でないものは null", async () => {
    const { icoToImage } = await import("./lib/logo/image");
    expect(await icoToImage(Buffer.from("<html>"))).toBeNull();
  });

  it("複数のサイズが入っていれば大きいほうを採る", async () => {
    const sharp = (await import("sharp")).default;
    const { icoToImage, probe } = await import("./lib/logo/image");
    const small = await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const large = await sharp({
      create: { width: 128, height: 128, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const head = Buffer.alloc(6);
    head.writeUInt16LE(1, 2);
    head.writeUInt16LE(2, 4);
    const off1 = 6 + 32;
    const ico = Buffer.concat([
      head,
      dirEntry(16, 16, small.length, off1),
      dirEntry(128, 128, large.length, off1 + small.length),
      small,
      large,
    ]);
    expect((await probe((await icoToImage(ico))!))!.w).toBe(128);
  });
});
