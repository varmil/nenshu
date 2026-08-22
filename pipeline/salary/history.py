"""キャッシュ済みの有報CSVから、年ごとの平均年間給与を抜いて年次CSVにする。

出力: pipeline/data/salary_history.csv
  edinet_code, year, avg_salary, avg_age, employees_nonconsolidated, source, period_end, doc_id

抽出は `edinet.parse_csv_zip` / `to_record` と `run.fix_salary_typos` をそのまま使う。
**式も抽出ロジックも書き写さない**——写すと片方の変更を取り逃す（現行CSVを作った
run.py と同じ関数で抜くからこそ、2026年の値が companies.json と一致することを
テストで固定できる）。

`fix_salary_typos` を通すのを忘れると、有報側の桁ズレ（千円単位の数字を円の欄に
入れている会社が実際にある）がそのまま残る。2026年で3社ぶんずれて気づいた。

  python3 history.py              # 全年
  python3 history.py 2017 2020    # 年を絞る
"""

import csv
import math
import statistics
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import edinet
import fetch_history
import run

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "../data/salary_history.csv"

COLUMNS = [
    "edinet_code",
    "year",
    "avg_salary",
    "avg_age",
    "employees_nonconsolidated",
    "source",
    "period_end",
    "doc_id",
]


def extract(item):
    """1書類を展開して素のレコードにする。桁ズレの補正はまだかけない
    （`fix_salary_typos` は行のリストを受けるので、全件そろってから一度に通す）。"""
    (code, year), meta = item
    path = edinet.CACHE / f"{meta['docID']}.zip"
    if not path.exists():
        return None
    rec = edinet.to_record(meta, edinet.parse_csv_zip(path))
    if rec.get("avg_salary") is None:
        return None
    rec["year"] = year
    rec["edinet_code"] = code
    return rec


def to_row(rec):
    """CSV に書く形にする。`avg_salary` が None のものは呼ぶ前に落とす。"""
    return {
        "edinet_code": rec["edinet_code"],
        "year": rec["year"],
        "avg_salary": math.floor(rec["avg_salary"] + 0.5),
        "avg_age": rec.get("avg_age") or "",
        "employees_nonconsolidated": rec.get("employees_nonconsolidated") or "",
        "source": rec.get("source") or "",
        "period_end": rec.get("period_end") or "",
        "doc_id": rec.get("doc_id") or "",
    }



def resolve_candidates(recs):
    """読み方が割れた年を、**同じ会社の曖昧さの無い年**を基準に選び直す。

    2019年以降は平均年間給与が XBRL でタグ付けされていて一意に読める。
    2017・2018年は本文から拾うしかなく、区切りの無いセルでは
    `34.09.924,320,256` が「9.9 / 2,432万」とも「9.92 / 432万」とも読める。
    **1書類の中では決まらない**（`textblock._best` のコメント参照）ので、
    その会社の他の年に近いほうを採る。基準が無い会社は先頭の候補のままにする。
    """
    by_code = {}
    for r in recs:
        by_code.setdefault(r["edinet_code"], []).append(r)

    swapped = 0
    for rows in by_code.values():
        anchor = [r["avg_salary"] for r in rows
                  if r.get("source") == "tag" and r.get("avg_salary")]
        if not anchor:
            anchor = [r["avg_salary"] for r in rows
                      if not r.get("salary_candidates") and r.get("avg_salary")]
        if not anchor:
            continue
        ref = statistics.median(anchor)
        for r in rows:
            cands = r.get("salary_candidates")
            if not cands:
                continue
            pick = min(cands, key=lambda v: abs(math.log(v / ref)))
            if pick != r["avg_salary"]:
                r["avg_salary"] = pick
                swapped += 1
    return swapped


def main():
    first_year = int(sys.argv[1]) if len(sys.argv) > 1 else 2017
    last_year = int(sys.argv[2]) if len(sys.argv) > 2 else 2026

    codes = fetch_history.universe()
    best = fetch_history.targets(codes, first_year, last_year)
    items = sorted(best.items(), key=lambda kv: (kv[0][0], kv[0][1]))
    print(f"対象 {len(items)}件 を展開", flush=True)

    lock = threading.Lock()
    done = [0]
    t0 = time.time()

    def work(item):
        try:
            row = extract(item)
        except Exception as e:  # noqa: BLE001
            print(f"FAIL {item[0]} {e}", flush=True)
            row = None
        with lock:
            done[0] += 1
            if done[0] % 2000 == 0:
                print(f"{done[0]}/{len(items)} {time.time() - t0:.0f}s", flush=True)
        return row

    # ZIPの展開はCPU寄りだがGILの外（zlib）で回るので、並列にすると実測で効く。
    with ThreadPoolExecutor(max_workers=8) as ex:
        recs = [r for r in ex.map(work, items) if r]

    # 読み方が割れた年を、同じ会社の他の年を基準に選び直す。
    swapped = resolve_candidates(recs)
    ambiguous = sum(1 for r in recs if r.get("salary_candidates"))
    print(f"候補が割れた書類 {ambiguous}件 / 年をまたいで選び直した {swapped}件", flush=True)

    # 現行パイプラインと同じ桁ズレ補正を通す（run.py と同じ関数を呼ぶ）。
    # 直せなかったものは avg_salary が None になるので、ここで落とす。
    fixed = run.fix_salary_typos(recs)
    dropped = [r for r in fixed if r.get("avg_salary") is None]
    print(f"桁ズレ補正 {len(fixed)}件（うち除外 {len(dropped)}件）", flush=True)

    rows = [to_row(r) for r in recs if r.get("avg_salary") is not None]
    rows.sort(key=lambda r: (r["edinet_code"], r["year"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)

    # 年ごとの取得状況（design.md に残す実測値）
    by_year = {}
    for r in rows:
        y = r["year"]
        slot = by_year.setdefault(y, {"n": 0, "tag": 0, "textblock": 0})
        slot["n"] += 1
        if r["source"] in slot:
            slot[r["source"]] += 1

    print(f"\n{OUT.resolve()}: {len(rows)}行 ({time.time() - t0:.0f}s)")
    print("\nyear  社数   tag  textblock")
    for y in sorted(by_year):
        s = by_year[y]
        print(f"{y}  {s['n']:5d} {s['tag']:5d} {s['textblock']:9d}")


if __name__ == "__main__":
    main()
