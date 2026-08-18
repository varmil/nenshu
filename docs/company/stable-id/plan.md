# C0 企業IDの安定化 — plan.md

参照: Issue #51, `docs/adr/0006-public-url-strategy.md`, `docs/company/spec.md` §1.3

## Context

現行の `makeId`（`pipeline/scripts/lib/slug.ts`）は、証券コードを持たない107社に社名のASCII部分＋**書類ID**（EDINET書類管理番号）を振っている。**書類IDは毎年の有報提出で新しく振られる**ため、年1回のデータ更新のたびにこの107社のURLが変わる。

| 会社 | 現行のID |
| --- | --- |
| 株式会社みずほ銀行 | `s100yfah` |
| 株式会社ＪＥＲＡ | `jera-s100ycjz` |
| 株式会社日本政策投資銀行 | `s100ylav` |

非上場の事業会社を載せていることは `docs/ranking/intent.md` の差別化要因そのもので、みずほ銀行のような会社がまさにこの107社に入る。**最も価値のあるページのURLが毎年リセットされる**構成で企業詳細ページを公開するわけにいかない。C1（#52）の前に直す。

`edinet_code` 列は将来の `timeseries` 施策（#54・平均年収の10年推移）で年をまたぐ名寄せキーにもなる。

## 事前検証で確定した事実（実データで計測済み）

公開の EDINETコードリスト（`Edinetcode.zip`、APIキー不要、11,383社）と CSV 1,867行を実際に突合した。

| 経路 | 件数 |
| --- | ---: |
| 証券コードで一意に決まる | 1,757 |
| 社名で一意に決まる | 109 |
| 社名が複数候補 → 上場区分で絞れる | 1 |
| **未解決** | **0** |

- **証券コードだけでは足りない。** コードリストは現時点のスナップショットなので、上場廃止後に証券コードが外れた3社（広栄化学 4367・PALTAC 8283・養命酒製造 2540）が引けない。社名によるフォールバックが要る
- **社名が重複する行が2件ある。** CSV に「日本瓦斯株式会社」が2社（上場・小売業／非上場・電気・ガス業の鹿児島の会社）。コードリスト側も同名2件（`E03051` / `E04524`）なので、`listed` 列（上場区分）で絞る必要がある
- 出来上がるIDは **1,867件すべて一意**。証券コードを持たない107件はすべて `E` で始まる
- みずほ銀行 = `E03532`、JERA = `E34837`、日本政策投資銀行 = `E11701`

**ADR-0006 の却下案に事実誤認があった。** 「読み仮名辞書はEDINETコードリストにも無い」と書いたが、コードリストには `提出者名（ヨミ）` 列があり、11,383社すべてカタカナで埋まっている（`slug.ts` の docstring の記述を引き継いだ誤り）。決定そのものは変わらない——ローマ字化の規則を決める必要があることと、URLの可読性が順位に効く度合いが小さいことは変わらないため。却下の理由を実態に合わせて直す。

## 変更するもの

### パイプライン

- `pipeline/salary35/unified.py`
  - `HEADERS` に `edinet_code` を追加する
  - `backfill_edinet_code(rows)` を追加する。証券コード → 社名（正規化）→ 上場区分で絞り込み → 未割り当てのコードで絞り込み、の順に解決する。**解決できない行があれば社名を列挙して異常終了する**
  - `--backfill-edinet-code PATH` を追加する。EDINET から取り直さずに既存 CSV へ列を足す経路（`--from-csv` と同じ考え方）
  - EDINET から取り直す通常経路（`build()`）は `edinet.py` が既に `edinet_code` を record に入れているので、`HEADERS` に足すだけで埋まる
- `pipeline/scripts/lib/csv.ts` — `HEADER` に `edinet_code` を追加し、`UnifiedRow` に `edinetCode` を足す
- `pipeline/scripts/lib/slug.ts` — `makeId` を「証券コードがあればそれ、無ければEDINETコード、どちらも無ければ例外」にする。**書類ID由来のフォールバックを削除する。** docstring の読み仮名に関する記述も実態に合わせる
- `pipeline/scripts/build-data.ts` — `makeId` の呼び出し側の型が変わるだけ

### データ

- `pipeline/data/ranking_unified_2026.csv` に `edinet_code` 列を足して再生成
- `web/public/data/companies.json` を再生成（`id` の値が107件変わる）

### 仕様・記録

- `docs/adr/0006-public-url-strategy.md` — 却下案「読み仮名データを調達してローマ字スラッグにする」の理由を実態に合わせて直す
- `docs/company/spec.md` — AC-5 のみずほ銀行のIDを `E03532` に確定させる
- `docs/company/stable-id/design.md`（新規）

## テスト

`pipeline/scripts/build-data.test.ts` に追加する。

- 1,867件のIDが一意である
- 証券コードを持つ1,760件は `id === sec_code`
- 証券コードを持たない107件は `E` で始まる（`/^E[0-9]{5}$/`）
- キーエンス = `6861`・みずほ銀行 = `E03532`
- **書類ID由来のIDが1件も残っていない**（`/^s1[0-9a-z]{7}$/` に一致する `id` が0件）
- `makeId` は証券コードもEDINETコードも無ければ例外を投げる

Python 側は `unified.py` に自動テストが無いため、`--backfill-edinet-code` の結果を再現可能な形で検証する（下記「検証」3）。

**E2E は追加しない。** 見た目・機能に変更が無い Unit のため（`id` は React の `key` にしか使われていない）。既存のE2Eが緑のままであることが、変えていないことの確認になる。

## 検証

1. `cd pipeline && npm test`（build-data のテスト。上記の追加分を含む）
2. `cd web && npm run lint && npm run typecheck && npm test && npm run test:e2e` — **既存のテストが1件も落ちないこと**が完了条件
3. `python3 unified.py --backfill-edinet-code ../data/ranking_unified_2026.csv` を2回流して、2回目に差分が出ないこと（冪等）
4. `companies.json` の gzip サイズが100KB以内のままであること
5. `git diff` で CSV の変更が `edinet_code` 列の追加だけであること（他の列の値が動いていないこと）
6. PR（`Closes #51`）→ 問題が無ければマージ

## リスク

- **突合の誤りが静かに通る。** 同名の別会社に紐づけると、URLが別の会社を指したまま公開されてしまう。上場区分での絞り込みと「未解決なら異常終了」に加え、`git diff` で107件のEDINETコードを目視する
- **`Edinetcode.zip` は現時点のスナップショット。** 将来のデータ更新時に、その時点で上場廃止された会社が証券コードで引けなくなる可能性がある。社名フォールバックが効くので致命的ではないが、`--backfill-edinet-code` は毎回「未解決0件」を主張して落ちる作りにしておく
- **`companies.json` の107件の `id` が変わる。** 企業詳細ページはまだ公開していないので外部への影響は無い。この Unit を C1 より先に置いているのはそのため
