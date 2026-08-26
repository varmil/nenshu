/**
 * 画面上部の遷移プログレスバーの表示フェーズを持つストア。
 *
 * **遷移の始まりは `NavProgressBar` が `document` で1本のリスナーとして拾う**
 * （F1・Issue #209）。`next/link` の `useLinkStatus()` を使っていた頃は各リンクの
 * pending をここへ集約していたが、素の `a` 要素にはそれが無い。
 *
 * Reactに依存しない素のストアにしてあるのは、時間で動く部分（完了後に消えるまでの
 * 猶予、連続遷移の扱い）をUnitテストで固定するため。
 */
export type NavPhase = "idle" | "loading" | "finishing";

/** 完了後、バーを100%まで伸ばして消えるまでの時間（ms）。globals.css の見た目と合わせる。 */
export const FINISH_MS = 320;

export interface NavProgressStore {
  /** Reactの `useSyncExternalStore` から使う。 */
  subscribe: (listener: () => void) => () => void;
  getPhase: () => NavPhase;
  /** リンクが遷移待ちに入った。 */
  begin: () => void;
  /** リンクの遷移待ちが終わった。待ち中のリンクが無くなったら消えるまでの猶予に入る。 */
  end: () => void;
  /**
   * 何も待っていない状態へ戻す（F1・Issue #209）。
   *
   * **素の HTML 取得に変わったので、遷移を始めたページは捨てられる**——`end()` を
   * 呼ぶ主体が着いた先に残らない。ふつうはそれでよい（バーはページごと消える）が、
   * **戻る/進むで bfcache から復元されると、始めた時点の DOM がそのまま戻る。**
   * そのときだけ明示的に消す。
   */
  reset: () => void;
}

export function createNavProgress(finishMs: number = FINISH_MS): NavProgressStore {
  let pending = 0;
  let phase: NavPhase = "idle";
  let finishTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const setPhase = (next: NavPhase) => {
    if (phase === next) return;
    phase = next;
    for (const listener of listeners) listener();
  };

  const clearFinishTimer = () => {
    if (finishTimer === null) return;
    clearTimeout(finishTimer);
    finishTimer = null;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getPhase: () => phase,
    begin() {
      pending += 1;
      // 消えかけている最中に次の遷移が始まったら、消さずにそのまま伸ばす。
      clearFinishTimer();
      setPhase("loading");
    },
    end() {
      if (pending === 0) return;
      pending -= 1;
      if (pending > 0) return;
      clearFinishTimer();
      setPhase("finishing");
      finishTimer = setTimeout(() => {
        finishTimer = null;
        setPhase("idle");
      }, finishMs);
    },
    reset() {
      pending = 0;
      clearFinishTimer();
      setPhase("idle");
    },
  };
}

export const navProgress = createNavProgress();
