#!/usr/bin/env python3
"""いまのデータを揺らす（refresh の D0・Issue #870）。

テストとビルドが、いまのデータの値を書き写していないかを確かめる道具。毎日の更新で
実際に起きることに寄せて、`pipeline/data/` と `web/public/data/logos.json` を
**その場で書き換える**。戻すのは呼び出し側（`tools/perturb/check.sh` が git で戻す）。

揺らし方（`docs/refresh/test-invariants/design.md`）:

1. 実測値の1位の会社を、全部のデータから消す
2. 全社の平均年収を、会社ごとに ±1〜9% 動かす（その書類の10年推移の行も同じだけ）
3. 新しい会社を2社足す。上場（証券コードあり）と非上場（EDINETコードだけ）を1社ずつ。
   10年推移はその年の1行だけで、ロゴ・働きやすさ・稼ぐ力・文章は持たない
4. 決算期がいちばん新しい会社の1社を、翌月の決算期の新しい書類に替える

**揺らさないもの。** 給与の決定方針のある会社の書類 ID（替えると D3 のガードで
ビルドが落ちる）と、掲載から外れた会社の横持ちデータの行（D9 が扱う）。どちらも
D0 の範囲の外で、ここで触るとそちらの失敗が混ざる。

**更新台帳（`pipeline/data/ledger.csv`・D2）も同じように動かす。** 足す2社の ID は
台帳の規則（`ledger.admit`）で振り、書類を替えた会社は台帳の数字の書類と提出日も替える。
1.で消す会社は台帳からも消す（毎日の更新では台帳の行は消えないが、ここで見たいのは
「1位の会社がデータにいない」ことで、24か月の猶予で外れる形にすると D9 の範囲に入る）。
"""

import csv
import json
import sys
import zlib
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "pipeline" / "data"
LOGOS = ROOT / "web" / "public" / "data" / "logos.json"

sys.path.insert(0, str(ROOT / "pipeline" / "salary"))
sys.path.insert(0, str(ROOT / "pipeline" / "ledger"))
import unified  # noqa: E402
import ledger  # noqa: E402

RANKING = DATA / "ranking_unified.csv"

# edinet_code で引く横持ちデータ。行ごと消すのは1. だけ。
BY_EDINET = [
    "salary_history.csv",
    "performance_history.csv",
    "company_summary.csv",
    "company_analysis.csv",
    "business_text.csv",
    "analysis_text_manifest.csv",
]


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return reader.fieldnames, list(reader)


def write_csv(path, fields, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def factor(edinet_code):
    """会社ごとに決まる倍率。**1.0 にはならない**——名指しされる会社の値も必ず動かす。"""
    h = zlib.crc32(edinet_code.encode())
    step = h % 9 + 1
    return 1 + (step if h & 0x100 else -step) / 100


def drop_top(rows, book):
    top = max(rows, key=lambda r: r["avg_salary"])
    rows.remove(top)
    edinet = top["edinet_code"]
    cid = book.pop(edinet)["id"]
    for name in BY_EDINET:
        path = DATA / name
        fields, side = read_csv(path)
        write_csv(path, fields, [r for r in side if r["edinet_code"] != edinet])
    fields, side = read_csv(DATA / "worklife.csv")
    write_csv(DATA / "worklife.csv", fields, [r for r in side if r["id"] != cid])
    policies = json.loads((DATA / "pay_policy.json").read_text(encoding="utf-8"))
    (DATA / "pay_policy.json").write_text(
        json.dumps([p for p in policies if p["edinet_code"] != edinet], ensure_ascii=False, indent=1)
        + "\n",
        encoding="utf-8",
    )
    logos = json.loads(LOGOS.read_text(encoding="utf-8"))
    if logos["byId"].pop(cid, None) is not None:
        logos["meta"]["withLogo"] -= 1
    logos["meta"]["count"] -= 1
    LOGOS.write_text(json.dumps(logos, ensure_ascii=False) + "\n", encoding="utf-8")
    return top, cid


def shift_salaries(rows, history):
    by_doc = {(h["edinet_code"], h["doc_id"]): h for h in history}
    for r in rows:
        f = factor(r["edinet_code"])
        r["avg_salary"] = float(round(r["avg_salary"] * f))
        h = by_doc.get((r["edinet_code"], r["doc_id"]))
        if h is not None and h["avg_salary"]:
            h["avg_salary"] = str(round(float(h["avg_salary"]) * f))


def add_companies(rows, history, book, as_of):
    """新しく載る会社。派生データを持たない会社が混ざっても落ちないことを見る。

    台帳には基準日（取得の窓の終わり）に提出した有報として入れる。
    """
    by_salary = sorted(rows, key=lambda r: r["avg_salary"])
    latest_year = max(int(h["year"]) for h in history)
    added = []
    for n, (src, sec, listed) in enumerate(
        [(by_salary[len(by_salary) // 2], "999Z", True), (by_salary[len(by_salary) // 3], "", False)],
        1,
    ):
        row = dict(src)
        row.update(
            sec_code=sec,
            name=f"揺らし検証用株式会社{n}",
            edinet_code=f"E9999{n}",
            corporate_number=f"999999999999{n}",
            doc_id=f"S1ZZZZ0{n}",
            badge="",
        )
        if not listed:
            row["listed"] = "非上場"
        rows.append(row)
        ledger.admit(
            book, edinet_code=row["edinet_code"], sec_code=sec, doc_id=row["doc_id"],
            filed=as_of, as_of=as_of,
        )
        history.append(
            {
                **{k: "" for k in history[0]},
                "edinet_code": row["edinet_code"],
                "year": str(latest_year),
                "avg_salary": str(round(row["avg_salary"])),
                "avg_age": str(row["avg_age"]),
                "avg_tenure": row["avg_tenure"],
                "employees_nonconsolidated": row["employees_nonconsolidated"],
                "source": "tag",
                "period_end": row["period_end"],
                "doc_id": row["doc_id"],
            }
        )
        added.append(row)
    return added


def next_month_end(period_end):
    y, m = int(period_end[:4]), int(period_end[5:7])
    y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    last = [31, 29 if y % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return f"{y:04d}-{m:02d}-{last:02d}"


def newer_period(rows, history, book, as_of):
    """1社を、いまのいちばん新しい決算期の翌月の決算期の、新しい書類に替える。

    選ぶのは給与の決定方針を持たない会社のうち決算期がいちばん新しい会社。いちばん新しい
    決算期の会社は、改正後の様式でほぼ全社が給与の決定方針を持っている。
    """
    policies = json.loads((DATA / "pay_policy.json").read_text(encoding="utf-8"))
    with_policy = {p["edinet_code"] for p in policies}
    original = [r for r in rows if not r["edinet_code"].startswith("E9999")]
    latest = max(r["period_end"] for r in original)
    target = max(
        (r for r in original if r["edinet_code"] not in with_policy),
        key=lambda r: (r["period_end"], r["edinet_code"]),
    )
    new_period, new_doc = next_month_end(latest), "S1ZZZZ09"
    for h in history:
        if h["edinet_code"] == target["edinet_code"] and h["doc_id"] == target["doc_id"]:
            h["period_end"], h["doc_id"] = new_period, new_doc
    target["period_end"], target["doc_id"] = new_period, new_doc
    # 数字の書類だけを替える。文章の工程は前の書類のまま（spec 1.5）
    ledger.admit(
        book, edinet_code=target["edinet_code"], sec_code=target["sec_code"], doc_id=new_doc,
        filed=as_of, as_of=as_of,
    )
    return target


def main():
    rows = unified.load_csv(RANKING)
    book = ledger.load()
    universe = json.loads((DATA / "universe.json").read_text(encoding="utf-8"))
    as_of = date.fromisoformat(universe["filingWindow"]["to"])
    top, top_id = drop_top(rows, book)

    hist_fields, history = read_csv(DATA / "salary_history.csv")
    shift_salaries(rows, history)
    added = add_companies(rows, history, book, as_of)
    moved = newer_period(rows, history, book, as_of)
    write_csv(DATA / "salary_history.csv", hist_fields, history)
    ledger.save(book)

    rows = unified.rebuild_derived(rows)
    unified.save(rows, RANKING)

    universe["published"] = len(rows)
    (DATA / "universe.json").write_text(
        json.dumps(universe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"消した: {top['name']}（{top_id}）")
    names = ", ".join(f"{r['name']}（{book[r['edinet_code']]['id']}）" for r in added)
    print(f"足した: {names}")
    print(f"決算期を {moved['period_end']} にした: {moved['name']}（{book[moved['edinet_code']]['id']}）")
    print(f"平均年収を ±1〜9% 動かした: {len(rows)}社")


if __name__ == "__main__":
    main()
