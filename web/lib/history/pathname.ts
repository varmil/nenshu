/**
 * パスの変化を購読する（F0・Issue [#208](https://github.com/varmil/nenshu/issues/208)・ADR-0014）。
 *
 * **なぜ要るか。** 共通ヘッダはレイアウトが持っていて、**ページ遷移で作り直され
 * ない。** `next/navigation` の `usePathname` は React の context なので、パスが
 * 変わると購読側が再レンダーされる——ヘッダの検索欄が `/about` から `/` へ移った
 * ときに `?q=` を見て自分を合わせ直せていたのは、その経路があったからだった。
 * **`usePathname` を外すとその経路が消える**（E2E で実際に落として確かめた。
 * `e2e/ranking-refresh.spec.ts`「/about で打ちかけた語は…」）。
 *
 * **`history.pushState`/`replaceState` を包んで合図を出す。** CLAUDE.md は
 * `nextjs-toploader` 系のライブラリを使わないと決めているが、あれの理由は
 * 「更新が止まっている」ことと「当サイトが自分で `pushState` を呼んでいるのに
 * 差し替えてくる」ことだった。ここは**自分で持つ数十行**で、元の関数を必ず
 * 呼んだうえで**パスが実際に変わったときだけ**知らせる——`queryBroadcast` が
 * 検索語のたびに呼ぶ `replaceState` は同じパスなので、誰も起こさない。
 *
 * **F1（Astro・#209）で消える。** あちらの遷移は素の HTML 取得で、ヘッダごと
 * 作り直されるため、パスの変化を購読する必要がなくなる。
 */

export interface PathnameStore {
  /** `useSyncExternalStore` から使う。 */
  subscribe: (listener: () => void) => () => void;
  getPathname: () => string;
  /**
   * 「URL が動いたかもしれない」と知らせる。**変わっていなければ何もしない。**
   * 変えたかどうかを返す（テストのため）。
   */
  check: () => boolean;
}

export function createPathnameStore(readPathname: () => string): PathnameStore {
  let current = readPathname();
  const listeners = new Set<() => void>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getPathname: () => current,
    check() {
      const next = readPathname();
      if (next === current) return false;
      current = next;
      for (const listener of listeners) listener();
      return true;
    },
  };
}

/**
 * ブラウザ側の配線。**1度だけ行う**（二重に包むと `check` が2回走る）。
 *
 * 包むのは `pushState` と `replaceState` の2つ。**戻る/進むは `popstate`** で拾う
 * ——`pushState` は `popstate` を発火しないので、両方が要る
 * （`features/ranking/lib/queryBroadcast.ts` に同じ事情が書いてある）。
 */
export function installPathnameWatch(store: PathnameStore): void {
  if (typeof window === "undefined") return;
  const flagged = window as typeof window & { __openreportPathnameWatch?: true };
  if (flagged.__openreportPathnameWatch) return;
  flagged.__openreportPathnameWatch = true;

  window.addEventListener("popstate", () => store.check());

  for (const name of ["pushState", "replaceState"] as const) {
    const original = window.history[name];
    window.history[name] = function patched(
      this: History,
      ...args: Parameters<History["pushState"]>
    ) {
      // **必ず元を先に呼ぶ。** 呼ばずに合図だけ出すと URL が動かないまま
      // 購読側が読みに行き、古いパスを新しいものとして採ってしまう。
      original.apply(this, args);
      /*
        **その場で知らせない。マイクロタスクへ逃がす。**

        Next.js のルーターは遷移のときに `useInsertionEffect` の中から
        `pushState` を呼ぶ。そこから同期で `useSyncExternalStore` の購読者を
        起こすと React が `useInsertionEffect must not schedule updates` を出す
        （実際に出た）。マイクロタスクなら commit を抜けた後・ペイントの前に走る。
      */
      queueMicrotask(() => store.check());
    };
  }
}

export const pathnameStore = createPathnameStore(() =>
  typeof window === "undefined" ? "" : window.location.pathname
);

/**
 * いま居るパスを**その場で**読む。購読はしない。
 *
 * **クリックの瞬間にしかパスが要らない場所のためにある**（`BrandLink`）。
 * レンダー中に読むなら購読が要るので `usePathname` を使うこと——ヘッダは
 * ページ遷移で作り直されないので、レンダー時に採った値は古くなりうる。
 */
export function isRankingPath(): boolean {
  return typeof window !== "undefined" && window.location.pathname === "/";
}
