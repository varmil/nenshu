"""全社を1つのランキングに統合する。

持株会社も事業会社も非上場の有報提出会社も、除外せず同じ表に載せる。
「単体カバー率」（単体従業員数 ÷ 連結従業員数）を列として持たせ、
その数字がグループの何割を映しているかを読者が自分で見られるようにする。

  python3 unified.py
"""

import csv
import re
import unicodedata
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


def _norm_name(s):
    """社名の突合用の正規化。全角/半角を揃え、空白をすべて落とす。

    法人格は落とさない。EDINETコードリスト側も法人格を含む正式名称を持って
    いるので、落としても得が無く、同名衝突が増えるだけになる。
    """
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", s or ""))


def backfill_edinet_code(rows):
    """EDINETコードリストと突合して edinet_code 列を埋める。

    公開URL `/company/[id]` の識別子は「証券コードがあればそれ、無ければ
    EDINETコード」（ADR-0006）。書類IDは毎年の有報提出で変わるので使わない。

    コードリストは現時点のスナップショットなので、証券コードだけでは足りない
    ——上場廃止で証券コードが外れた会社が引けない。社名でフォールバックし、
    同名が複数あるときは上場区分、それでも決まらなければ未割り当てのコードで
    絞る。**1件でも決まらなければ社名を列挙して異常終了する。** 空のまま進むと
    同名の別会社に静かに紐づき、URLが別の会社を指したまま公開されてしまう。
    """
    info = run.load_edinet_codelist()

    by_sec, by_name = {}, {}
    for code, v in info.items():
        sec = (v.get("sec_code") or "").strip()
        if sec:
            by_sec.setdefault(sec, []).append(code)
        by_name.setdefault(_norm_name(v.get("name")), []).append(code)

    used = set()
    pending = []
    for r in rows:
        sec = (r.get("sec_code") or "").strip()
        cands = by_sec.get(sec, []) if sec else []
        if len(cands) == 1:
            r["edinet_code"] = cands[0]
            used.add(cands[0])
        else:
            pending.append(r)

    unresolved = []
    for r in pending:
        cands = list(by_name.get(_norm_name(r.get("name")), []))
        if len(cands) > 1:
            same = [c for c in cands
                    if info[c].get("listed") == (r.get("listed") or "")]
            if len(same) == 1:
                cands = same
        if len(cands) > 1:
            free = [c for c in cands if c not in used]
            if len(free) == 1:
                cands = free
        if len(cands) == 1:
            r["edinet_code"] = cands[0]
            used.add(cands[0])
        else:
            unresolved.append((r.get("name"), r.get("sec_code"), cands))

    if unresolved:
        lines = "\n".join(
            f"  {name}（証券コード {sec or '無し'}）→ 候補 {cands or '無し'}"
            for name, sec, cands in unresolved
        )
        raise SystemExit(
            f"EDINETコードを決められない行が {len(unresolved)} 件あります。\n{lines}"
        )
    return rows


HEADERS = ["rank_adj", "rank_raw", "rank_delta", "sec_code", "name", "tse33",
           "listed", "avg_age", "avg_tenure", "avg_salary", "salary35",
           "factor", "employees_nonconsolidated", "employees_consolidated",
           "emp_ratio", "badge", "industry", "source",
           "period_end", "edinet_code", "doc_id"]


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
    ap.add_argument(
        "--backfill-edinet-code",
        metavar="PATH",
        help="EDINET から取り直さず、既存の CSV に edinet_code 列を埋める。"
             "公開URLの識別子（ADR-0006）に使う。",
    )
    args = ap.parse_args()

    if args.backfill_edinet_code:
        rows = backfill_edinet_code(load_csv(args.backfill_edinet_code))
        path = save(rows, Path(args.backfill_edinet_code))
        print(f"\nedinet_code を埋めた {len(rows)}社 → {path}")
        raise SystemExit(0)

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
