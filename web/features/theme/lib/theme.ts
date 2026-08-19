// ライト/ダークの表示モード（Issue #68、`docs/site-chrome/spec.md` 3）。
//
// 2状態（light / dark）で、未操作の間は OS の設定に従う。「System」を選べる
// 3状態にはしない——2状態＋OS追従で同じことができ、ドロップダウンのプリミティブを
// 増やさずに済むため（spec.md 3.4）。
//
// **保存先は localStorage だけで、サーバーには一切送らない。** SSR の出力は
// エッジで24時間キャッシュされる（`next.config.ts` の `s-maxage=86400`）ので、
// モードをサーバー側のHTMLに焼くと、ある読者の選択がキャッシュ経由で他の読者に
// 配られてしまう。

export type Theme = "light" | "dark";

/** localStorage のキー。`themeScript.ts` のインラインスクリプトと共有する。 */
export const THEME_STORAGE_KEY = "theme";

/** `<html>` に付けるクラス名。`tokens.css` の `.dark` ブロックと対応する。 */
export const DARK_CLASS = "dark";

/**
 * localStorage から読んだ生の値を Theme に正規化する。
 *
 * 保存が無い場合と、想定外の値が入っていた場合（他のアプリが同じキーを使った、
 * 手で書き換えられた等）はどちらも null を返し、OS の設定に委ねる。
 */
export function parseStoredTheme(raw: string | null): Theme | null {
  return raw === "light" || raw === "dark" ? raw : null;
}

/**
 * 保存値と OS の設定から、実際に使うモードを決める。
 *
 * 保存値があればそれが勝つ。読者が明示的に選んだものを OS の設定で上書きしない。
 */
export function resolveTheme(stored: Theme | null, prefersDark: boolean): Theme {
  if (stored !== null) return stored;
  return prefersDark ? "dark" : "light";
}

/** トグルが押されたときの遷移先。 */
export function toggleTheme(current: Theme): Theme {
  return current === "light" ? "dark" : "light";
}

/**
 * `<html>` にクラスを反映し、選択を保存する。
 *
 * 判定（上の純粋関数）と DOM 操作をここで分けているのは、判定側を Unit テストの
 * 対象にするため。localStorage は Safari のプライベートモード等で例外を投げうるので
 * 握りつぶす（保存できなくても表示は切り替わるべき）。
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(DARK_CLASS, theme === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 保存できない環境ではセッション内だけの切り替えになる。
  }
}

/** 現在 `<html>` に適用されているモードを読む。 */
export function readAppliedTheme(): Theme {
  return document.documentElement.classList.contains(DARK_CLASS) ? "dark" : "light";
}

/** 保存済みの選択を読む。読めなければ null（OS の設定に委ねる）。 */
export function readStoredTheme(): Theme | null {
  try {
    return parseStoredTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * まだ読者が選んでいない場合にかぎり、OS の設定を画面へ反映する。
 *
 * セッション中に OS 側がダークへ切り替わったときに追従するためのもの。
 * 明示的な選択がある場合は何もしない（読者が選んだものを OS で上書きしない）。
 * 保存は行わない——ここで保存すると「未選択」の状態が消えてしまう。
 */
export function syncSystemTheme(prefersDark: boolean): void {
  if (readStoredTheme() !== null) return;
  document.documentElement.classList.toggle(DARK_CLASS, prefersDark);
}
