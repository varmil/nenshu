// Microsoft Clarity（Issue #44）。
//
// npmパッケージ（@microsoft/clarity）ではなく公式のタグスニペットを直接埋める。
// パッケージ版はクライアントコンポーネント＋useEffectでClarity.init()を呼ぶ形になり、
// やることは同じ（同じタグを注入する）のにアプリのJSバンドルが増える。
// ランキングページは既に全企業データをHTMLに埋めている（gzip後64KB、Issue #22）ため、
// 計測のためにバンドルを太らせない方を採る。スニペットはインラインなのでJSバンドルは増えない。

/**
 * ClarityのプロジェクトID。ブラウザに配信されて誰にでも見えるIDであり、秘匿情報ではない。
 */
export const CLARITY_PROJECT_ID = "y45c6ky1j1";

/**
 * 計測を有効にする環境かどうか。本番ビルドだけで有効にする。
 *
 * 開発サーバー（`npm run dev`）とE2E（Playwrightは`npm run dev`に対して走る）で
 * タグを読み込むと、開発中の操作やテスト実行ぶんが実際のセッションとしてClarityに
 * 混ざり、計測データが汚れる。さらにE2Eには「操作中にネットワークリクエストが
 * 発生しない」ことを`toHaveLength(0)`で固定しているテストがあり、
 * 外部への計測リクエストが混ざると壊れる。
 */
export function isClarityEnabled(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production";
}

/**
 * Clarity公式のタグスニペット。プロジェクトIDだけを差し替えて使う。
 * 本体（clarity.ms/tag/<id>）は`async`で読み込まれ、描画を止めない。
 */
export function buildClarityScript(projectId: string): string {
  return `(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", ${JSON.stringify(projectId)});`;
}
