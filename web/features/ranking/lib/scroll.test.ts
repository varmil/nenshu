import { describe, expect, it, vi } from "vitest";
import { scrollToPageTop } from "./scroll";

describe("scrollToPageTop", () => {
  it("ページ最上部（0,0）へ戻す", () => {
    const scrollTo = vi.fn();
    scrollToPageTop({ scrollTo } as unknown as Window);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0 });
  });

  it("アニメーションは付けない（既定の一瞬で戻す挙動）", () => {
    const scrollTo = vi.fn();
    scrollToPageTop({ scrollTo } as unknown as Window);
    expect(scrollTo.mock.calls[0][0]).not.toHaveProperty("behavior");
  });

  // SSR（window が無い）で読み込まれても落ちないこと。
  it("window が無い環境では何もしない", () => {
    expect(() => scrollToPageTop(undefined)).not.toThrow();
  });
});
