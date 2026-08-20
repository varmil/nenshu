"""有報提出期（6/1〜7/10）の書類一覧を10年ぶんキャッシュに温める。

`edinet.list_documents` は日付ごとに `cache/list_<date>.json` を作り、再実行では
再取得しない。一覧の取得は逐次だと遅いので、ここだけ並列で先に済ませておく。

対象を6〜7月に絞るのは、既存の 1,867社が 3月期決算中心で、現行パイプライン
（run.py の既定 2026-06-01〜2026-07-10）が同じ窓で集めた母集団だからである。
窓を変えると母集団が変わってしまい、年をまたいだ比較にならない。

  python3 warm_lists.py 2017 2026
"""

import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import edinet

first_year = int(sys.argv[1]) if len(sys.argv) > 1 else 2017
last_year = int(sys.argv[2]) if len(sys.argv) > 2 else 2026

days = []
for year in range(first_year, last_year + 1):
    day = date(year, 6, 1)
    end = date(year, 7, 10)
    while day <= end:
        if day.weekday() < 5:  # 土日はまず提出がない
            days.append(day)
        day += timedelta(days=1)

todo = [d for d in days if not (edinet.CACHE / f"list_{d.isoformat()}.json").exists()]
print(f"対象 {len(days)}日 / 未取得 {len(todo)}日", flush=True)

lock = threading.Lock()
done = [0]
fail = [0]
t0 = time.time()


def work(d):
    try:
        edinet.list_documents(d)
    except Exception as e:  # noqa: BLE001
        with lock:
            fail[0] += 1
        print(f"FAIL {d} {e}", flush=True)
    with lock:
        done[0] += 1
        if done[0] % 25 == 0:
            el = time.time() - t0
            eta = el / done[0] * (len(todo) - done[0])
            print(f"{done[0]}/{len(todo)} fail={fail[0]} {el:.0f}s eta={eta:.0f}s", flush=True)


with ThreadPoolExecutor(max_workers=6) as ex:
    list(ex.map(work, todo))

print(f"DONE fail={fail[0]} {time.time() - t0:.0f}s", flush=True)
