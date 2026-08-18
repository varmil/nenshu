## 対応 Issue

Closes #

<!-- Unit の PR は Unit Issue に紐づける（1 Unit = 1 Issue = 原則1 PR）。
     Issue を立てていない小さな変更（1コミットで終わる修正・ドキュメントのみ・依存更新）なら、
     この節に Issue が無い理由を1行書く。 -->

## 変更の要点

<!-- 何をどう変えたか。判断の理由は design.md・ADR に書き、ここからリンクする。 -->

## 動作チェック

<!-- 実行していない項目は消さずにチェックを外したまま残し、理由を添える。 -->

- [ ] `cd web && npm run typecheck && npm run lint && npm run build`
- [ ] `cd web && npm test`（パイプラインに変更があれば `cd pipeline && npm test` も）
- [ ] `cd web && npm run test:e2e`（見た目・機能に変更がある場合）
- [ ] ブラウザで実際に触って確認した（UI を持つ Unit。ブラウザ操作ツールが使えないセッションでは E2E の結果で代替してよい）
- [ ] `package.json` を変えたなら `package-lock.json` を同じコミットに含めた（`web/` は `npx npm@10.9.2 ci` が通ることまで確認）

## docs

- [ ] `docs/<施策>/<unit>/plan.md`・`design.md`（Unit の PR では必須）
- [ ] CLAUDE.md の「現在地」を実態に合わせた
- [ ] 不可逆な決定をしたなら `docs/adr/NNNN-*.md` を追加した
