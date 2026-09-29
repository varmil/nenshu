"""数字の差分更新（refresh の D4・#874・`docs/refresh/numbers/design.md`）。

前回以降の書類一覧だけを読み、有報を出した会社の数字（平均年収・平均年齢・在籍年数・従業員数・
10年推移・稼ぐ力）を替える。新しく載る会社を足す。

  cd pipeline/refresh
  python3 update_numbers.py collect              # 昨日（日本時間）までの一覧を読み、書類を取って判定する
  （読み直しの会社があれば、work/reread/ の原文を読んで work/verdicts.json を書く）
  python3 update_numbers.py apply                # 判定を pipeline/data/ に反映する
  cd .. && npm run build:logos -- --only <新しく載った会社> \\
        && npm run build:data -- --out ../web/public/data && npm run build:brand

**2段に分けるのは、間に生成AIの読み直し（線 B）が入るため**（`docs/refresh/spec.md` 1.11）。
`collect` はネットワークを使うが `pipeline/data/` に書かない。`apply` は書くがネットワークを
使わない。

**線 A**（取得の失敗を疑う）: 書類一覧が1日でも取れなければ `collect` は何も書かずに止まる。
読んだ日（`universe.json` の `filingWindow.to`）を進めないので、次の回がそのままやり直す。
書類（ZIP）が取れない会社は待ち行列（`pipeline/data/numbers_pending.csv`）に残し、次の回で
取り直す——**書類一覧は読み直さないので、待ち行列に残さないと二度と拾えない。**
"""

import argparse
import csv
import json
import math
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PIPELINE = ROOT.parent
DATA = PIPELINE / "data"
WORK = ROOT / "work"

sys.path.insert(0, str(PIPELINE / "salary"))
sys.path.insert(0, str(PIPELINE / "ledger"))
sys.path.insert(0, str(PIPELINE / "performance"))
import curves  # noqa: E402
import edinet  # noqa: E402
import history  # noqa: E402
import ledger  # noqa: E402
import run  # noqa: E402
import unified  # noqa: E402
import extract as performance  # noqa: E402

RANKING = DATA / "ranking_unified.csv"
HISTORY = DATA / "salary_history.csv"
PERFORMANCE = DATA / "performance_history.csv"
UNIVERSE = DATA / "universe.json"
PENDING = DATA / "numbers_pending.csv"

JST = timezone(timedelta(hours=9))

# 線 B（読み違いを疑う）。**起点で、回しながら調整してよい**（spec 1.11・運営者）。
REREAD_CHANGE = 0.5  # ① 平均年収が前の期から ±50%
REREAD_TOP = 30  # ② 前の期の値が無い会社が上位30社（実測値）

# 待ち行列の理由。**次の回で取り直すもの**と、**知らせるだけのもの**に分かれる。
RETRY = {"fetch_failed", "reread"}
PENDING_COLUMNS = [
    "edinet_code",
    "doc_id",
    "sec_code",
    "name",
    "period_end",
    "filed",
    "reason",
    # 理由の中身（どの条件を割ったか・どの値が動いたか）。知らせ（D8）にそのまま載せる
    "detail",
    "since",
]


# ---------------------------------------------------------------------------
# 純関数（test_update_numbers.py が合成データで見る）


def jst_yesterday(now=None):
    """日本時間の昨日。**当日の一覧は読まない**——`edinet.list_documents` は正しい応答を期限なしで
    キャッシュするので、日中に当日を読むと、その後の提出が永久に欠ける。"""
    now = now or datetime.now(timezone.utc)
    return now.astimezone(JST).date() - timedelta(days=1)


def days_to_read(cursor, through):
    """`cursor` の翌日から `through` まで（両端を含む）の平日。**読んだ日は読み直さない**（AC-1）。

    土日を飛ばすのは、全件の取得（`edinet.annual_reports`）と同じ扱い。
    """
    days = []
    day = cursor + timedelta(days=1)
    while day <= through:
        if day.weekday() < 5:
            days.append(day)
        day += timedelta(days=1)
    return days


def pick_new_docs(results, filer_kind):
    """書類一覧の結果から、会社本体の有報を EDINETコードごとに1件へ寄せる。

    `filer_kind` は EDINETコード → 提出者種別。**内国法人・組合だけ**を残す（`run.build` と同じ）。
    寄せ方は `edinet.doc_rank`（期末が新しいほう、同じなら docID が大きいほう）。
    """
    best = {}
    for r in results:
        if not edinet.is_company_annual_report(r):
            continue
        code = r["edinetCode"]
        if filer_kind.get(code) != run.FILER_KIND:
            continue
        cur = best.get(code)
        if cur is None or edinet.doc_rank(r) > edinet.doc_rank(cur):
            best[code] = r
    return best


def should_process(meta, entry, current_row):
    """その書類を処理するか。台帳にある会社で、**同じ書類**か**期末が前の書類**なら処理しない。"""
    if entry is None:
        return True
    if meta["docID"] == entry["doc_numbers"]:
        return False
    if current_row is not None and (meta.get("periodEnd") or "") < current_row["period_end"]:
        return False
    return True


def reread_reason(rec, previous_salary, salaries):
    """線 B に掛かるなら理由、掛からなければ `None`（spec 1.11・AC-11）。

    - ① 前の期の値がある会社で、平均年収が ±50% を超えて動いた
    - ② 前の期の値が無い会社（新しく載る会社）が、実測値の上位30社に入る

    **「上位30社に新しく入った」は線にしない**（31位が30位に上がっただけで掛かる）。
    `salaries` はいまの全社の平均年収（この会社を除く）。
    """
    salary = rec["avg_salary"]
    if previous_salary:
        change = salary / previous_salary - 1
        if abs(change) > REREAD_CHANGE:
            return f"平均年収が前の期から{change:+.0%}"
        return None
    rank = sum(1 for s in salaries if s > salary) + 1
    if rank <= REREAD_TOP:
        return f"前の期の値が無く、実測値の{rank}位"
    return None


def ranking_row(rec, info):
    """CSV の1行（派生列は `unified.rebuild_derived` が埋める）。`info` はコードリストの1社。"""
    nc = rec.get("employees_nonconsolidated")
    c = rec.get("employees_consolidated")
    ratio = round(nc / c, 4) if (nc and c and c > 0) else None
    tse33 = info.get("tse33", "")
    row = {
        # 0 だけの証券コードは無いものとして扱う（`ledger.normalize_sec_code`）
        "sec_code": ledger.normalize_sec_code(rec.get("sec_code") or info.get("sec_code", "")),
        "name": rec.get("name") or info.get("name", ""),
        "tse33": tse33,
        "listed": info.get("listed", ""),
        "avg_age": rec["avg_age"],
        "avg_tenure": "" if rec.get("avg_tenure") is None else rec["avg_tenure"],
        "avg_salary": float(rec["avg_salary"]),
        "employees_nonconsolidated": "" if nc is None else nc,
        "employees_consolidated": "" if c is None else c,
        "emp_ratio": "" if ratio is None else ratio,
        "industry": curves.industry_of(tse33),
        "source": rec.get("source") or "",
        "period_end": rec.get("period_end") or "",
        "edinet_code": rec["edinet_code"],
        "corporate_number": info.get("corporate_number", ""),
        "doc_id": rec["doc_id"],
    }
    row["badge"] = unified.badge({"emp_ratio": ratio})
    return row


def upsert_ranking(rows, row):
    """同じ EDINETコードの行を差し替える。無ければ足す。"""
    for i, r in enumerate(rows):
        if r["edinet_code"] == row["edinet_code"]:
            rows[i] = row
            return
    rows.append(row)


def upsert_history(rows, rec, year):
    """10年推移の `(会社, 年)` の行を足すか差し替える。

    **値はランキングの行と同じ値**（`build-data.test.ts` が、ランキングの平均年収・年齢・勤続が
    推移のその年の値と一致することを全社で見ている）。年は**有報を提出した暦年**（T0 のまま）。
    同じ年に書類が2件あれば後から来たほう（docID が大きいほう）を採る——`fetch_history.targets` と同じ。
    """
    new = history.to_row({**rec, "year": year})
    for i, r in enumerate(rows):
        if r["edinet_code"] == rec["edinet_code"] and int(r["year"]) == year:
            if (r.get("doc_id") or "") > rec["doc_id"]:
                return
            rows[i] = {k: str(v) for k, v in new.items()}
            return
    rows.append({k: str(v) for k, v in new.items()})


def merge_performance(rows, code, year, parsed):
    """稼ぐ力の行に、1書類ぶん（最大5期）を合流させる。規則は `performance/extract.py` の `_put`
    のまま（連結を優先し、同じ基準なら遡りの少ないほう）。`rows` を書き換える。"""
    best = {(r["edinet_code"], int(r["year"])): r for r in rows}
    for r in best.values():
        r["back"] = int(r["back"])
    for back, value in sorted(parsed["oi"].items()):
        performance._put(best, code, year - back, value, "consolidated", back, year, parsed)
    for back, value in sorted(parsed["oi_nc"].items()):
        performance._put(best, code, year - back, value, "nonconsolidated", back, year, parsed)
    rows[:] = sorted(best.values(), key=lambda r: (r["edinet_code"], int(r["year"])))


def pending_row(meta, reason, since, detail=""):
    return {
        "edinet_code": meta["edinetCode"],
        "doc_id": meta["docID"],
        "sec_code": (meta.get("secCode") or "")[:4],
        "name": meta.get("filerName") or "",
        "period_end": meta.get("periodEnd") or "",
        "filed": (meta.get("submitDateTime") or "")[:10],
        "reason": reason,
        "detail": detail,
        "since": since,
    }


def meta_of_pending(row):
    """待ち行列の1行を、書類一覧の1件と同じ形に戻す（取り直しに使う）。"""
    return {
        "docID": row["doc_id"],
        "edinetCode": row["edinet_code"],
        "secCode": row["sec_code"],
        "filerName": row["name"],
        "periodEnd": row["period_end"],
        "submitDateTime": row["filed"],
        "docTypeCode": "120",
        "ordinanceCode": edinet.COMPANY_ORDINANCE,
    }


# ---------------------------------------------------------------------------
# ファイルの読み書き


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return reader.fieldnames, list(reader)


def write_csv(path, fields, rows, lineterminator="\r\n"):
    """**改行は元のファイルに合わせる。** 10年推移と稼ぐ力は `csv` の既定（CRLF）で書かれていて、
    変えると全行が差分になる。待ち行列は台帳と同じ LF。"""
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore", lineterminator=lineterminator)
        w.writeheader()
        w.writerows(rows)


def load_pending():
    if not PENDING.exists():
        return []
    return read_csv(PENDING)[1]


def load_universe():
    return json.loads(UNIVERSE.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# collect


def collect(through, extra_docs=()):
    """書類一覧を読み、書類を取って判定する。**`pipeline/data/` には書かない。**

    `extra_docs` は `(docID, 提出日)` の並び。一覧の読んだ日より前の書類を、手で拾い直すときに使う
    （書類の選び方の不具合で漏れていた会社など）。
    """
    universe = load_universe()
    cursor = date.fromisoformat(universe["filingWindow"]["to"])
    days = days_to_read(cursor, through)
    print(f"書類一覧を読む: {cursor + timedelta(days=1)} 〜 {through}（平日 {len(days)}日）")

    results = []
    for day in days:
        try:
            data = edinet.list_documents(day)
        except Exception as e:  # noqa: BLE001
            # 線 A: 1日でも取れなければ止める。読んだ日を進めないので次の回がやり直す。
            raise SystemExit(f"{day} の書類一覧が取れない: {e}。何も書かずに止める（線 A）")
        results += data.get("results") or []
    for doc_id, day in extra_docs:
        hits = [r for r in edinet.list_documents(day).get("results") or [] if r["docID"] == doc_id]
        if not hits:
            raise SystemExit(f"{doc_id} が {day} の書類一覧にありません")
        results += hits

    codelist = run.load_edinet_codelist()
    filer_kind = {code: info["kind"] for code, info in codelist.items()}
    new_docs = pick_new_docs(results, filer_kind)
    print(f"会社本体の有報: {len(new_docs)}社")

    entries = ledger.load()
    _, rows = read_csv(RANKING)
    by_code = {r["edinet_code"]: r for r in rows}

    # 待ち行列の取り直し。**新しい書類が来ていればそちらを採る**
    targets = {}
    for p in load_pending():
        if p["reason"] in RETRY and p["edinet_code"] not in new_docs:
            targets[p["edinet_code"]] = meta_of_pending(p)
    targets.update(new_docs)

    reference = unified.salary_reference()
    salaries = {r["edinet_code"]: float(r["avg_salary"]) for r in rows}
    collected = []
    WORK.mkdir(exist_ok=True)
    reread_dir = WORK / "reread"
    reread_dir.mkdir(exist_ok=True)
    for code, meta in sorted(targets.items()):
        entry = entries.get(code)
        if not should_process(meta, entry, by_code.get(code)):
            continue
        item = {"meta": {k: meta.get(k) for k in (
            "docID", "edinetCode", "secCode", "filerName", "periodEnd", "submitDateTime")}}
        try:
            path = edinet.fetch_csv(meta["docID"])
            parsed = edinet.parse_csv_zip(path)
        except Exception as e:  # noqa: BLE001
            item.update(status="fetch_failed", reason=str(e)[:200])
            collected.append(item)
            continue
        rec = edinet.to_record(meta, parsed)
        unified.resolve_ambiguous_salary([rec], reference)
        run.fix_salary_typos([rec])
        info = codelist.get(code, {})
        item["listed_in_ledger"] = entry is not None
        why = unified.ineligible_reason(rec)
        if why:
            item.update(status="not_eligible", reason=why)
            collected.append(item)
            continue
        item["row"] = ranking_row(rec, info)
        perf = performance.parse(path)
        item["performance"] = None if perf is None else {
            "oi": {str(k): v for k, v in perf["oi"].items()},
            "oi_nc": {str(k): v for k, v in perf["oi_nc"].items()},
            "emp_c": perf["emp_c"],
            "emp_nc": perf["emp_nc"],
        }
        previous = float(by_code[code]["avg_salary"]) if code in by_code else None
        others = [s for c, s in salaries.items() if c != code]
        reason = reread_reason(rec, previous, others)
        if reason:
            item.update(status="reread", reason=reason)
            text = parsed.get("employees_textblock") or ""
            (reread_dir / f"{code}.txt").write_text(
                f"# {rec.get('name')}（{code}）書類 {meta['docID']}・期末 {meta.get('periodEnd')}\n"
                f"# 読み取った値: 平均年間給与 {rec['avg_salary']:.0f}円・平均年齢 {rec['avg_age']}歳・"
                f"平均勤続 {rec.get('avg_tenure')}年・従業員（単体） {rec.get('employees_nonconsolidated')}人\n"
                f"# 前の期: {previous if previous is not None else 'なし'}・理由: {reason}\n\n{text}\n",
                encoding="utf-8",
            )
        else:
            item["status"] = "apply"
        collected.append(item)

    out = {"through": through.isoformat(), "items": collected}
    (WORK / "collected.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    counts = {}
    for item in collected:
        counts[item["status"]] = counts.get(item["status"], 0) + 1
    print(f"判定: {counts}")
    rereads = [i["meta"]["edinetCode"] for i in collected if i["status"] == "reread"]
    if rereads:
        print(f"読み直しが要る会社（{len(rereads)}社）: work/reread/ の原文を読み、work/verdicts.json を書く")
    return out


# ---------------------------------------------------------------------------
# apply


def load_verdicts():
    path = WORK / "verdicts.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def apply(collected, verdicts, today):
    """判定を `pipeline/data/` に反映する。ネットワークを使わない。"""
    through = date.fromisoformat(collected["through"])
    entries = ledger.load()
    fields, rows = read_csv(RANKING)
    for r in rows:
        r["avg_salary"] = float(r["avg_salary"])
        r["avg_age"] = float(r["avg_age"])
    hist_fields, hist = read_csv(HISTORY)
    perf_fields, perf = read_csv(PERFORMANCE)
    pending = {p["edinet_code"]: p for p in load_pending()}

    applied, added = [], []
    for item in collected["items"]:
        meta = item["meta"]
        code = meta["edinetCode"]
        status = item["status"]
        if status == "reread":
            verdict = verdicts.get(code) or {}
            if verdict.get("doc_id") == meta["docID"] and verdict.get("verdict") == "confirmed":
                status = "apply"
            elif verdict.get("doc_id") == meta["docID"] and verdict.get("verdict") == "unresolved":
                status = "unresolved"
        if status == "not_eligible" and not item.get("listed_in_ledger"):
            # 載っていない会社が条件を満たさないのは、全件の取得で落としていたのと同じで、知らせる
            # ことが無い。待ち行列に入れると、条件を満たさない新しい会社の数だけ毎日ふくらむ
            continue
        if status != "apply":
            # 同じ書類が待ち行列に居続けるなら、最初に入った日を残す（何日待っているかが読める）
            old = pending.get(code) or {}
            since = old["since"] if old.get("doc_id") == meta["docID"] else today.isoformat()
            detail = item.get("reason") or ""
            if status == "unresolved":
                detail = (verdicts.get(code) or {}).get("note") or detail
            pending[code] = pending_row(meta, status, since, detail)
            continue

        filed = date.fromisoformat((meta.get("submitDateTime") or "")[:10])
        entry = ledger.admit(
            entries,
            edinet_code=code,
            sec_code=(meta.get("secCode") or "")[:4],
            doc_id=meta["docID"],
            filed=filed,
            as_of=through,
        )
        if entry is None:
            pending[code] = pending_row(
                meta, "not_eligible", today.isoformat(), f"提出日 {filed} が直近12か月の外"
            )
            continue
        row = item["row"]
        is_new = not item.get("listed_in_ledger")
        upsert_ranking(rows, row)
        # 在籍年数は 0 年がありうる（`history.to_row` の注記）ので、空欄だけを None にする
        upsert_history(
            hist, {**row, "avg_tenure": None if row["avg_tenure"] == "" else row["avg_tenure"]}, filed.year
        )
        if item.get("performance"):
            p = item["performance"]
            parsed = {
                "oi": {int(k): v for k, v in p["oi"].items()},
                "oi_nc": {int(k): v for k, v in p["oi_nc"].items()},
                "emp_c": p["emp_c"],
                "emp_nc": p["emp_nc"],
            }
            merge_performance(perf, code, filed.year, parsed)
        pending.pop(code, None)
        (added if is_new else applied).append((entry["id"], row["name"]))

    rows = unified.rebuild_derived(rows)
    unified.save(rows, RANKING)
    hist.sort(key=lambda r: (r["edinet_code"], int(r["year"])))
    write_csv(HISTORY, hist_fields, hist)
    write_csv(PERFORMANCE, perf_fields, perf)
    ledger.save(entries)
    write_csv(
        PENDING, PENDING_COLUMNS, sorted(pending.values(), key=lambda r: r["edinet_code"]), "\n"
    )

    universe = load_universe()
    universe["filingWindow"] = {
        "from": ledger.add_months(through, -12).isoformat(),
        "to": through.isoformat(),
    }
    universe["published"] = len(rows)
    UNIVERSE.write_text(json.dumps(universe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"数字を替えた: {len(applied)}社・新しく載った: {len(added)}社・待ち行列: {len(pending)}件")
    for company_id, name in added:
        print(f"  新しく載った: {company_id} {name}")
    if added:
        print("ロゴ: npm run build:logos -- --only " + ",".join(i for i, _ in added))
    return applied, added


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("collect")
    c.add_argument("--through", help="読む最後の日（YYYY-MM-DD）。既定は日本時間の昨日")
    c.add_argument(
        "--doc",
        action="append",
        default=[],
        metavar="DOCID:YYYY-MM-DD",
        help="読んだ日より前の書類を拾い直す（書類 ID と提出日）",
    )
    sub.add_parser("apply")
    args = ap.parse_args()

    if args.cmd == "collect":
        through = date.fromisoformat(args.through) if args.through else jst_yesterday()
        extra = [(d.split(":")[0], date.fromisoformat(d.split(":")[1])) for d in args.doc]
        collect(through, extra)
    else:
        path = WORK / "collected.json"
        if not path.exists():
            raise SystemExit("work/collected.json がありません。先に collect を回すこと")
        collected = json.loads(path.read_text(encoding="utf-8"))
        apply(collected, load_verdicts(), datetime.now(JST).date())


if __name__ == "__main__":
    main()
