"""書類一覧を暦年ぶんキャッシュに温める。

`edinet.list_documents` は日付ごとに `cache/list_<date>.json` を作り、再実行では
再取得しない。一覧の取得は逐次だと遅いので、ここだけ並列で先に済ませておく。

**窓は暦年ぜんぶ**（平日のみ）。母集団は現行CSVの1,867社に固定されており、窓を
広げても母集団は変わらない——変わるのは「その会社がその年に出した有報を見つけ
られるか」だけである。**有報提出期（6/1〜7/10）に絞るとCOVID期の提出期限延長で
2020年の96社を取り逃がす**（T0 実測。`docs/timeseries/spec.md`）。

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

today = date.today()
days = []
for year in range(first_year, last_year + 1):
    day = date(year, 1, 1)
    # 未来日を投げても EDINET は 404 を返すだけなので、今日で打ち切る
    end = min(date(year, 12, 31), today)
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


# 一覧もZIPと同じ流量制限を共有する。6並列は429を招く（fetch_history.py 参照）。
with ThreadPoolExecutor(max_workers=3) as ex:
    list(ex.map(work, todo))

print(f"DONE fail={fail[0]} {time.time() - t0:.0f}s", flush=True)
