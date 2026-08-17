# SSR移行（ADR-0004） — design.md

Unit内部の構造。

## 構成

```
web/next.config.ts                              # output:'export'を削除、headers()追加（既存を修正）
web/open-next.config.ts                          # defineCloudflareConfig（新規）
web/wrangler.jsonc                               # SSR用設定に総入れ替え（既存を修正）
web/.dev.vars                                    # NEXTJS_ENV=development（新規）
web/.gitignore                                   # .open-next/ を追加（既存を修正）
web/package.json                                 # @opennextjs/cloudflare 追加、scripts追加（既存を修正）
web/app/page.tsx                                 # searchParamsを読みinitialStateを渡す（既存を修正）
web/features/ranking/lib/urlState.ts             # searchParams変換関数を追加（既存を修正）
web/features/ranking/lib/urlState.test.ts        # 上記のUnitテストを追加（既存を修正）
web/features/ranking/components/RankingApp.tsx   # initialStateをpropsで受ける（既存を修正）
web/features/ranking/hooks/useRankingState.ts    # initialState対応・PR #36分の削除（既存を修正）
web/e2e/ranking-url-sync.spec.ts                 # 生HTTPでのSEO検証テストを追加（既存を修正）
docs/ranking/project-foundation/design.md        # Cloudflareダッシュボードの新コマンドを追記（既存を修正）
```

## `next.config.ts`

```ts
import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
  async headers() {
    return [
      {
        source: "/",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600" },
          {
            key: "Cloudflare-CDN-Cache-Control",
            value: "public, s-maxage=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
```

- `output: 'export'`を削除する。これがADR-0004の中核（ADR-0002を一部supersede）。
- ブラウザ向け`Cache-Control`（1時間）とエッジ向け`Cloudflare-CDN-Cache-Control`（1日、1週間はstale-while-revalidateで許容）を分ける。データは年1回しか変わらないため、この程度の粒度で十分。
- `initOpenNextCloudflareForDev()`はadapterの推奨手順。今回Cloudflareのバインディング（KV/D1/R2等）は使わないため実質的な効果は薄いが、`next dev`実行時にadapterの前提を壊さないための標準的な追加。

## `open-next.config.ts`（新規）

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
```

R2 incremental cacheは導入しない。全ページが`searchParams`依存の動的レンダリングで、Next.jsのISR/Data Cache（`revalidate`・`fetch`のキャッシュ）を使う場面がないため。ページ応答自体のキャッシュは`next.config.ts`の`headers()`とCloudflareのエッジキャッシュで行う（後述）。

## `wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "nenshu",
  "compatibility_date": "2026-08-17",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "main": ".open-next/worker.js",
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "services": [{ "binding": "WORKER_SELF_REFERENCE", "service": "nenshu" }]
}
```

静的アセット配信専用だった以前の設定（`assets.directory: "./out"`のみ）から、SSR用の設定に総入れ替えする。`main`がWorkerのエントリーポイントになり、`assets`はNext.jsのビルド成果物（`_next/static`等）を配信する側に回る。`services`の自己参照バインディングはOpenNext Cloudflare adapterの標準構成（Worker間リクエストの内部ルーティングに使われる）。

## `package.json`

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
    // 既存のstart/lint/typecheck/test/test:e2eは変更なし
  },
  "devDependencies": {
    "@opennextjs/cloudflare": "最新安定版"
    // 既存の依存は変更なし
  }
}
```

`build`は`next build`のまま変えない（Playwright E2E・型チェックは通常のNext.jsビルドで完結するため）。OpenNextのビルド（`.next` → `.open-next/`変換）は別コマンドに分離する。

## `app/page.tsx`

```tsx
import { RankingApp } from "@/features/ranking/components/RankingApp";
import type { CompaniesData, CurvesData } from "@/features/ranking/types";
import {
  INITIAL_STATE,
  parseSearchParams,
  searchParamsRecordToURLSearchParams,
} from "@/features/ranking/lib/urlState";
import companiesData from "../public/data/companies.json";
import curvesData from "../public/data/curves.json";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = searchParamsRecordToURLSearchParams(await searchParams);
  const initialState = { ...INITIAL_STATE, ...parseSearchParams(params) };

  return (
    <RankingApp
      companies={companiesData as CompaniesData}
      curves={curvesData as CurvesData}
      initialState={initialState}
    />
  );
}
```

`searchParams`を読むことで、このルートはNext.jsにより自動的に動的レンダリング（リクエストごとのSSR）になる。`export const dynamic = 'force-dynamic'`の明示は不要（Next.js公式ドキュメントで確認済み）。

**`rankedCompanies`はここで計算しない。** `"use client"`コンポーネントもSSR時はサーバー上で一度実行され、`useState`の初期値・`useMemo`はSSR中に評価される（`useEffect`系だけがブラウザ限定）。`RankingApp`に`initialState`だけ渡せば、既存の`useMemo(() => buildRankedCompanies(...))`がSSR時にも正しく動き、二重計算にならない。

## `lib/urlState.ts` への追加

```ts
export function searchParamsRecordToURLSearchParams(
  record: Record<string, string | string[] | undefined>
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params;
}
```

Next.jsの`searchParams`は`URLSearchParams`ではなくプレーンオブジェクト（同じキーが複数あれば配列になる）。既存の`parseSearchParams(URLSearchParams)`をそのまま再利用するための変換だけを行う、Reactに依存しない純粋関数。同じキーが重複した場合は最初の値を採用する（`?age=45&age=50`のような不正なURLは想定していないが、クラッシュしないようにする）。

## `hooks/useRankingState.ts`

```ts
"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { CompaniesData, CurvesData, RankedCompany, RankingState } from "../types";
import { buildRankedCompanies } from "../lib/rank";
import { buildSearchParams, INITIAL_STATE, parseSearchParams } from "../lib/urlState";

const QUERY_URL_UPDATE_DEBOUNCE_MS = 300;

export interface UseRankingStateResult {
  state: RankingState;
  setState: Dispatch<SetStateAction<RankingState>>;
  rankedCompanies: RankedCompany[];
}

function readStateFromLocation(): RankingState {
  const parsed = parseSearchParams(new URLSearchParams(window.location.search));
  return { ...INITIAL_STATE, ...parsed };
}

export function useRankingState(
  companies: CompaniesData,
  curves: CurvesData,
  initialState: RankingState
): UseRankingStateResult {
  const [state, setState] = useState<RankingState>(initialState);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 戻る/進むだけ読み直す。pushState/replaceStateはpopstateを発火させないため、
  // 自分の書き込みで読み取りが再トリガーされることはない。
  useEffect(() => {
    const onPopState = () => setState(readStateFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // state → URL。マウント時、stateはサーバーが渡したinitialState（=URLの内容）と
  // 一致しているので、この効果は初回は何もしない（nextQs === currentQsで早期return）。
  useEffect(() => {
    const nextQs = buildSearchParams(state).toString();
    const currentQs = window.location.search.replace(/^\?/, "");
    if (nextQs === currentQs) return;

    const url = nextQs ? `${window.location.pathname}?${nextQs}` : window.location.pathname;
    const currentFromUrl = readStateFromLocation();
    const onlyQueryDiffers =
      state.targetAge === currentFromUrl.targetAge &&
      state.industry === currentFromUrl.industry &&
      state.employeeSize === currentFromUrl.employeeSize &&
      state.tenure === currentFromUrl.tenure &&
      state.avgAgeBucket === currentFromUrl.avgAgeBucket &&
      state.query !== currentFromUrl.query;

    clearTimeout(debounceRef.current);
    if (onlyQueryDiffers) {
      debounceRef.current = setTimeout(() => {
        window.history.replaceState(null, "", url);
      }, QUERY_URL_UPDATE_DEBOUNCE_MS);
    } else {
      window.history.pushState(null, "", url);
    }

    return () => clearTimeout(debounceRef.current);
  }, [state]);

  const rankedCompanies = useMemo(
    () => buildRankedCompanies(companies, curves, state),
    [companies, curves, state]
  );

  return { state, setState, rankedCompanies };
}
```

### PR #36分（`useLayoutEffect`・マウント時のURL再読み込み・`isFirstWrite`ガード）をすべて削除する

U5時点では、静的HTML（`output:'export'`）が常にビルド時の初期値を焼き込んでいたため、マウント後にクライアント側で`window.location.search`を読み直して補正する処理が必須だった。その補正処理がブラウザのペイントに間に合わず一瞬チラつく問題をPR #36で`useLayoutEffect`化して緩和していた。

**SSR移行後は、サーバーが渡す`initialState`が最初から正しい（リクエストのクエリそのものから計算される）。** クライアント側で「マウント時に読み直して補正する」処理そのものが不要になり、それに付随していた`isFirstWrite`ガード（読み取りと書き込みの競合を避けるための仕組み）も丸ごと不要になる。結果として、以前より単純なフックになる。この経緯だけ`docs/ranking/url-sync/design.md`からも参照できるよう一言書いておく。

## `components/RankingApp.tsx`

`initialState: RankingState`をpropsに追加し、`useRankingState(companies, curves, initialState)`に渡す。それ以外の変更なし。

## SSR成果物のキャッシュ

データはビルド時に確定し、実行中は変わらない（更新は年1回、ADR-0001）。フィルタ済みURLごとの応答は「同じクエリなら常に同じ中身」なので、エッジでキャッシュしてよい。

- `next.config.ts`の`headers()`で`Cache-Control`（ブラウザ、1時間）と`Cloudflare-CDN-Cache-Control`（エッジ、1日・stale-while-revalidateで1週間）を設定する（前述）。
- **Cloudflareの既定のキャッシュ挙動はHTMLを自動でキャッシュしない場合がある。** 本番デプロイ後、`curl -I`で`CF-Cache-Status`ヘッダーを確認し、実際にキャッシュされているか検証する。
- されていない場合の候補: (a) `.open-next/worker.js`（ビルド成果物）の前段にCache API（`caches.default`）を使う薄いラッパーWorkerを挟み`wrangler.jsonc`の`main`をそちらに向ける、(b) Cloudflareダッシュボードでカスタムドメイン/Zoneを前提にCache Ruleを追加する。現在`*.workers.dev`のみで運用中のため、(b)はカスタムドメイン接続が前提になる可能性があり、その場合は別途ユーザー判断が必要。この設計・判断は実測後に本ドキュメントへ追記する。

## テスト方針

- `urlState.test.ts`: `searchParamsRecordToURLSearchParams`のテストを追加する。
  - 単純なキー・値の変換（`{ age: "45", ind: "銀行業" }` → `age=45&ind=銀行業`相当）。
  - 値が配列の場合は最初の要素を使う。
  - 値が`undefined`のキーは無視する。
- `useRankingState`自体は引き続きE2Eで実ブラウザの挙動を確認する（Reactフックの単体テストは重くしない方針、U5から継続）。
- E2E（`web/e2e/ranking-url-sync.spec.ts`）:
  - **新規: Playwrightの`request`フィクスチャ（ブラウザ・JS実行なしの生HTTPリクエスト）で`/?age=45&ind=銀行業`を取得し、レスポンスHTMLに絞り込み後の内容が含まれることを直接検証する。** これがSSR移行の核心的な効果（クローラーが見るHTMLが正しいこと）を固定するテストになる。以前のuseLayoutEffect修正では原理的に検証できなかった領域（`docs/ranking/url-sync/design.md`の追記参照）が、SSR化によって初めて自動テストで固定できるようになった。
    - **踏んだ罠: 単純な会社名の文字列検索では検証にならない。** `RankingApp`（`"use client"`）には`companies`/`curves`をpropsで渡しており、Next.jsはこの「クライアント側に渡すprops」を丸ごとハイドレーション用データとして`<script>`タグ内にシリアライズしてHTMLに埋め込む。つまり**フィルタの有無に関係なく、1,867社全件の生データが常にレスポンスHTMLのどこかに文字列として存在する**（クライアント側でフィルタを変更した際に再取得なしで再計算できるようにするための、SSR移行前から変わらない設計）。そのため`expect(html).not.toContain("キーエンス")`のような単純な文字列非包含チェックは常に失敗する（データが埋め込まれているだけで、実際に描画された表に含まれているわけではない）。**`<table>...</table>`の範囲だけを正規表現で取り出し、その中の`<tr`の数を数える**ことで、実際に描画された行数（＝クローラーが目にする可視コンテンツ）だけを検証するようにした。
  - 既存のAC-7直接オープンテスト・戻るボタンテスト・ネットワーク非発生テスト・カノニカル化テストは仕様として変わらないため、そのまま維持する（`initialState`の導入で内部実装は変わるが、外部から見た挙動は同じ）。

## Cloudflareダッシュボードの変更（ユーザー作業）

`docs/ranking/project-foundation/design.md`に詳細を追記する。要点だけここにも書く。

- ビルドコマンド: `npx wrangler deploy` を実行する前段として `npx opennextjs-cloudflare build` に変更する。
- デプロイコマンド: `npx wrangler deploy`（変更なし）。
- **マージ順序**: コード（このUnit）を先に`main`へマージし、そのあとダッシュボードのコマンドを更新する。逆順だと、まだ`output:'export'`のコードに対して`opennextjs-cloudflare build`が失敗する。コードを先にマージした場合、ダッシュボードが旧コマンドのままだと`next build`は成功するが`npx wrangler deploy`が`.open-next/worker.js`を見つけられず失敗する（Cloudflareは通常ビルド失敗時に直前の成功バージョンを配信し続けるため、本番は壊れない想定）。
