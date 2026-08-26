/**
 * そのクリックが「このサイトの別ページへ移る」ものかを判定する（F1・Issue #209）。
 *
 * **`next/link` を外したので、遷移の始まりを自分で見分ける必要がある。**
 * `useLinkStatus()` は `<Link>` の子孫でしか読めない代わりに「遷移待ちに入った」
 * ことを教えてくれたが、素の `a` 要素にはそれが無い。
 *
 * **判定を純粋関数にしてある。** 実際に拾うのは `NavProgressBar` の委譲リスナー
 * （`document` で1本）で、そちらはブラウザが要る。**どれを遷移と見なすかという
 * 規則そのもの**はここで単体テストに固定する。
 */

export interface NavIntent {
  /** `a` 要素の `href` 属性の値（無ければ `null`）。 */
  href: string | null;
  /** `target` 属性（`_blank` など）。 */
  target?: string | null;
  /** `download` 属性を持つか。 */
  hasDownload?: boolean;
  /** 修飾キーや副ボタン（新しいタブ・保存など、ブラウザに任せるもの）。 */
  modified?: boolean;
  /** 誰かが `preventDefault()` 済みか（`BrandLink` が `/` の上で横取りする）。 */
  defaultPrevented?: boolean;
  /** いま居るページのURL（同一パスの判定に使う）。 */
  currentUrl: string;
}

/**
 * 画面が入れ替わる遷移か。
 *
 * **偽を返す条件を並べてある。**
 *
 * - `href` が無い / `#` だけ / `mailto:` などの別スキーム
 * - 別オリジン（外部サイト）
 * - `target` が `_self` 以外、`download` 付き、修飾キー付き——**ブラウザに任せる**
 * - すでに `preventDefault()` されている——**遷移しないと決めた誰かがいる**
 *   （`/` の上のサイト名は絞り込みを解くだけで移動しない。`BrandLink`）
 * - 行き先がいまと同じパス＋同じクエリ——**画面は入れ替わらない**
 */
export function isPageNavigation(intent: NavIntent): boolean {
  const { href, target, hasDownload, modified, defaultPrevented, currentUrl } = intent;
  if (href === null || href === "") return false;
  if (defaultPrevented === true) return false;
  if (modified === true) return false;
  if (hasDownload === true) return false;
  if (target != null && target !== "" && target !== "_self") return false;

  let url: URL;
  let current: URL;
  try {
    current = new URL(currentUrl);
    url = new URL(href, currentUrl);
  } catch {
    return false;
  }
  if (url.protocol !== current.protocol && url.protocol !== "https:" && url.protocol !== "http:") {
    return false;
  }
  if (url.origin !== current.origin) return false;
  // 同じ場所（ページ内アンカーを含む）は画面が入れ替わらない。
  if (url.pathname === current.pathname && url.search === current.search) return false;
  return true;
}
