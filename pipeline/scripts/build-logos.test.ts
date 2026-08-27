import { describe, it, expect } from "vitest";
import { extractCandidates, manifestIcons, manifestUrl, absolute } from "./lib/logo/site";
import {
  sortCandidates,
  prioritize,
  pinnedCandidates,
  parseSizes,
  toOrigin,
  Candidate,
} from "./lib/logo/candidates";
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

  it("SNS へのリンクの中の logo は捨てる（Xのロゴを自社ロゴとして採らない）", () => {
    const html = `<header>
      <a href="/ja.html"><img src="/img/site-logo.svg" alt="logo"></a>
      <a href="https://twitter.com/example"><img src="/img/logo-black1.png" alt=""></a>
      <a href="https://www.instagram.com/example"><img src="/img/logo-ig.png" alt=""></a>
    </header>`;
    const got = extractCandidates(html, BASE).filter((c) => c.source === "header");
    expect(got).toEqual([{ source: "header", url: "https://example.co.jp/img/site-logo.svg" }]);
  });

  it("トップページへ行く logo を、下層へ行く logo より先に試す", () => {
    // クレスコの並び。SNS のロゴが先頭にあり、本物のロゴはずっと後ろにいた
    const html = `<div class="sns"><a href="https://twitter.com/x"><img src="/x-logo.png"></a></div>
      <a href="/blog/entry.html"><img src="/logo_TechBlog.svg"></a>
      <a href="/ja.html"><img src="/site-logo/logo.svg"></a>`;
    const got = extractCandidates(html, BASE)
      .filter((c) => c.source === "header")
      .map((c) => c.url);
    expect(got).toEqual([
      "https://example.co.jp/site-logo/logo.svg",
      "https://example.co.jp/logo_TechBlog.svg",
    ]);
  });

  it("別ホストのトップへ行く logo も採る（CDN配信のHTMLで実在する）", () => {
    const html = `<header>
      <a href="https://kmbs.example.us"><img class="logo" src="/identity.svg"></a>
      <div class="logo-wrapper"><img class="logo_2" src="/business-solutions.svg"></div>
    </header>`;
    const got = extractCandidates(html, BASE)
      .filter((c) => c.source === "header")
      .map((c) => c.url);
    expect(got).toEqual([
      "https://example.co.jp/identity.svg",
      "https://example.co.jp/business-solutions.svg",
    ]);
  });

  it("公式サイトのURLが深いときは、そのページ自身へのリンクをトップとして扱う", () => {
    // KDDI の site は /english/。パスの形だけで見ると povo（別サイトのトップ）が先に来る
    const html = `<header>
      <a href="/english/"><img src="/cmn_logo01.png" alt="logo"></a>
      <a href="https://povo.jp/"><img src="/header_logo01_02.png" alt="povo logo"></a>
    </header>`;
    const got = extractCandidates(html, "https://example.co.jp/english/")
      .filter((c) => c.source === "header")
      .map((c) => c.url);
    expect(got).toEqual([
      "https://example.co.jp/cmn_logo01.png",
      "https://example.co.jp/header_logo01_02.png",
    ]);
  });

  it("リンクの外にある logo はトップ扱いにしない", () => {
    const html = `<header>
      <img src="/floating-logo.png">
      <a href="/"><img src="/home-logo.png"></a>
    </header>`;
    const got = extractCandidates(html, BASE)
      .filter((c) => c.source === "header")
      .map((c) => c.url);
    expect(got).toEqual([
      "https://example.co.jp/home-logo.png",
      "https://example.co.jp/floating-logo.png",
    ]);
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

describe("公式サイトの取得（`http://` からの引き上げ）", () => {
  const stub = (answers: Record<string, number>) => {
    const seen: string[] = [];
    return {
      seen,
      fetcher: {
        get: async (url: string) => {
          seen.push(url);
          const status = answers[url] ?? 0;
          return {
            status,
            body: status === 200 ? Buffer.from("<html></html>") : Buffer.alloc(0),
            contentType: "text/html",
            url,
          };
        },
      },
    };
  };

  it("`http://` が失敗したら `https://` でやり直す", async () => {
    const { fetchSite } = await import("./lib/logo/fetcher");
    const { fetcher, seen } = stub({ "https://www.example.co.jp/": 200 });
    const res = await fetchSite(fetcher, "http://www.example.co.jp/");
    expect(res?.status).toBe(200);
    expect(seen).toEqual(["http://www.example.co.jp/", "https://www.example.co.jp/"]);
  });

  it("`http://` で通れば引き上げない（余計な1往復を全社に掛けない）", async () => {
    const { fetchSite } = await import("./lib/logo/fetcher");
    const { fetcher, seen } = stub({ "http://www.example.co.jp/": 200 });
    expect((await fetchSite(fetcher, "http://www.example.co.jp/"))?.status).toBe(200);
    expect(seen).toEqual(["http://www.example.co.jp/"]);
  });

  it("`https://` が失敗しても `http://` へは落とさない", async () => {
    const { fetchSite } = await import("./lib/logo/fetcher");
    const { fetcher, seen } = stub({ "http://www.example.co.jp/": 200 });
    expect(await fetchSite(fetcher, "https://www.example.co.jp/")).toBeNull();
    expect(seen).toEqual(["https://www.example.co.jp/"]);
  });

  it("引き上げても駄目なら null（候補は空になる）", async () => {
    const { fetchSite } = await import("./lib/logo/fetcher");
    const { fetcher } = stub({});
    expect(await fetchSite(fetcher, "http://www.example.co.jp/")).toBeNull();
  });

  it("200 でも中身が空なら失敗として扱う", async () => {
    const { fetchSite } = await import("./lib/logo/fetcher");
    const empty = {
      get: async (url: string) => ({ status: 200, body: Buffer.alloc(0), contentType: "", url }),
    };
    expect(await fetchSite(empty, "https://www.example.co.jp/")).toBeNull();
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

describe("会社ごとに決めた候補の指定", () => {
  const pin = pinnedCandidates["8015"];

  it("指定した候補を優先順より先に置く", () => {
    const cands = sortCandidates([
      { source: "jsonld", url: "https://www.toyota-tsusho.com/english/app-files/img/symbol/logo.png" },
      pin,
    ]);
    // 出典の順では jsonld が header より先だが、指定はその上を行く
    expect(cands[0].source).toBe("jsonld");
    expect(prioritize("8015", cands)[0]).toEqual(pin);
  });

  it("同じURLが候補にもあれば1つに畳む", () => {
    const got = prioritize("8015", [pin, { source: "icon", url: "https://example.co.jp/favicon.ico" }]);
    expect(got.filter((c) => c.url === pin.url)).toHaveLength(1);
  });

  it("指定の無い会社では並びを変えない", () => {
    const cands: Candidate[] = [{ source: "jsonld", url: "a" }, { source: "header", url: "b" }];
    expect(prioritize("6861", cands)).toEqual(cands);
  });

  it("候補が1件も集まらなくても指定は試す", () => {
    // 公式サイトが読めない年でも、指定した1件だけは取りに行く
    expect(prioritize("8015", [])).toEqual([pin]);
  });

  it("指定のURLは絶対URLで書く", () => {
    // 候補は `absolute()` を通った絶対URLで届く。相対で書くと1つも一致しないまま
    // 「効いている」ように見える
    for (const c of Object.values(pinnedCandidates)) expect(c.url).toMatch(/^https?:\/\//);
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

describe("明るい器で見えないロゴの判定（Issue #156）", () => {
  /** 透明の地に、指定色の帯を1本だけ置いた図（＝ワードマークの代わり） */
  const wordmark = async (rgba: [number, number, number, number], border?: [number, number, number]) => {
    const sharp = (await import("sharp")).default;
    const bar = {
      input: {
        create: {
          width: 90,
          height: 12,
          channels: 4 as const,
          background: { r: rgba[0], g: rgba[1], b: rgba[2], alpha: rgba[3] / 255 },
        },
      },
      left: 15,
      top: 14,
    };
    const composite = border
      ? [
          {
            input: {
              create: {
                width: 96,
                height: 18,
                channels: 4 as const,
                background: { r: border[0], g: border[1], b: border[2], alpha: 1 },
              },
            },
            left: 12,
            top: 11,
          },
          bar,
        ]
      : [bar];
    return sharp({
      create: { width: 120, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite(composite)
      .png()
      .toBuffer();
  };

  it("白いワードマークは空白と見なす", async () => {
    const { blankOnLight } = await import("./lib/logo/image");
    expect(await blankOnLight(await wordmark([255, 255, 255, 255]))).toBe(true);
  });

  it("黒いワードマークは残す", async () => {
    const { blankOnLight } = await import("./lib/logo/image");
    expect(await blankOnLight(await wordmark([0, 0, 0, 255]))).toBe(false);
  });

  it("薄いアルファの白も空白と見なす（重ねてから見る）", async () => {
    // 生の RGB は白、アルファは 40。**アルファを掛けずに見ると白い画素として数えられ、
    // 掛けても白のまま**——どちらにせよ明るい器の上には何も乗らない
    const { blankOnLight } = await import("./lib/logo/image");
    expect(await blankOnLight(await wordmark([255, 255, 255, 40]))).toBe(true);
  });

  it("薄いアルファの黒は残す（重ねると灰色のインクになる）", async () => {
    const { blankOnLight } = await import("./lib/logo/image");
    expect(await blankOnLight(await wordmark([0, 0, 0, 160]))).toBe(false);
  });

  it("色の付いた縁を持つ白抜きロゴは残す", async () => {
    const { blankOnLight } = await import("./lib/logo/image");
    expect(await blankOnLight(await wordmark([255, 255, 255, 255], [200, 30, 40]))).toBe(false);
  });

  it("ほとんど白い薄い灰色も空白と見なす", async () => {
    const { blankOnLight } = await import("./lib/logo/image");
    expect(await blankOnLight(await wordmark([246, 246, 246, 255]))).toBe(true);
  });
});

describe("図の一部しか見えないロゴの判定（Issue #221）", () => {
  /**
   * 「濃いシンボル＋白いワードマーク」の図。透明の地の左端に色付きの四角を置き、
   * その右へ長い帯を1本伸ばす——帯の色を変えると症状の有無が入れ替わる。
   */
  const symbolAndWordmark = async (word: [number, number, number, number]) => {
    const sharp = (await import("sharp")).default;
    return sharp({
      create: { width: 300, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: {
            create: { width: 30, height: 30, channels: 4 as const, background: { r: 10, g: 40, b: 120, alpha: 1 } },
          },
          left: 5,
          top: 5,
        },
        {
          input: {
            create: {
              width: 250,
              height: 16,
              channels: 4 as const,
              background: { r: word[0], g: word[1], b: word[2], alpha: word[3] / 255 },
            },
          },
          left: 45,
          top: 12,
        },
      ])
      .png()
      .toBuffer();
  };

  it("白いワードマークが沈んでシンボルだけ見えているものを落とす", async () => {
    const { mostlyHiddenOnLight } = await import("./lib/logo/image");
    expect(await mostlyHiddenOnLight(await symbolAndWordmark([255, 255, 255, 255]))).toBe(true);
  });

  it("ワードマークが濃ければ残す（同じ寸法・同じ配置）", async () => {
    const { mostlyHiddenOnLight } = await import("./lib/logo/image");
    expect(await mostlyHiddenOnLight(await symbolAndWordmark([20, 20, 20, 255]))).toBe(false);
  });

  it("まるごと白いものはここでは判定しない（`blankOnLight` の担当）", async () => {
    // インクが1画素も無い＝外接矩形が取れない。2つの判定の境目をここで固定する
    const sharp = (await import("sharp")).default;
    const { mostlyHiddenOnLight, blankOnLight } = await import("./lib/logo/image");
    const allWhite = await sharp({
      create: { width: 200, height: 40, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .png()
      .toBuffer();
    expect(await mostlyHiddenOnLight(allWhite)).toBe(false);
    expect(await blankOnLight(allWhite)).toBe(true);
  });

  it("白い地に載ったロゴは残す（外側が透明でない）", async () => {
    // 丸い白のカードに載ったアイコン（151A・138A）や、白い矩形の左端に置かれた
    // ワードマーク（8217）がこれ。白は地であって、沈んだ図ではない
    const sharp = (await import("sharp")).default;
    const { mostlyHiddenOnLight } = await import("./lib/logo/image");
    const onWhiteCard = await sharp({
      create: { width: 300, height: 40, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .composite([
        {
          input: {
            create: { width: 30, height: 30, channels: 4 as const, background: { r: 10, g: 40, b: 120, alpha: 1 } },
          },
          left: 5,
          top: 5,
        },
      ])
      .png()
      .toBuffer();
    expect(await mostlyHiddenOnLight(onWhiteCard)).toBe(false);
  });
});

describe("配っている画像（web/public/logos/）", () => {
  it("明るい器の上で読めない画像を1枚も配らない", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const { unusableOnLight } = await import("./lib/logo/image");
    const { mapLimit } = await import("./lib/logo/fetcher");

    // 判定を足すのは安いが、**足す前に配ってしまったものは残る**。
    // 実際に Issue #156 の時点で50枚（1,636枚中3.1%）が空白のマス目として出ており、
    // Issue #221 ではシンボルだけが見える31枚（2,509枚中1.2%）が残っていた。
    // パイプラインを回すのは年1回なので、見張りはリポジトリ側に置く
    const dir = resolve(__dirname, "../../web/public/logos");
    const files = readdirSync(dir).filter((f) => f.endsWith(".webp"));
    expect(files.length).toBeGreaterThan(1400);
    const unreadable: string[] = [];
    await mapLimit(files, 8, async (file) => {
      if (await unusableOnLight(readFileSync(resolve(dir, file)))) unreadable.push(file);
    });
    expect(unreadable.sort()).toEqual([]);
  }, 60_000);
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
