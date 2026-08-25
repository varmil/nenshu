"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { CompanyRow } from "@/features/ranking/types";
import { logoIdSet } from "../lib/mask";

const LogoIdsContext = createContext<Set<string>>(new Set());

/**
 * ロゴを持つ会社のIDだけを配る。**画像のURLは配らない**——IDから
 * `/logos/<id>.webp` で引けるので、経路を2つ持つ理由がない。
 *
 * 渡し方が2つあるのは、ページによって配るべき量が違うため。
 * - ランキング: 2,961社ぶんの `mask`（raw 2.9KB・gzip 約540B）を開く
 * - 企業詳細: その画面に出る数十社だけの `ids`（マスクを送ると無駄が大きい）
 */
export function LogoIdsProvider({
  rows,
  mask,
  ids,
  children,
}: {
  rows?: readonly CompanyRow[];
  mask?: string;
  ids?: readonly string[];
  children: ReactNode;
}) {
  const value = useMemo(
    () => (ids ? new Set(ids) : rows && mask ? logoIdSet(rows, mask) : new Set<string>()),
    [ids, rows, mask]
  );
  return <LogoIdsContext.Provider value={value}>{children}</LogoIdsContext.Provider>;
}

export function useHasLogo(id: string): boolean {
  return useContext(LogoIdsContext).has(id);
}
