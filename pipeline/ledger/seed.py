"""いまの全社を台帳に写す（refresh の D2・#872）。**1度だけ回した**（2026-09-29）。

  cd pipeline/ledger && python3 seed.py

台帳が既にあれば何もしない。台帳ができた後は、毎日の取得（D4）と文章の工程（D6）が
行を書き換える——**作り直すと、その後に振った ID や反映した書類を失う。**

- **ID はいまの `companies.json` と同じものを写す**（ADR-0017 決定2）。振り方は
  `ledger.assign_id` を通すが、いまの全社でぶつかりは無いので、証券コードか EDINETコードの
  どちらかになる。変わる会社が1社でもあれば落とす
- **提出日は EDINET の書類一覧から引く。** `ranking_unified.csv` にあるのは書類 ID と決算期
  だけで、提出日は無い。取得の窓（`universe.json` の `filingWindow`）の一覧を読むので
  `EDINET_API_KEY` が要る（`salary/edinet.py`）。一覧はキャッシュに残る
- **工程ごとの書類は各成果物の書類 ID を写す。** 説明文は `company_summary.csv`（説明文が
  空の会社も、その書類で工程は回っている）、要約と分析は `company_analysis.csv`、給与の
  決定方針は `pay_policy.json`（本文が空の会社も含む）
"""

import csv
import json
import sys
from datetime import date, timedelta
from pathlib import Path

import ledger

DATA = ledger.ROOT.parent / "data"
sys.path.insert(0, str(ledger.ROOT.parent / "salary"))
import edinet  # noqa: E402

csv.field_size_limit(10**9)


def read_csv(name):
    with open(DATA / name, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def submitted_dates(start, end):
    """書類 ID → 提出日（`YYYY-MM-DD`）。窓の中の平日の一覧から（`edinet.annual_reports` と同じ日）。"""
    out = {}
    day = start
    while day <= end:
        if day.weekday() < 5:
            for r in edinet.list_documents(day).get("results") or []:
                if r.get("docID") and r.get("submitDateTime"):
                    out[r["docID"]] = r["submitDateTime"][:10]
        day += timedelta(days=1)
    return out


def main():
    if ledger.PATH.exists():
        print(f"{ledger.PATH} は既にあります。写し直さない。")
        return

    window = json.loads((DATA / "universe.json").read_text(encoding="utf-8"))["filingWindow"]
    start, end = date.fromisoformat(window["from"]), date.fromisoformat(window["to"])
    submitted = submitted_dates(start, end)

    rows = read_csv("ranking_unified.csv")
    description = {r["edinet_code"]: r["source_doc_id"] for r in read_csv("company_summary.csv")}
    analysis = {r["edinet_code"]: r["source_doc_id"] for r in read_csv("company_analysis.csv")}
    policies = json.loads((DATA / "pay_policy.json").read_text(encoding="utf-8"))
    pay_policy = {p["edinet_code"]: p["doc_id"] for p in policies}

    entries = {}
    taken = set()
    for r in rows:
        code = r["edinet_code"]
        filed = submitted.get(r["doc_id"])
        if filed is None:
            raise SystemExit(f"{r['name']}（{code}）の書類 {r['doc_id']} が窓の書類一覧にありません")
        company_id = ledger.assign_id(r["sec_code"], code, taken)
        if company_id != (r["sec_code"] or code):
            raise SystemExit(f"{r['name']} の ID が {r['sec_code'] or code} から {company_id} に変わります")
        taken.add(company_id)
        entries[code] = {
            "edinet_code": code,
            "id": company_id,
            "filed": filed,
            "doc_numbers": r["doc_id"],
            "doc_description": description.get(code, ""),
            "doc_analysis": analysis.get(code, ""),
            "doc_pay_policy": pay_policy.get(code, ""),
        }

    ledger.save(entries)
    filed = sorted(e["filed"] for e in entries.values())
    print(f"{ledger.PATH}: {len(entries)}社（提出日 {filed[0]} 〜 {filed[-1]}）")
    for col in ledger.DOC_COLUMNS:
        print(f"  {col}: {sum(1 for e in entries.values() if e[col])}社")


if __name__ == "__main__":
    main()
