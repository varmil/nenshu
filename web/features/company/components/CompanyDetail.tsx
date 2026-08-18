"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/design-system/ui/badge";
import { Card, CardContent, CardHeader } from "@/design-system/ui/card";
import { AgeSwitch } from "@/features/ranking/components/AgeSwitch";
import { formatDecimal1, formatInt, formatManYen } from "@/features/ranking/lib/format";
import { TARGET_AGES, type TargetAge } from "@/features/ranking/types";
import type { CompanyView } from "../types";
import {
  formatDeviation,
  formatDiffFromMean,
  formatTopPercent,
  statsForAge,
} from "../lib/stats";
import { SalaryCurveChart } from "./SalaryCurveChart";

const DEFAULT_AGE: TargetAge = 35;

function parseAge(raw: string | null): TargetAge | null {
  const n = Number(raw);
  return (TARGET_AGES as readonly number[]).includes(n) ? (n as TargetAge) : null;
}

/**
 * 年齢スイッチと `?age=` の同期。
 *
 * `useRouter()` は使わない（RSCペイロード再フェッチによるネットワーク発生・競合状態。
 * U5 で踏んだ。`docs/ranking/url-sync/design.md`）。`window.history.pushState` を直接呼ぶ。
 *
 * `useRankingState` を共用しない。あちらは7つの値とページ番号を持ち、その大半は
 * 企業ページに存在しない概念になる。ここは値が1つなのでデバウンスも
 * `pushState`/`replaceState` の出し分けも要らない。
 */
function useTargetAge(initialAge: TargetAge) {
  const [targetAge, setTargetAge] = useState<TargetAge>(initialAge);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      setTargetAge(parseAge(params.get("age")) ?? DEFAULT_AGE);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    // 既定値の35歳はURLに出さない。
    const next = targetAge === DEFAULT_AGE ? "" : `?age=${targetAge}`;
    if (next === window.location.search) return;
    window.history.pushState(null, "", `${window.location.pathname}${next}`);
  }, [targetAge]);

  return { targetAge, setTargetAge };
}

export function CompanyDetail({
  view,
  initialAge,
}: {
  view: CompanyView;
  initialAge: TargetAge;
}) {
  const { targetAge, setTargetAge } = useTargetAge(initialAge);
  const current = statsForAge(view, targetAge);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <nav className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
        <Link href="/" className="hover:text-foreground underline">
          年齢補正年収ランキング
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href={`/?ind=${encodeURIComponent(view.tse33)}`}
          className="hover:text-foreground underline"
        >
          {view.tse33}
        </Link>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{view.name}</h1>
          {view.hasBadge && <Badge variant="outline">本社のみ</Badge>}
        </div>
        <div className="overflow-x-auto">
          <AgeSwitch value={targetAge} onChange={setTargetAge} />
        </div>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-sm">{targetAge}歳時点の推定年収</span>
            <Badge variant="secondary">推定</Badge>
          </div>
          <p className="text-primary text-4xl font-bold">
            {formatManYen(current.estimatedSalary)}
          </p>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs">全体順位</dt>
              <dd className="text-lg font-medium">
                {formatInt(current.rankAll)}位
                <span className="text-muted-foreground text-sm">
                  {" "}
                  / {formatInt(view.totalCount)}社（{formatTopPercent(current.topPercent)}）
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">業界内順位（{view.tse33}）</dt>
              <dd className="text-lg font-medium">
                {formatInt(current.rankIndustry)}位
                <span className="text-muted-foreground text-sm">
                  {" "}
                  / {formatInt(view.industryCount)}社
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">年収偏差値</dt>
              <dd className="text-lg font-medium">
                {formatDeviation(current.deviation)}
                <span className="text-muted-foreground text-sm">
                  {" "}
                  （{formatTopPercent(current.topPercent)}）
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">全体平均との差</dt>
              <dd className="text-lg font-medium">
                {formatDiffFromMean(current.diffFromMean)}
                <span className="text-muted-foreground text-sm">
                  {" "}
                  （全体平均 {formatManYen(current.populationMean)}）
                </span>
              </dd>
            </div>
          </dl>
          <p className="text-muted-foreground mt-3 text-xs">
            年収の分布は右に裾を引くため、偏差値は100を超えることがあります。水準を読むときは
            「上位◯%」のほうが確かです。
          </p>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">年齢別の推定年収</h2>
        <SalaryCurveChart byAge={view.byAge} selectedAge={targetAge} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">有価証券報告書の実測値</h2>
        <p className="text-muted-foreground text-xs">
          ここから下は補正していない実際の数字です。提出会社（単体）のもので、連結子会社の従業員は入りません。
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground text-xs">平均年収</dt>
            <dd className="font-medium">{formatManYen(view.avgSalary)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">平均年齢</dt>
            <dd className="font-medium">{formatDecimal1(view.avgAge)}歳</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">在籍年数</dt>
            <dd className="font-medium">{formatDecimal1(view.avgTenure)}年</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">従業員数（単体）</dt>
            <dd className="font-medium">{formatInt(view.employees)}人</dd>
          </div>
        </dl>
      </section>

      <footer className="text-muted-foreground flex flex-col gap-1 text-xs">
        <p>
          出典: 金融庁 EDINET の有価証券報告書（2026年6〜7月提出）、厚生労働省「賃金構造基本統計調査」。
        </p>
        <p>
          推定年収は年齢補正後の推定値です。実際の年収を保証するものではありません。
          <Link href="/about" className="hover:text-foreground ml-1 underline">
            計算方法と限界
          </Link>
        </p>
        {view.hasBadge && (
          <p>
            「本社のみ」は単体従業員数が連結の10%未満の会社に付けています。この数字はグループ全体を代表していません。
          </p>
        )}
      </footer>
    </div>
  );
}
