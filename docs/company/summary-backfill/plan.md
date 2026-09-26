# C16 説明文の無い会社を減らす — plan.md

参照: Issue [#840](https://github.com/varmil/nenshu/issues/840)（親: [#158](https://github.com/varmil/nenshu/issues/158)）, `docs/company/spec.md` 1.18（AC-19〜AC-22）, [ADR-0010](../../adr/0010-company-summary-sourcing.md), `docs/company/company-summary/design.md`（C6）
依存: [#160](https://github.com/varmil/nenshu/issues/160)（C6）・[#161](https://github.com/varmil/nenshu/issues/161)（C7）

## Context

企業詳細ページの説明文は2,961社中178社に出ていない。1社（7371）は原文が取れておらず、
残る177社は C6 が rejected にした会社である。**177社の大半は原文が無いのではなく、
C6 の工程の側で落としていた。**

- 検証パスで落ちた93社・機械ゲートで落ちた18社は、1回落ちたらそのまま空にしていた。
  C6 には書き直しの工程が無い
- 生成側が空を返した66社は、大半が「事業の中身が原文に1文しか無い」会社だった。
  規格が2〜3文なので、1文しか書けない会社は空にしていた

出所（有報の「事業の内容」）・二段構えの検証・表示はどれも変えない。変えるのは規格の
文数と字数の下限と、書き直しの有無だけ。

## 進め方

1. **spec 1.18 と AC-19・AC-21 の規格を改める。** 「2〜3文・全角60〜130字」を
   「1〜3文・全角15〜130字」にする。**1文を認める条件（原文の事業の中身が1文ぶんしか
   無いとき）も spec に書く**——機械ゲートでは止められないので、規格として持っておかないと
   次に回す人が知らないまま緩める
2. **機械ゲートを先に直してテストで固める。** 1文の説明文が通ること・15字未満が落ちる
   ことを `test_gate.py` に足す。既存の回帰ケース（キーエンスの「ファブレス」）が
   落ちたままであることも確かめる
3. **工程に書き直しを足す。** 落ちた会社だけを、前回の文と落ちた理由を添えて生成側に
   戻す段を作り、上限2回を工程の側で数える（手で数えない）。**C6 で ok の2,783社を
   選ばないこと**を先にテストで固める——選べてしまうと、通っていた文が作り直しで
   変わりうる
4. **プロンプトを直す。** 1文でよい場合と、1文で済ませてはいけない場合を書き分ける。
   書き直しの入力（前回の文・落ちた理由）の読み方を足す。失敗の型①〜⑪の番号は変えない
5. **177社を回す。** 生成 → 機械ゲート → 検証 → 書き直し（2回まで）→ 取り込み。
   **エージェントの報告ではなくファイルで数える**（C6 で報告とファイルの食い違いが4回
   起きた）
6. **新しく付いた文を全件読む。** 見るのは型⑪（記載作法だけの文）と、原文に中身が
   あるのに1文で済ませた文。見つけたら落として回し直す
7. **web に流す。** `build:data` で `summaries.json` を作り直し、社数を固定している
   テストと、説明文の無い会社を例にしている E2E を直す。/about の「2〜3文」を実態に
   合わせる

## 着手前に見えている判断

**下限を15字にする。** 1文を認めると「化学品事業を営む。」（9字）のような業種名の
言い換えだけの文が通りうる。業種はページの別の場所に出ているので、読者は何も
受け取れない。ベリテの「宝飾品等の小売販売及び卸売販売を行う。」（19字）は通る線に置く。

**書き直しの上限は2回。** C9（#241）と同じ。通るまで直せるなら、検証パスは落とす
ことができなくなる。

**検証パスは書き直しでも原文の全文に対して独立に判定する。** 書き直しの文だけでなく、
前回の検証の結論も渡さない。

**事業の中身が原文に1文も無い会社は空のまま残す。** ENEOS（5020）は AC-20 の回帰
ケースで、ここで付いたら生成か検証のどちらかが壊れている。

## 検証

```bash
cd pipeline && npm test                                   # 機械ゲートと工程のテスト
cd pipeline/summary && python3 generate.py plan --rejected --size 60 --batches 3
（生成エージェントが work/gen_NNNN.jsonl を書く）
cd pipeline/summary && python3 generate.py gate
（検証エージェントが work/verify_NNNN.jsonl を書く）
cd pipeline/summary && python3 generate.py retry          # 落ちた会社だけ次の回へ（2回まで）
cd pipeline/summary && python3 generate.py merge && python3 generate.py status
cd pipeline && npm run build:data -- --out ../web/public/data
cd web && npm run typecheck && npm run lint && npm test && npm run build
cd web && npx playwright test e2e/company-summary.spec.ts e2e/company-page.spec.ts
```

- ENEOSホールディングス（5020）が rejected のままであること（AC-20）
- `company_summary_2026.csv` の差分に、C6 で ok だった行が1つも無いこと
- 付いた社数と rejected の理由ごとの件数が `merge` の出力に出ること
- `summaries.json` の gzip が 320KB 以内・`/` の HTML が変わらないこと
