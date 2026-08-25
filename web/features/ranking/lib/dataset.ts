import type { CompaniesData } from "../types";

/**
 * 取れた JSON を全社ぶんのデータとして受け入れてよいかを決める（E0・ADR-0013）。
 *
 * **版が食い違ったら引き継がない。** `/` はブラウザ1時間・エッジ24時間キャッシュ
 * される（ADR-0004）ので、**古いHTMLが新しいJSONを引く**組み合わせが起きうる。
 * `dataUrl` はクエリで版を切ってあるが、クエリを落とすキャッシュや中継が間に入れば
 * 別の版が返る。**行の並びは `stats.json` の順位表やロゴのマスクと添字で結びついて
 * いる**ので、ずれると別の会社の順位やロゴを出す。
 *
 * **受け入れないときは `null`。** 呼び出し側はサーバーが渡した1ページぶんを出した
 * まま、操作を実ナビゲーションに倒す——読者にとっては「操作するとページが変わる」
 * だけで、壊れてはいない。
 */
export function acceptCompaniesDataset(json: unknown, version: string): CompaniesData | null {
  const data = json as CompaniesData | null | undefined;
  if (data?.meta?.version !== version) return null;
  // 版が合っていても中身が期待の形でなければ捨てる（`rows` を回す側が落ちるため）。
  if (!Array.isArray(data.rows)) return null;
  return data;
}
