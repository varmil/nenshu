/**
 * サイトが使っている一次情報の名前と URL の1か所（C12・Issue #805）。
 *
 * **`/about` の「出典」と企業詳細ページの「このページの出典」が同じ表を見る。**
 * 以前は `/about` が URL を直書きしていて、企業詳細ページには出典のリンクが
 * 無かった。2か所に書くと片方だけ URL が古くなる。
 *
 * `name` はリンクの文字列そのもの。機関名（金融庁・厚生労働省）は文脈によって
 * 前に置いたり後ろに括弧で添えたりするので、ここには持たせない。
 */
export const PRIMARY_SOURCES = {
  /** 有価証券報告書。平均年間給与・平均年齢・平均勤続年数・従業員数・経常利益。 */
  edinet: { name: "EDINET", url: "https://disclosure2.edinet-fsa.go.jp/" },
  /** 業種別の賃金カーブ。取得は e-Stat 経由。 */
  wageCensus: {
    name: "賃金構造基本統計調査",
    url: "https://www.mhlw.go.jp/toukei/list/chinginkouzou.html",
  },
  /**
   * 残業・有給・男女の賃金の差異（W0・ADR-0009）。**データを落としたのは
   * オープンデータのページ**（`pipeline/worklife/manifest.json`）だが、読者に
   * 渡すのはデータベースの入口にする——会社名で引けるのはこちら。
   */
  positiveDb: {
    name: "女性の活躍推進企業データベース",
    url: "https://positive-ryouritsu.mhlw.go.jp/positivedb/",
  },
} as const;

/**
 * 有報1件の EDINET 書類閲覧ページ（C13・Issue #814、`docs/company/spec.md` 1.20）。
 *
 * **この URL は公開 API ではなく EDINET の画面の URL。** システムの更新で変わりうるので、
 * データ（`filings.json`）には書類 ID だけを持たせ、組み立てはここ1か所にする。変わったら
 * ここを直せば全社のリンクがそろって直る。末尾の `,,` は有っても無くても同じ書類が開く
 * （2026-09-24 に確かめた。存在しない ID はリダイレクトされる）。
 */
export function edinetDocumentUrl(docId: string): string {
  return `https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?${docId},,`;
}
