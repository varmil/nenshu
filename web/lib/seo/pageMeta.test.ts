import { describe, expect, it } from "vitest";
import { OG_IMAGE } from "@/lib/brand/assets";
import { toMetadata } from "./pageMeta";

const meta = { title: "t", description: "d", canonical: "/?age=35" };

describe("toMetadata", () => {
  it("canonical は `alternates` に入る。相対パスのまま渡す", () => {
    // 絶対URLにするのはサーバーでは `metadataBase`（`app/layout.tsx`）の仕事。
    // ここで絶対URLにすると、オリジンを書く場所が `lib/seo/site.ts` の外に増える。
    expect(toMetadata(meta).alternates).toEqual({ canonical: "/?age=35" });
  });

  /**
   * S2（Issue #116・AC-11・AC-12）。**`og:` を別の場所で組み立てさせない**ための
   * テスト。ここが緩むと、非正規URLで canonical だけが寄せ先を指し `og:url` が
   * 自分自身を指す、という食い違いが復活する。
   */
  it("og:title・og:description・og:url が title・description・canonical と同じ文字列になる", () => {
    const og = toMetadata(meta).openGraph;
    expect(og).toMatchObject({ title: "t", description: "d", url: "/?age=35" });
  });

  it("ページによらない `og:` と `twitter:card` が付く（AC-10）", () => {
    const metadata = toMetadata(meta);
    expect(metadata.openGraph).toMatchObject({
      siteName: "OpenReport",
      type: "website",
      locale: "ja_JP",
      images: [
        {
          url: OG_IMAGE.path,
          width: OG_IMAGE.width,
          height: OG_IMAGE.height,
          alt: OG_IMAGE.alt,
        },
      ],
    });
    expect(metadata.twitter).toEqual({ card: "summary_large_image" });
  });
});
