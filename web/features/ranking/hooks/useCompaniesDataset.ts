"use client";

import { useEffect, useState } from "react";
import type { CompaniesData } from "../types";
import { acceptCompaniesDataset } from "../lib/dataset";

/**
 * 全社ぶんのデータを初回に1度だけ取りに行く（E0・ADR-0013）。
 *
 * **サーバーはもう全件を props で渡さない。** `RankingApp` は `"use client"` なので、
 * props はハイドレーション用データとして HTML に直列化される——全2,961社を渡して
 * いた頃はそれが `/` の gzip の 85.8%（78,722 B）を占め、しかも `/?age=25`・
 * `/?ind=銀行業`・`/?page=2` …の**どのURLのHTMLにも同じものが入っていた**。
 * アセットとして分ければ、それらは全部同じ1つのファイルを共有する。
 *
 * **届くまでは `null` を返す。** 呼び出し側はサーバーが渡した1ページぶんを出し、
 * 操作は実ナビゲーションに倒す——**この経路を持たない実装にしない**（ADR-0013）。
 * 届かなかったときに操作が沈黙する。
 *
 * **版が食い違ったら引き継がない。** `/` はブラウザ1時間・エッジ24時間キャッシュ
 * される（ADR-0004）ので、**古いHTMLが新しいJSONを引く**組み合わせが起きうる。
 * `dataUrl` はクエリで版を切ってあるが、それでも取れたものが別の版なら捨てる
 * ——行の並びは `stats.json` の順位表やロゴのマスクと添字で結びついており、
 * **ずれると別の会社の順位やロゴを出す。**
 */
export function useCompaniesDataset(dataUrl: string, version: string): CompaniesData | null {
  const [data, setData] = useState<CompaniesData | null>(null);

  useEffect(() => {
    // **開発サーバーの StrictMode は effect を2回走らせる。** 2回目の fetch は
    // ブラウザのキャッシュに当たるので実害は無いが、1回目の結果を捨てるために
    // `cancelled` を持つ（アンマウント後の setState を避ける）。
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(dataUrl);
        if (!response.ok) return;
        const json: unknown = await response.json();
        if (cancelled) return;
        const accepted = acceptCompaniesDataset(json, version);
        if (accepted === null) return;
        setData(accepted);
      } catch {
        // 取れなければ実ナビゲーションのまま動く。**画面には何も出さない**
        // ——読者にとっては「操作するとページが変わる」だけで、壊れてはいない。
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dataUrl, version]);

  return data;
}
