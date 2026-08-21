/**
 * 社名の頭文字。**ロゴを持たない会社の代わりの目印**として出す。
 *
 * 法人格を落としてから1文字目を採る。「株式会社キーエンス」で「株」が並ぶと
 * どの行も同じ見た目になり、目印として働かない。
 */
const LEGAL_FORMS = /^(株式会社|有限会社|合同会社|合資会社|合名会社|\(株\)|（株）|㈱)/;

export function initialOf(name: string): string {
  return name.replace(LEGAL_FORMS, "").trim().charAt(0) || name.charAt(0);
}
