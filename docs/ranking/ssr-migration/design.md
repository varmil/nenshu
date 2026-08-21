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
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
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

### デプロイしてもエッジの古いHTMLは消えない（2026-08-21 に見直した）

**ここに書いていた「デプロイ直前にキャッシュされたURLは最大24時間ぶん古い内容を返し続ける」は、2026-08-21 時点では成立しない。** Workers Cache はキャッシュキーにWorkerのバージョンを含むため、デプロイのたびに空から始まる。プレビュー環境で対照実験して確認した（汚したエントリが、13分後のデプロイで消えた。同時刻の本番では残っていた）。実測と経緯は **ADR-0004「エッジはデプロイをまたがない」** にある。

当時の実測は次のとおり（記録として残す）。ADR-0005（推定式の変更）のデプロイ直後、Worker自体は新しいコードなのに `/?age=25` が `cf-cache-status: HIT` / `age: 519` で旧値の1,642万円を返し、キャッシュを避けるクエリを足すと新値の788万円が返った。同じ時点で `/about` は新しい内容だった。

**TTLは短くしない（ユーザー判断・2026-08-18／2026-08-21 に追認）。** データ更新は年1回、コードのデプロイも頻繁ではない。加えて、デプロイでキャッシュが空になる以上、`s-maxage` を下げてもデプロイの行き渡りは早くならない。下げれば Worker の呼び出し回数（無料枠100k req/day、CPU 10ms/req）を消費するだけになる。

表示金額が全面的に変わる変更をデプロイしたときは、**しばらく古い値が見えることを前提に確認する**こと。キャッシュを避けた確認には一意なクエリ文字列を足す。

```bash
curl -s "https://openreport.net/?age=25&cachebust=$RANDOM"
```

**なお、ブラウザ側のキャッシュは2026-08-21に無くした**（`max-age=3600` → `max-age=0, must-revalidate`）。デプロイ直後の全画面エラーの原因がこれだった。ADR-0004「なぜブラウザに持たせないか」を参照。

- `output: 'export'`を削除する。これがADR-0004の中核（ADR-0002を一部supersede）。
- ブラウザ向け`Cache-Control`とエッジ向け`Cloudflare-CDN-Cache-Control`を分ける。**ブラウザには持たせず（`max-age=0`）、エッジには1日（stale-while-revalidateで1週間）持たせる。** 規則の本体は`web/lib/cache/headers.ts`にあり、値と理由はADR-0004「キャッシュの設計」が正。
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

- `next.config.ts`の`headers()`で`Cache-Control`（ブラウザ、持たせない）と`Cloudflare-CDN-Cache-Control`（エッジ、1日・stale-while-revalidateで1週間）を設定する（前述）。規則の本体は`web/lib/cache/headers.ts`。
- **Cloudflareの既定のキャッシュ挙動はHTMLを自動でキャッシュしない場合がある。** 本番デプロイ後、`curl -I`で`CF-Cache-Status`ヘッダーを確認し、実際にキャッシュされているか検証する。

### 追記: 本番デプロイ後に判明した罠 — `Cache-Control`ヘッダーだけでは自動キャッシュされない

本番デプロイ直後、`curl -I`で`cache-control`・`cloudflare-cdn-cache-control`ヘッダーは意図通り付いていたが、**`CF-Cache-Status`ヘッダー自体が一切付いていなかった**（`HIT`/`MISS`/`DYNAMIC`いずれでもなく、ヘッダーごと存在しない）。`*.workers.dev`運用が原因かと疑ったが、Cloudflare公式ドキュメントでは`workers.dev`でもWorkers Cachingが動作すると明記されている。

**実際の原因: Cloudflareの自動エッジキャッシュ（Workers Caching）は、`wrangler.jsonc`側で明示的に有効化しないと機能しない。** `Cache-Control`レスポンスヘッダーを返すだけでは不十分で、`wrangler.jsonc`のトップレベルに`cache.enabled: true`を設定する必要がある（Wrangler 4.69.0以降が必要。本プロジェクトは4.123.0で満たす）。この設定により、Cloudflareがリクエストごとにまずキャッシュを確認し、ヒットすればWorkerを起動せずにキャッシュから直接返す（＝CPU時間・レイテンシの両方を削減する）。

```jsonc
{
  // ...
  "cache": {
    "enabled": true
  }
}
```

**修正**: `wrangler.jsonc`に`cache.enabled: true`を追加した。マージ後、本番で`CF-Cache-Status`が`HIT`になるか再確認する。

### 追記: OpenNext公式のキャッシュ機能の要否を確認（`https://opennext.js.org/cloudflare/caching`）

OpenNext Cloudflare adapterが提供するキャッシュ機構（Incremental Cache／R2・KV・D1・Workers Static Assets、Queue、Tag Cache、Cache Purge）を一通り確認したが、**いずれもNext.jsのISR（`revalidate`付きfetch）やオンデマンド再検証（`revalidateTag`/`revalidatePath`）のための仕組み**で、本サイトはどちらも使っていない（ランキングページは`searchParams`依存の完全動的レンダリングのみ）。そのため以下はすべて対象外と判断した。

- Incremental Cache（R2/KV/D1/Workers Static Assets）: ISR用のページキャッシュ。導入しない。
- Queue（Durable Object Queue等）: 時間ベースの再検証をさばく仕組み。導入しない。
- Tag Cache（D1/Durable Object Sharded）: `revalidateTag`/`revalidatePath`用。導入しない。
- Cache Purge: オンデマンド再検証時の自動パージ。導入しない（そもそもカスタムドメイン/Zoneが前提の機能でもある）。

**唯一、実際に効果がある発見: `_next/static/*`（JS/CSS/フォント等のハッシュ付きビルド成果物）はWorkerを経由せずAssetsバインディングから直接配信されるため、`next.config.ts`の`headers()`が一切効かない。** 本番で確認したところ、Cloudflareの既定値である`Cache-Control: public, max-age=0, must-revalidate`のままだった。ファイル名にコンテンツハッシュが含まれ同一URLの中身が変わることはないので、本来は無期限にキャッシュしてよい。

**修正**: `web/public/_headers`を新規作成し、`_next/static/*`に`Cache-Control: public, max-age=31536000, immutable`を設定した（OpenNext公式ドキュメントに記載の方法）。ローカルの`wrangler dev`で対象JSファイルに対し`Cache-Control`が意図通り付き、`CF-Cache-Status: HIT`になることを確認済み。

`public/data/companies.json`・`curves.json`も`public/`配下にあるため理論上は同じ経路で配信されうるが、実際にはビルド時の`import`でJSバンドルに直接埋め込まれており、実行時にこのURLへ独立してfetchするコードは存在しない（U5のE2E「フィルタ操作中にネットワークリクエストが発生しない」で検証済み）。事実上使われないURLのため、キャッシュ設定は追加しなかった。

## 本番デプロイ後のCPU時間の実測

本番デプロイ後、Cloudflareダッシュボードで CPU時間の中央値が235ms前後（Wall time・Request durationもほぼ同値の227ms）と表示された。Workers Free planのハードリミットは10ms/リクエストのため、額面どおりなら全リクエストが`Error 1102`で失敗するはずだが、**実際にはエラーは一件も発生していない。**

切り分けとして、ローカルで同じビルド成果物を実行して比較した。

- `next start`（Node、ウォームアップ後）: 18〜35ms
- `wrangler dev`（実際のworkerdランタイム、ウォームアップ後）: 20〜28ms

いずれもリクエスト単体の処理自体は10msに近いオーダーで、235msには遠く及ばない。CPU時間とWall timeがほぼ同値であることから待ち時間（I/O待ち）ではなく純粋な実行時間であることは分かるが、ローカルの「ウォーム」な計測とは大きく乖離している。

**現時点の見立て: 235msの大半はコールドスタート（isolateの初期化・スクリプトの解析/コンパイル）由来であり、リクエストハンドラ自体の実行時間ではない可能性が高い。** Cloudflareはisolateの起動用CPU予算をリクエスト単体の10ms上限とは別枠で確保しており、2024年以降200ms→400msに引き上げられている。Bolt 1時点はトラフィックが少なく、isolateが温まった状態を維持しにくいため、多くのリクエストが実質コールドスタートに近い状態で計測されている可能性がある。エラーが一件も発生していないことは、この見立てと整合する（実行時間そのものが10ms上限に抵触していれば確実にエラーになるはずだが、なっていない）。

**結論**: 現時点でWorkers Paid（月5ドル）への移行は不要と判断する。ただし実測に基づく確証ではなく推定であるため、今後トラフィックが増えて中央値の傾向が変わらないか、エラー率が上昇しないかは継続的に見ていく。前段のキャッシュ（`cache.enabled: true`）が効けば、キャッシュヒット時はWorker自体が起動しなくなるため、CPU時間の実測値も改善するはずで、キャッシュ確認と合わせて再測定する。

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
