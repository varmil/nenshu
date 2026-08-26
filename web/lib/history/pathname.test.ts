import { describe, expect, it, vi } from "vitest";
import { createPathnameStore } from "./pathname";

describe("createPathnameStore", () => {
  it("最初の値は作った時点のパス", () => {
    const store = createPathnameStore(() => "/about");
    expect(store.getPathname()).toBe("/about");
  });

  it("パスが変わったら知らせる", () => {
    let path = "/about";
    const store = createPathnameStore(() => path);
    const listener = vi.fn();
    store.subscribe(listener);

    path = "/";
    expect(store.check()).toBe(true);
    expect(store.getPathname()).toBe("/");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  /*
    **ここがこのストアの要点。** 検索欄は打つそばから `replaceState` を呼ぶ
    （`features/ranking/lib/queryBroadcast.ts`）が、そのときパスは変わらない。
    毎打鍵でヘッダを再レンダーさせないために、変化したときだけ知らせる。
  */
  it("パスが変わっていなければ誰も起こさない", () => {
    const store = createPathnameStore(() => "/");
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.check()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("購読を解いた相手には知らせない", () => {
    let path = "/";
    const store = createPathnameStore(() => path);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    path = "/about";
    store.check();
    expect(listener).not.toHaveBeenCalled();
  });

  it("複数の購読者すべてに知らせる", () => {
    let path = "/";
    const store = createPathnameStore(() => path);
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);

    path = "/company/6861";
    store.check();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("同じ変化で二度知らせない", () => {
    let path = "/";
    const store = createPathnameStore(() => path);
    const listener = vi.fn();
    store.subscribe(listener);

    path = "/about";
    store.check();
    store.check();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
