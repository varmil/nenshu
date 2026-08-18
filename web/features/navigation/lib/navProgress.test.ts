import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createNavProgress } from "./navProgress";

const FINISH_MS = 320;

describe("createNavProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("初期状態はidleで、バーは出ない", () => {
    expect(createNavProgress(FINISH_MS).getPhase()).toBe("idle");
  });

  it("遷移待ちが始まるとloading、終わるとfinishingを経てidleに戻る", () => {
    const store = createNavProgress(FINISH_MS);

    store.begin();
    expect(store.getPhase()).toBe("loading");

    store.end();
    expect(store.getPhase()).toBe("finishing");

    vi.advanceTimersByTime(FINISH_MS - 1);
    expect(store.getPhase()).toBe("finishing");

    vi.advanceTimersByTime(1);
    expect(store.getPhase()).toBe("idle");
  });

  it("複数のリンクが同時に待ちに入っても、最後の1つが終わるまでloadingのまま", () => {
    const store = createNavProgress(FINISH_MS);

    store.begin();
    store.begin();
    store.end();
    expect(store.getPhase()).toBe("loading");

    store.end();
    expect(store.getPhase()).toBe("finishing");
  });

  it("消えかけている最中に次の遷移が始まったら、消さずにloadingへ戻す", () => {
    const store = createNavProgress(FINISH_MS);

    store.begin();
    store.end();
    expect(store.getPhase()).toBe("finishing");

    store.begin();
    expect(store.getPhase()).toBe("loading");

    // 前の完了タイマーが生きていると、待ち中なのにここでidleに落ちてしまう。
    vi.advanceTimersByTime(FINISH_MS * 2);
    expect(store.getPhase()).toBe("loading");
  });

  it("待ちが無いのにendが余分に呼ばれても、カウントは負にならない", () => {
    const store = createNavProgress(FINISH_MS);

    store.end();
    expect(store.getPhase()).toBe("idle");

    store.begin();
    store.end();
    store.end();
    vi.advanceTimersByTime(FINISH_MS);
    expect(store.getPhase()).toBe("idle");

    // ここでカウントが-1になっていると、次のbeginでloadingにならない。
    store.begin();
    expect(store.getPhase()).toBe("loading");
  });

  it("フェーズが変わったときだけ購読者に通知し、解除できる", () => {
    const store = createNavProgress(FINISH_MS);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.begin();
    expect(listener).toHaveBeenCalledTimes(1);

    // 2本目のリンクではフェーズが変わらないので通知しない（無駄な再描画を避ける）。
    store.begin();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.end();
    store.end();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
