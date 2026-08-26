import { afterEach, describe, expect, it } from "vitest";
import { isRankingPath, readPathname } from "./pathname";

/**
 * F0（#208）では `history.pushState` を包んで変化を購読していたので、その配線を
 * ここで固定していた。**F1（#209）で購読ごと消えた**——Astro の遷移はページを
 * 作り直すので、文書が生きている間にパスは変わらない（`pathname.ts`）。
 * 残っているのは「どこから読むか」だけなので、見るのもそれだけになる。
 *
 * **`window` は差し込む。** vitest の実行環境は node で、jsdom を足していない
 * （足すのはこの1ファイルのためだけになる）。読んでいるのは
 * `window.location.pathname` の1つだけなので、その形だけ用意すれば足りる。
 */
type Global = Record<"window", unknown>;

function setPathname(pathname: string | null): void {
  const g = globalThis as unknown as Global;
  if (pathname === null) delete (g as Partial<Global>).window;
  else g.window = { location: { pathname } };
}

afterEach(() => setPathname(null));

describe("readPathname", () => {
  it("`window.location.pathname` を返す", () => {
    setPathname("/company/6861");
    expect(readPathname()).toBe("/company/6861");
  });

  it("サーバー（`window` が無い）では空文字", () => {
    setPathname(null);
    expect(readPathname()).toBe("");
  });
});

describe("isRankingPath", () => {
  it("`/` のときだけ真", () => {
    setPathname("/");
    expect(isRankingPath()).toBe(true);

    setPathname("/about");
    expect(isRankingPath()).toBe(false);

    setPathname("/company/6861");
    expect(isRankingPath()).toBe(false);
  });

  it("サーバーでは偽（判定はイベントの中でしか使わない）", () => {
    setPathname(null);
    expect(isRankingPath()).toBe(false);
  });
});
