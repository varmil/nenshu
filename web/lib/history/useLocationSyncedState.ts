"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { locationUrl, shouldWriteLocation } from "./locationSync";

/**
 * サーバーでの描画では何もしない `useLayoutEffect`。
 *
 * 復元のときに**ペイントより前**に値を直したいので `useLayoutEffect` が要る
 * （`useEffect` だと古い内容が1フレーム見えてから直る）。そのまま書くと SSR で
 * 「useLayoutEffect does nothing on the server」の警告が出るため、サーバーでは
 * `useEffect` に倒す。U5 でも同じ形を使っていた（`docs/ranking/url-sync/design.md`）。
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * URL のクエリを正として値を持つ（`next/navigation` の `useRouter`/`useSearchParams`
 * は使わない。RSCペイロードの再取得が走るため。`docs/ranking/url-sync/design.md`）。
 *
 * ランキング（`useRankingState`）と企業詳細（`useTargetAge`）が同じ規則で動く。
 * **同じ規則を2か所に書き写していたことが Issue #108 の遠因**——ランキングだけ
 * 直しても、企業詳細に同じ壊れ方が残る形になっていた。
 *
 * 規則は3つ。
 *
 * 1. **マウント時は URL が正。** サーバーが渡した初期値は、戻る/進むでの復元では
 *    ルーターキャッシュに載っていた**古い値**になる（Next.js はキャッシュ済みの
 *    RSC ツリーをそのまま返し、いまのURLで描き直さない）。URL から読み直す。
 * 2. **URL へ書くのは、アプリ側の操作で値が変わったときだけ。** そのために
 *    `setValue` を包んで印を付けている。URL 由来の更新（1. の採り直しと `popstate`）
 *    では書かない——**書くと復元したURLを自分で書き潰す**（`?page=2` が `/` に
 *    戻る、が Issue #108 の報告そのもの）。
 *    「マウント後の1回目だけ飛ばす」という数え方にはしない。**開発時の
 *    StrictMode は effect を2回走らせるので、数えると2回目が漏れる**（実際に漏れ、
 *    クエリの並び順を正規化するだけの `pushState` が1件積まれていた。この履歴は
 *    ハイドレート中に積まれるため Next.js のルーター状態を持たず、**戻っても
 *    ページが切り替わらない**行き止まりになる）。
 * 3. **自分のパスを離れたら書かない・読まない**（`shouldWriteLocation` を参照）。
 *
 * 書き込みは常に `pushState`（1操作＝1履歴エントリ）。**打つそばから変わる値
 * （検索語）はここを通さない**——1文字ごとに履歴が増えるため、書き手側
 * （`features/ranking/lib/queryBroadcast.ts`）が `replaceState` で書く。
 *
 * @param read URL → 値。マウント時と、`popstate`・`syncEvent` のたびに呼ぶ。
 * @param toSearch 値 → 検索文字列（`?` 無し）。**値どうしの等価判定にも使う**
 *   ——URL に出ない差は「同じ」とみなしてよい。
 * @param syncEvent `pushState` で URL を書いた別のコンポーネントが投げる合図の名前。
 */
export function useLocationSyncedState<T>(
  initial: T,
  read: (params: URLSearchParams) => T,
  toSearch: (value: T) => string,
  syncEvent?: string
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  /** この値を持っているページのパス。マウントするまでは `null`（＝書かない）。 */
  const ownerPathRef = useRef<string | null>(null);
  /** 直近の更新がアプリ側の操作だったか（規則2）。 */
  const changedByAppRef = useRef(false);

  // 引数の関数はレンダーごとに作り直されても構わないようにする（呼び出し側に
  // useCallback を強いない）。effect の依存には入れない——依存に入れると、
  // インラインの関数を渡されたときに「マウント時だけ」の effect が毎レンダー
  // 走ってしまう。代わりにレンダー後（＝ref を書き換えてよい場所）で最新に保つ。
  const fnRef = useRef({ read, toSearch });
  useIsomorphicLayoutEffect(() => {
    fnRef.current = { read, toSearch };
  });

  /** 規則2の印を付ける。呼び出し側から見える setter はこちらだけ。 */
  const setValueFromApp = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    changedByAppRef.current = true;
    setValue(action);
  }, []);

  // 規則1: マウント時は URL が正。
  useIsomorphicLayoutEffect(() => {
    ownerPathRef.current = window.location.pathname;
    const { read: readNow, toSearch: toSearchNow } = fnRef.current;
    const fromUrl = readNow(new URLSearchParams(window.location.search));
    setValue((prev) => (toSearchNow(prev) === toSearchNow(fromUrl) ? prev : fromUrl));
  }, []);

  // URL → 値。`pushState`/`replaceState` は `popstate` を発火しないので、自分の
  // 書き込みでここが再トリガーされることはない。
  useEffect(() => {
    const onLocationChanged = () => {
      // 遷移の途中で別ページのURLを読み込まない（規則3の読み取り側）。
      if (window.location.pathname !== ownerPathRef.current) return;
      setValue(fnRef.current.read(new URLSearchParams(window.location.search)));
    };
    window.addEventListener("popstate", onLocationChanged);
    if (syncEvent) window.addEventListener(syncEvent, onLocationChanged);
    return () => {
      window.removeEventListener("popstate", onLocationChanged);
      if (syncEvent) window.removeEventListener(syncEvent, onLocationChanged);
    };
  }, [syncEvent]);

  // 値 → URL。
  useEffect(() => {
    if (!changedByAppRef.current) return;
    changedByAppRef.current = false;
    const nextSearch = fnRef.current.toSearch(value);
    if (
      !shouldWriteLocation({
        ownerPath: ownerPathRef.current,
        currentPath: window.location.pathname,
        currentSearch: window.location.search,
        nextSearch,
      })
    ) {
      return;
    }
    window.history.pushState(null, "", locationUrl(window.location.pathname, nextSearch));
  }, [value]);

  return [value, setValueFromApp];
}
