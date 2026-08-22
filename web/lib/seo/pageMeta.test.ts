import { describe, expect, it } from "vitest";
import { toMetadata } from "./pageMeta";

describe("toMetadata", () => {
  it("canonical は `alternates` に入る。相対パスのまま渡す", () => {
    // 絶対URLにするのはサーバーでは `metadataBase`（`app/layout.tsx`）の仕事。
    // ここで絶対URLにすると、オリジンを書く場所が `lib/seo/site.ts` の外に増える。
    expect(toMetadata({ title: "t", description: "d", canonical: "/?age=35" })).toEqual({
      title: "t",
      description: "d",
      alternates: { canonical: "/?age=35" },
    });
  });
});
