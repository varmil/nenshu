"""10年ぶんの有報CSVを、現行の母集団（1,867社）に限って取得する。

`fetch_all.py` は「その年の全提出者」を落とすが、10年に広げると 29,931件になる。
**現行CSVに載っている edinet_code に絞ると 17,763件**（40%減）で足りる。
時系列で見せたいのは掲載中の会社の推移であって、既に対象外の会社ではない。

ZIPは `cache/<docID>.zip` に置き、再実行では取りに行かない（`edinet.fetch_csv`）。
中断しても続きから走る。

  python3 fetch_history.py            # 全年
  python3 fetch_history.py 2017 2020  # 年を絞る
"""

import csv
import glob
import json
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import edinet

ROOT = Path(__file__).resolve().parent


def universe():
    """現行CSVの edinet_code。ここに無い会社は落とさない。"""
    codes = set()
    with open(ROOT / "../data/ranking_unified_2026.csv", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row.get("edinet_code"):
                codes.add(row["edinet_code"])
    return codes


def targets(codes, first_year, last_year):
    """キャッシュ済みの書類一覧から、落とすべき有報のメタを集める。

    同じ (edinet_code, 年) に複数件あるのは訂正報告などなので、docID の大きい方
    ＝後に提出されたものを採る。
    """
    best = {}
    for path in glob.glob(str(edinet.CACHE / "list_*.json")):
        year = int(Path(path).stem.split("_")[1][:4])
        if not (first_year <= year <= last_year):
            continue
        data = json.loads(Path(path).read_text())
        for r in data.get("results") or []:
            if r.get("docTypeCode") != "120" or r.get("withdrawalStatus") == "1":
                continue
            code = r.get("edinetCode")
            if code not in codes:
                continue
            key = (code, year)
            if key not in best or r["docID"] > best[key]["docID"]:
                best[key] = r
    return best


def main():
    first_year = int(sys.argv[1]) if len(sys.argv) > 1 else 2017
    last_year = int(sys.argv[2]) if len(sys.argv) > 2 else 2026

    codes = universe()
    best = targets(codes, first_year, last_year)
    metas = list(best.values())
    todo = [m for m in metas if not (edinet.CACHE / f"{m['docID']}.zip").exists()]
    print(f"母集団 {len(codes)}社 / 対象 {len(metas)}件 / 未取得 {len(todo)}件", flush=True)

    lock = threading.Lock()
    done = [0]
    fail = [0]
    t0 = time.time()

    def work(m):
        try:
            edinet.fetch_csv(m["docID"])
        except Exception as e:  # noqa: BLE001
            with lock:
                fail[0] += 1
            print(f"FAIL {m['docID']} {e}", flush=True)
        with lock:
            done[0] += 1
            if done[0] % 200 == 0:
                el = time.time() - t0
                eta = el / done[0] * (len(todo) - done[0])
                print(
                    f"{done[0]}/{len(todo)} fail={fail[0]} {el:.0f}s eta={eta / 60:.1f}min",
                    flush=True,
                )

    # 6並列は速いが EDINET の流量制限に当たる（実測で29%が429）。3並列に落とす。
    with ThreadPoolExecutor(max_workers=3) as ex:
        list(ex.map(work, todo))

    print(f"DONE fail={fail[0]} {(time.time() - t0) / 60:.1f}min", flush=True)


if __name__ == "__main__":
    main()
