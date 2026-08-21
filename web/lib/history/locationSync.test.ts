import { describe, expect, it } from "vitest";
import { locationUrl, shouldWriteLocation, stripLeadingQuestion } from "./locationSync";

describe("stripLeadingQuestion", () => {
  it("`window.location.search` を URLSearchParams.toString() と同じ形に揃える", () => {
    expect(stripLeadingQuestion("?age=35")).toBe("age=35");
    expect(stripLeadingQuestion("age=35")).toBe("age=35");
    expect(stripLeadingQuestion("")).toBe("");
  });
});

describe("locationUrl", () => {
  it("検索文字列が空なら `?` を付けない", () => {
    expect(locationUrl("/", "")).toBe("/");
    expect(locationUrl("/company/6861", "")).toBe("/company/6861");
  });

  it("あればそのまま繋ぐ", () => {
    expect(locationUrl("/", "age=35&ind=銀行業")).toBe("/?age=35&ind=銀行業");
  });
});

describe("shouldWriteLocation", () => {
  const base = { ownerPath: "/", currentPath: "/", currentSearch: "?page=2", nextSearch: "page=3" };

  it("差があれば書く", () => {
    expect(shouldWriteLocation(base)).toBe(true);
  });

  it("同じURLになるなら書かない（同じ場所で履歴を1件増やさない）", () => {
    expect(shouldWriteLocation({ ...base, nextSearch: "page=2" })).toBe(false);
  });

  // マウント前は URL のほうが正（戻る/進むでの復元では初期値が古い）。
  it("owner のパスが決まる前は書かない", () => {
    expect(shouldWriteLocation({ ...base, ownerPath: null })).toBe(false);
  });

  /**
   * 別ページのURLを書き潰さない。**Next.js は `pushState` を浅い遷移として扱う**ので、
   * 別パスを書いてもルートの描画は切り替わらない——URLだけ次のページになって
   * 画面は前のページのまま、という行き止まりを作れてしまう（Issue #108）。
   */
  it("自分のパスを離れていたら書かない", () => {
    expect(
      shouldWriteLocation({
        ownerPath: "/company/6861",
        currentPath: "/",
        currentSearch: "?ind=銀行業",
        nextSearch: "age=35",
      })
    ).toBe(false);
  });
});
