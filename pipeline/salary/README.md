# salary — 有報の年収データセット

有価証券報告書の平均年間給与を集め、賃金カーブと合わせて `pipeline/data/ranking_unified_2026.csv`（1,867社）と `pipeline/data/salary_history.csv`（10年ぶん）を作る。

**ディレクトリ名は「作るデータセット」で、データ源ではない。** ここは EDINET と e-Stat の2つを使うので、ソース名では切れない。ソースはファイル名が表す（`edinet.py` / `fetch_estat.py`）。

**旧名は `salary35`。** 35歳時点が既定の表示だった頃の名前で、ADR-0007 で既定が実測値になった時点で実態と合わなくなったため W0（Issue #149）で改名した。**CSV の `salary35` 列は改名していない**——「35歳時点の推定年収」を正しく指しており、`pipeline/scripts/build-data.test.ts` が Python と TypeScript の実装一致を全1,867社で固定している。

## 使い方

```bash
export EDINET_API_KEY=xxxxxxxx      # または salary/.edinet_key に書く
python3 unified.py                                            # EDINET から取り直して全社を統合
python3 unified.py --from-csv ../data/ranking_unified_2026.csv  # 推定式を変えたとき、派生列だけ計算し直す
python3 unified.py --backfill-edinet-code    ../data/ranking_unified_2026.csv
python3 unified.py --backfill-corporate-number ../data/ranking_unified_2026.csv
```

**推定式を変えたら Python（`curves.py` の `estimate_salary`）と TypeScript（`web/features/ranking/lib/salary.ts`）の両方を直し、`--from-csv` で CSV の派生列を作り直してから `npm run build:data` を回す。** EDINET から取り直す必要はない（`salary35` は `avg_salary` / `avg_age` / `industry` だけから決まる）。

## データソース

**有報**は EDINET API v2 の CSV形式（type=5）から取る。APIキーが必須で、無料登録で発行される（https://api.edinet-fsa.go.jp/api/auth/index.aspx ）。抜き出すのは平均年間給与・平均年齢・平均勤続年数・従業員数（単体と連結）。

**EDINETコードリスト**（`Edinetcode.zip`）はAPIキー不要。業種・上場区分・証券コード・**提出者法人番号**が入っている。法人番号は女性活躍DBとの突合キー（ADR-0009）、EDINETコードは公開URLと年次データの名寄せキー（ADR-0006）。

**賃金カーブ**は厚生労働省「賃金構造基本統計調査」を e-Stat から取り、`pipeline/data/annual_curves.json` に置く（`fetch_estat.py`）。年1回しか更新されない。

## 補正のしかた

ADR-0005 の2点モデル。目標年齢が平均年齢より下では、その会社の賃金カーブが「22歳＝業種平均の水準」と「平均年齢＝実測の平均年間給与」の2点を通ると置いて間を業種カーブの形で結ぶ。平均年齢より上は倍率一定（ADR-0003）。

**Python の `round()` は偶数丸めで JavaScript の `Math.round` と違う**ので、Python 側は `floor(x+0.5)` を使う。

## 持株会社の扱い

有報の平均年間給与は提出会社単体の数字で、連結子会社の社員は入らない。単体従業員数が連結の10%未満（かつ連結500人以上）の会社に「本社のみ」バッジを立て、ランキングには載せたまま注記で区別する。

## ファイル

| ファイル | 中身 |
| --- | --- |
| `curves.py` | 賃金カーブ、東証33業種のマッピング、補間、推定式 |
| `edinet.py` | EDINET API クライアント、CSV形式のパーサ、拾うテキストブロックの表（`TEXT_BLOCKS`） |
| `textblock.py` | 「従業員の状況」本文からの抽出（2019年以前はタグが無い） |
| `businesstext.py` | 「事業の内容」本文を平文にする（C5・#159。使うのは `pipeline/summary/`） |
| `test_*.py` | 単体テスト。`npm --prefix pipeline test` から走る（`test:py`） |
| `run.py` | 取得・補正・EDINETコードリストの読み込み |
| `unified.py` | 全社の統合と派生列。CSV の書き出し |
| `fetch_estat.py` | e-Stat から賃金カーブを作る |
| `warm_lists.py` / `fetch_history.py` / `history.py` | 10年推移（timeseries 施策・T0） |
| `cache/` | ダウンロード済みの書類一覧とZIP（gitignore） |
| `out/` | 作業用の書き出し先（gitignore） |

**同じ書類を別のデータセットも読む。** 「事業の内容」は `pipeline/summary/`（会社説明文・C5〜C7）、経常利益と従業員数は `pipeline/performance/` が、どちらもここの `cache/` と `edinet.py` を使って読む。**取得の窓とキャッシュはここが正**で、あちらは書類一覧を引き直さない。
