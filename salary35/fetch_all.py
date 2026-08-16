import json
import time
import threading
from concurrent.futures import ThreadPoolExecutor

import edinet

docs = json.load(open("cache/_docs.json"))
todo = [m for m in docs if not (edinet.CACHE / f"{m['docID']}.zip").exists()]
print(f"total={len(docs)} cached={len(docs)-len(todo)} todo={len(todo)}", flush=True)

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
        if done[0] % 100 == 0:
            el = time.time() - t0
            eta = el / done[0] * (len(todo) - done[0])
            print(f"{done[0]}/{len(todo)} fail={fail[0]} {el:.0f}s eta={eta:.0f}s",
                  flush=True)


with ThreadPoolExecutor(max_workers=6) as ex:
    list(ex.map(work, todo))

print(f"DONE fail={fail[0]} {time.time() - t0:.0f}s", flush=True)
