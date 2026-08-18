"""全社を1つのランキングに統合する。

持株会社も事業会社も非上場の有報提出会社も、除外せず同じ表に載せる。
「単体カバー率」（単体従業員数 ÷ 連結従業員数）を列として持たせ、
その数字がグループの何割を映しているかを読者が自分で見られるようにする。

  python3 unified.py
"""

import csv
from datetime import date
from pathlib import Path

import curves
import edinet
import run

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)


# 単体従業員がこの人数に満たない会社は表に載せない。
# 数人しかいない持株会社が上位を埋めると、ランキングとして読めなくなる。
MIN_EMPLOYEES = 100


def badge(row):
    """その数字がグループの何を指しているかのラベル。"""
    ratio = row.get("emp_ratio")
    if ratio is None or ratio >= 0.1:
        return ""
    return "本社のみ"


def build():
    rows, curve_table = run.build(
        0, "年収", date(2026, 6, 1), date(2026, 7, 10), include_unlisted=True
    )
    run.fix_salary_typos(rows)

    ok = [r for r in rows
          if r["avg_salary"] and r["avg_age"]
          and 20 <= r["avg_age"] <= 65 and r["avg_salary"] > 1_000_000]

    for r in ok:
        nc = r.get("employees_nonconsolidated")
        c = r.get("employees_consolidated")
        r["emp_ratio"] = round(nc / c, 4) if (nc and c and c > 0) else None
        r["badge"] = badge(r)

    body = [r for r in ok if (r.get("employees_nonconsolidated") or 0) >= MIN_EMPLOYEES]
    return rebuild_derived(body, curve_table)


def rebuild_derived(rows, curve_table=None):
    """推定年収とそれに依存する列（salary35 / factor / 順位）を計算し直す。

    ここが CSV の派生列を作る唯一の場所。EDINET から取り直した直後（`build`）でも、
    既に手元にある CSV を式の変更に追随させるとき（`--from-csv`）でも同じ経路を通す。
    式が2箇所に分かれると、片方だけ直して静かに食い違う。
    """
    for r in rows:
        r["salary35"] = curves.estimate_salary(
            r["avg_salary"], r["avg_age"], 35.0, r["industry"], curve_table
        )
        # ADR-0005 では若い側が倍率で表せないので、実際に掛かった比率を入れる。
        r["factor"] = (
            round(r["salary35"] / r["avg_salary"], 4)
            if r["salary35"] and r["avg_salary"] else None
        )

    body = [r for r in rows if r["salary35"]]
    for i, r in enumerate(sorted(body, key=lambda r: -r["avg_salary"]), 1):
        r["rank_raw"] = i
    for i, r in enumerate(sorted(body, key=lambda r: -r["salary35"]), 1):
        r["rank_adj"] = i
    for r in body:
        r["rank_delta"] = r["rank_raw"] - r["rank_adj"]
    return sorted(body, key=lambda r: r["rank_adj"])


def load_csv(path):
    """既存の CSV を読む。派生列以外は文字列のまま持ち回して差分を最小にする。"""
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["avg_age"] = float(r["avg_age"])
        r["avg_salary"] = float(r["avg_salary"])
    return rows


HEADERS = ["rank_adj", "rank_raw", "rank_delta", "sec_code", "name", "tse33",
           "listed", "avg_age", "avg_tenure", "avg_salary", "salary35",
           "factor", "employees_nonconsolidated", "employees_consolidated",
           "emp_ratio", "badge", "industry", "source",
           "period_end", "doc_id"]


def save(rows, path=None):
    path = path or OUT / "ranking_unified.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADERS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    return path


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--from-csv",
        metavar="PATH",
        help="EDINET から取り直さず、既存の CSV の派生列（salary35・factor・順位）"
             "だけを今の式で計算し直す。推定式を変えたときに使う。",
    )
    args = ap.parse_args()

    if args.from_csv:
        # 読んだ CSV をその場で書き換える。列も行順も save() が決めるので揃う。
        rows = rebuild_derived(load_csv(args.from_csv))
        path = save(rows, Path(args.from_csv))
    else:
        rows = build()
        path = save(rows)
    print(f"\n統合ランキング {len(rows)}社（単体従業員{MIN_EMPLOYEES}人以上）→ {path}")
    print(f"  うち本社のみ（カバー率1割未満）: {sum(1 for r in rows if r['badge'])}社")
    print(f"  うち非上場: {sum(1 for r in rows if r['listed'] != '上場')}社")
    print("\n=== TOP25 ===")
    for r in rows[:25]:
        print(f"{r['rank_adj']:>3} ({r['rank_raw']:>4}) {r['name'][:24]:26} "
              f"{r['avg_age']:>4.1f}歳 {r['avg_salary']/1e4:>6.0f}万 → "
              f"{r['salary35']/1e4:>6.0f}万 {r['badge']}")
