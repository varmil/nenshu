"""有報のZIPを取得する。抽出は `extract.py` が行う。

**新しい取得作業ではない。** T0（#74）が10年ぶんの有報を `cache/` に落としているので、
そのキャッシュが生きている環境ではこのスクリプトは1件もダウンロードしない。
キャッシュは `.gitignore` 済み（`pipeline/salary/cache/`）なので、まっさらな
コンテナで走らせるときだけ取り直しが要る。

**落とす対象は `salary_history.csv` の `doc_id`。** T0 が既に「どの会社のどの年が
どの書類か」を確定させてあるので、書類一覧（`list_*.json`）を引き直さない。

  python3 fetch.py             # 全年（2017〜2026）
  python3 fetch.py 2026 2026   # 年を絞る
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
HISTORY = ROOT / "../data/salary_history.csv"


def targets(first_year, last_year):
    """`salary_history.csv` から (edinet_code, year, doc_id) を集める。"""
    out = []
    with open(HISTORY, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            year = int(row["year"])
            if not (first_year <= year <= last_year):
                continue
            if not row.get("doc_id"):
                continue
            out.append((row["edinet_code"], year, row["doc_id"]))
    return out


def main():
    first_year = int(sys.argv[1]) if len(sys.argv) > 1 else 2017
    last_year = int(sys.argv[2]) if len(sys.argv) > 2 else 2026

    metas = targets(first_year, last_year)
    todo = [m for m in metas if not (edinet.CACHE / f"{m[2]}.zip").exists()]
    print(f"対象 {len(metas)}件 / 未取得 {len(todo)}件", flush=True)

    lock = threading.Lock()
    done = [0]
    fail = [0]
    t0 = time.time()

    def work(m):
        try:
            edinet.fetch_csv(m[2])
        except Exception as e:  # noqa: BLE001
            with lock:
                fail[0] += 1
                print(f"  {m[2]} 失敗: {e}", flush=True)
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
