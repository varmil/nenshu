/**
 * 公開URL `/company/[id]` に使う企業ID。証券コードがあればそれ、無ければ
 * EDINETコード（ADR-0006）。
 *
 * **書類ID（EDINET書類管理番号）は使わない。** 毎年の有報提出で新しく振られるため、
 * 年1回のデータ更新のたびにURLが変わってしまう。証券コードを持たない107社
 * （みずほ銀行・JERA 等）がそれに当たり、非上場の事業会社を載せていることは
 * `docs/ranking/intent.md` の差別化要因そのものなので、そこのURLが毎年
 * リセットされる構成では公開できない。
 *
 * EDINETコードは提出者に対して振られる識別子で、年をまたいで変わらない。
 * 公開の EDINETコードリスト（`Edinetcode.zip`、APIキー不要）から取れる。
 *
 * 「読める URL」ではない点は既知の制約。コードリストには `提出者名（ヨミ）` 列が
 * あってカタカナの読みは取れるので、ローマ字化の規則（ヘボン式・長音・重複時の
 * 解決）を決めれば読めるスラッグは作れる。ただしURLの可読性が検索順位に効く
 * 度合いは小さく、規則を発明するコストに見合わないと判断した（ADR-0006 の却下案）。
 */
export function makeId(row: {
  secCode: string;
  edinetCode: string;
  name: string;
}): string {
  if (row.secCode) return row.secCode;
  if (row.edinetCode) return row.edinetCode;
  throw new Error(`${row.name} に証券コードもEDINETコードもありません`);
}
