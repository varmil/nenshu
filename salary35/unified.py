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

    fit = run.fit_curve_from_data(ok)
    for r in ok:
        f = curves.age_factor(r["avg_age"], 35.0, r["industry"], curve_table)
        r["factor"] = round(f, 4) if f else None
        r["salary35"] = round(r["avg_salary"] * f) if f else None
        if fit:
            r["salary35_fit"] = round(r["avg_salary"] * run.fitted_factor(fit, r["avg_age"]))
        nc = r.get("employees_nonconsolidated")
        c = r.get("employees_consolidated")
        r["emp_ratio"] = round(nc / c, 4) if (nc and c and c > 0) else None
        r["badge"] = badge(r)

    body = [r for r in ok if r["salary35"]
            and (r.get("employees_nonconsolidated") or 0) >= MIN_EMPLOYEES]
    for i, r in enumerate(sorted(body, key=lambda r: -r["avg_salary"]), 1):
        r["rank_raw"] = i
    for i, r in enumerate(sorted(body, key=lambda r: -r["salary35"]), 1):
        r["rank_adj"] = i
    for r in body:
        r["rank_delta"] = r["rank_raw"] - r["rank_adj"]
    return sorted(body, key=lambda r: r["rank_adj"])


HEADERS = ["rank_adj", "rank_raw", "rank_delta", "sec_code", "name", "tse33",
           "listed", "avg_age", "avg_tenure", "avg_salary", "salary35",
           "factor", "employees_nonconsolidated", "employees_consolidated",
           "emp_ratio", "badge", "salary35_fit", "industry", "source",
           "period_end", "doc_id"]


def save(rows):
    path = OUT / "ranking_unified.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADERS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    return path


if __name__ == "__main__":
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
