---
name: Unit（実装単位）
about: overview.md で分解した Unit 1件。着手前に立てる。Issue が Unit の正
title: '[Unit] '
labels: unit
---

<!-- タイトルは [Unit] <ID> <名前>（例: [Unit] C1 企業詳細ページ v1）。
     ラベルは unit に加えて bolt-N を付ける。
     overview.md の Unit 一覧に無い Unit は、先に overview.md に足してから起票する。 -->

参照: <!-- spec の節と ADR。例: `docs/company/spec.md` AC-1〜AC-10, `docs/adr/0006-public-url-strategy.md` -->
依存: <!-- 先に完了している必要がある Unit の #番号。無ければ「なし」 -->
親: <!-- 元になった【親】Issue を `#123` の形で書く。この行を .github/workflows/link-sub-issue.yml が読んで
     sub-issue として紐づける（本文にリンクを書くだけでは紐づかない）。無ければ行ごと省略 -->

<!-- この Unit で何を出すかを1〜3行。
     なぜやるかは spec・intent に、どう作るかは plan.md・design.md にあるのでここには書かない。 -->

## 完了条件

<!-- spec.md の受け入れ基準に対応させ、チェックできる形（Given/When/Then でよい）で書く。
     ここがこの Unit の契約書であり、PR のマージ可否はこの一覧で判断する。 -->

- [ ] AC-1:
- [ ] AC-2:
- [ ] 見た目・機能に変更があるなら Unit テストと E2E の両方を残す（CLAUDE.md「開発上の約束」）

## 設計上の論点（あれば）

<!-- design.md で決めることのうち、着手前に見えているもの。
     design-system への昇格が絡むなら必ずここに書く（AI-DLC 運用ルール④）。 -->

## 非対象

<!-- この Unit で作らないもの。別 Issue に回すものはリンクする。 -->
