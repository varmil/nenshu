"""証券コードを持たない有報提出会社（持株会社傘下の事業会社など）も取る。

みずほ銀行・三井住友銀行・三菱UFJ銀行のような事業会社は、上場しておらず
証券コードを持たないが有価証券報告書は提出している。持株会社の単体数字は
グループの実態を表さないので、事業会社側の数字を拾う必要がある。
"""

import glob
import json
import time
import threading
from concurrent.futures import ThreadPoolExecutor

import edinet

res = []
for f in glob.glob("cache/list_*.json"):
    d = json.load(open(f))
    res += [r for r in (d.get("results") or []) if r.get("docTypeCode") == "120"]

# 証券コードなし、かつ内国法人（外国の銀行・国際機関は転職先ではないので落とす）
nosec = [r for r in res if not r.get("secCode") and r.get("edinetCode", "").startswith("E")]
uniq = {}
for r in nosec:
    uniq[r["edinetCode"]] = r          # 同一社の重複提出は後勝ち
docs = list(uniq.values())
json.dump(docs, open("cache/_docs_unlisted.json", "w"), ensure_ascii=False)
print(f"証券コードなしの有報: {len(docs)}社", flush=True)

todo = [m for m in docs if not (edinet.CACHE / f"{m['docID']}.zip").exists()]
print(f"未取得 {len(todo)}件", flush=True)

lock = threading.Lock()
done = [0]
t0 = time.time()


def work(m):
    try:
        edinet.fetch_csv(m["docID"])
    except Exception as e:  # noqa: BLE001
        print(f"FAIL {m['docID']} {e}", flush=True)
    with lock:
        done[0] += 1
        if done[0] % 100 == 0:
            print(f"{done[0]}/{len(todo)} {time.time()-t0:.0f}s", flush=True)


with ThreadPoolExecutor(max_workers=6) as ex:
    list(ex.map(work, todo))
print(f"DONE {time.time()-t0:.0f}s", flush=True)
