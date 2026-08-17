# U5 URLクエリとの同期 — Unit実行プラン

## 参照

- Issue #6（完了条件の正）。参照: `docs/ranking/spec.md` §1.7, AC-7。依存: U3, U4
- `docs/ranking/ranking-table/design.md`（`useRankingState`の既存構造。「個々のsetterではなく単一のstate更新関数にし、U5のURL同期が1か所から状態を書き換えられるようにする」という設計意図がすでに埋め込まれている）

## 事前確認（済み）

- 実データで確認: 業種「銀行業」の絞り込み件数が82社（AC-7の記載と一致）。
- spec.md §1.7のURL例からバケット系フィルタは「範囲表記」でエンコードされる（`1000-`=1000以上、`-13`=13未満、`40-43`=40以上43未満）。U3で確定済みの閾値と完全に一致するのでそのまま転用できる。
- `output: 'export'`で`useSearchParams()`を使うには消費するコンポーネントを`<Suspense>`で囲む必要がある。
- 同一パス・クエリのみ変える`router.push`/`router.replace`はサーバーへの再フェッチを伴わない（`output:'export'`でも機能する）。実ブラウザでのE2Eで最終確認する。

## 確定事項（設計の骨子。詳細はdesign.mdへ）

- URLパラメータのエンコード/デコードは新規 `web/features/ranking/lib/urlState.ts` に、Reactに依存しない純粋関数として置く。
- パラメータ名は `age` / `ind` / `emp` / `ten` / `aage` / `q`（spec.mdのURL例のとおり）。
- **パラメータの並び順を状態に関わらず固定する（カノニカル化）。** 常に`age → ind → emp → ten → aage → q`の順で組み立て、フィルタを適用した順序に関係なく同じ絞り込みは常に同じURL文字列になるようにする。
- `useRankingState`の内部実装をURL同期に差し替える。公開シグネチャ（`state`・`setState`・`rankedCompanies`）は変えず、`RankingApp.tsx`は無変更。
- `query`のみの変更は`router.replace`＋300msデバウンス、それ以外は即座に`router.push`（1操作=1履歴エントリ）。
- `app/page.tsx`で`<RankingApp>`を`<Suspense>`で囲む。
- Bolt 2のパス設計（`/age/[age]/`・`/industry/[industry]/`・`/company/[id]/`）をこのUnitで確定し、`docs/ranking/overview.md`に追記する。

## 段取り

1. `docs/ranking/url-sync/design.md` を書く。
2. `web/features/ranking/lib/urlState.ts` を実装する。`urlState.test.ts`でAC-7相当・初期値省略・不正値の無視・パラメータ順序の決定性を固定する。
3. `web/features/ranking/hooks/useRankingState.ts` を書き換える（読み書き分離・デバウンス・重複防止）。
4. `app/page.tsx` に `<Suspense>` を追加する。
5. `docs/ranking/overview.md` にBolt 2のパス設計を追記する。
6. `npm run build`（`output:'export'`）が通ることを確認する。
7. Unitテスト・lint・typecheck。
8. 見た目・機能の変更なのでE2Eを書く: AC-7の直接オープン復元、戻るボタン、初期状態のURLが`/`のまま、フィルタ操作中にネットワークリクエストが発生しないこと。
9. Issue #6 の完了条件を一つずつ確認する。

## 依存

U3（フィルタ）・U4（検索）。ともに実装済み。

## リスク

- `useSearchParams`+`output:'export'`の組み合わせでビルドが通らない可能性 → 手順6で確認する。
- 読み書き両方向のuseEffectが無限ループ・余分な履歴エントリを生まないか → 手順3でURL文字列の同一性チェックを入れ、手順8のE2Eで確認する。
- クエリのみの`router.push`/`replace`が本当にネットワークを発生させないか → 手順8のE2Eで確認する。

## この後

続けて `docs/ranking/url-sync/design.md` を書いてから実装に入る。実装完了後は `CLAUDE.md`「Unit完了後の運用」に従い、動作チェック（Unit + E2E）→ Issue #6 に紐づけたPR → 問題なければマージする。
