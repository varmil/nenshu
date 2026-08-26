"""有報のZIPを取得する。抽出は `extract.py` が行う。

C5（#159・親 #158）。**新しい取得作業ではない。** 落とすのは
`ranking_unified_2026.csv` に載っている会社の、**その行が採った書類そのもの**で、
平均年間給与を拾ったのと同じ1件から「事業の内容」も出てくる。書類一覧
（`list_*.json`）は引き直さない。

キャッシュは `.gitignore` 済み（`pipeline/salary/cache/`）なので、そこに ZIP が
残っている環境ではこのスクリプトは1件もダウンロードしない（`docs/company/spec.md`
AC-18 の「再リクエストしない」）。まっさらなコンテナで走らせるときだけ取り直す。

  python3 fetch.py
"""

import csv
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "salary"))
import edinet  # noqa: E402

ROOT = Path(__file__).resolve().parent
UNIVERSE = ROOT / "../data/ranking_unified_2026.csv"


def targets():
    """母集団の `doc_id`。CSV に載っている順のまま返す。"""
    out = []
    with open(UNIVERSE, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row.get("doc_id"):
                out.append(row["doc_id"])
    return out


def main():
    docs = targets()
    todo = [d for d in docs if not (edinet.CACHE / f"{d}.zip").exists()]
    print(f"母集団 {len(docs)}社 / 未取得 {len(todo)}件", flush=True)

    lock = threading.Lock()
    done = [0]
    fail = [0]
    t0 = time.time()

    def work(doc_id):
        try:
            edinet.fetch_csv(doc_id)
        except Exception as e:  # noqa: BLE001
            with lock:
                fail[0] += 1
                print(f"  {doc_id} 失敗: {e}", flush=True)
            return
        with lock:
            done[0] += 1
            if done[0] % 200 == 0:
                el = time.time() - t0
                rate = done[0] / el if el else 0
                left = (len(todo) - done[0]) / rate if rate else 0
                print(
                    f"  {done[0]}/{len(todo)} 取得 "
                    f"（{rate:.1f}件/秒・残り約{left / 60:.0f}分・失敗{fail[0]}）",
                    flush=True,
                )

    # 並列は3まで。EDINETは流量制限に HTTP 200 で応えるので、増やすと
    # `fetch_csv` の PK 検査に落ちて待ち時間だけが増える（`edinet.py` の注記）。
    with ThreadPoolExecutor(max_workers=3) as ex:
        list(ex.map(work, todo))

    print(f"完了: 取得 {done[0]}件 / 失敗 {fail[0]}件 / {time.time() - t0:.0f}秒", flush=True)


if __name__ == "__main__":
    main()
