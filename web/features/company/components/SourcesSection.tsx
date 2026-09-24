import { PRIMARY_SOURCES } from "@/lib/data/sources";
import type { SourceRow } from "../lib/sources";

/**
 * 「このページの出典」（C12・Issue #805、`docs/company/spec.md` 1.15・AC-16）。
 * 以前の「この数字の作り方」（年齢補正の3ステップ）を置き換えた。
 *
 * **島の外で描く。** 中身は表示基準でも年齢でも変わらないので、C10 の2節と同じく
 * `[id].astro` が名前付きスロット（`slot="sources"`）で差し込む。サーバーで1度 HTML に
 * なるだけで、クライアントの JS にも props にも入らない。**状態を持たせないこと。**
 *
 * **ラベルは固定幅の列、該当するものと出典は PC では1つの段落に流す。** 2つを別の行に
 * 分けるとどの行も2行になり、作り替える前の3ステップより高くなる（運営者の指摘は「補足
 * 説明に過ぎないのにスペースを取りすぎ」）。色で分け、出典だけを muted にする。
 * **モバイルでは出典を次の行に下ろす。** 幅が 266px しかなく、流すと「…従業員数 金融庁
 * EDINET…」が行の途中でつながって境目が読めない（実測）。高さは3ステップの 580px に
 * 対して余裕がある。
 */
export function SourcesSection({ rows }: { rows: SourceRow[] }) {
  return (
    <section className="flex flex-col gap-2" data-testid="company-sources">
      <h2 className="text-lg font-bold">このページの出典</h2>
      <dl className="border-border divide-border divide-y border-t border-b text-xs leading-normal">
        {rows.map((row) => (
          <div key={row.kind} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 py-1.5">
            <dt className="font-semibold">{row.label}</dt>
            <dd>
              {row.covers}
              <span className="text-muted-foreground block sm:ml-2 sm:inline">
                {row.source.map((segment, i) =>
                  typeof segment === "string" ? (
                    segment
                  ) : (
                    /*
                     * `/about` の「出典」と同じ扱い（別タブ・`noreferrer`）。分析の「参照した
                     * 資料」は `nofollow` を付けているが、あちらは会社ごとに違う外部サイトで、
                     * **こちらは全ページ共通の公的な一次情報**なので付けない。
                     */
                    <a
                      key={i}
                      href={PRIMARY_SOURCES[segment.source].url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      {PRIMARY_SOURCES[segment.source].name}
                    </a>
                  )
                )}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
