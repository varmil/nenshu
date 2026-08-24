"""有報の「主要な経営指標等の推移」から経常利益と従業員数を抜き、long 形式の CSV にする。

P0（#155）。出力は `pipeline/data/performance_history.csv`（1社1年1行）。

**1書類に5期ぶんの経常利益が入っている。** `jpcrp_cor:OrdinaryIncomeLossSummaryOfBusinessResults`
が `Prior4YearDuration` 〜 `CurrentYearDuration` の5つのコンテキストで来るので、
**直近5期の中央値は最新年の書類1件だけで出せる**（追加のダウンロードは要らない）。

**従業員数は当期しかタグ付けされていない。** `NumberOfEmployeesSummaryOfBusinessResults`
に相当する要素が無く、5期ぶんは本文（`BusinessResultsOfGroupTextBlock`）の中にしか
無い。年次の従業員数が要るなら**その年の書類**を読む。

**連結を優先し、無ければ単体で埋める**（親 Issue #154 の決定）。単体で組むと、
単体従業員が連結の10%未満の会社173社で分子が実質的に子会社からの配当になり、
一人当たり数億円が並ぶ。連結なら持株会社が事業会社と同じ土俵に乗る。

  python3 extract.py             # 全年（キャッシュにある書類だけ）
  python3 extract.py 2026 2026   # 年を絞る
"""

import csv
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "salary"))
import edinet  # noqa: E402

ROOT = Path(__file__).resolve().parent
HISTORY = ROOT / "../data/salary_history.csv"
OUT = ROOT / "../data/performance_history.csv"

# **経常利益の要素は2つの綴りがある。名前空間は見ない。**
#
# 標準は `jpcrp_cor:OrdinaryIncomeLossSummaryOfBusinessResults` だが、**会社独自の
# 名前空間で拡張している会社がある**——東京製鐵は
# `jpcrp030000-asr_E01261-000:OrdinaryProfitSummaryOfBusinessResults` を使っており、
# `jpcrp_cor:` で決め打ちすると2018年以降が丸ごと取れない（そして5期ぶんを遡る
# 性質上、**2013〜2017年だけが残って「10年前の数字が最新」になる**）。
#
# **`OrdinaryIncomeSummaryOfBusinessResults`（`Loss` が付かない綴り）は採らない。
# あれは「経常収益」で、売上に相当する別の指標である。** 三菱UFJは経常収益
# 14.6兆円・経常利益 3.4兆円の両方を持っており、取り違えると銀行業・保険業の
# 業種中央値が桁で変わる（実際に 保険業 889万円 → 10,995万円 になった）。
OI_LOCAL_NAMES = {
    "OrdinaryIncomeLossSummaryOfBusinessResults",  # 標準。大半がこれ
    "OrdinaryProfitSummaryOfBusinessResults",  # 会社独自の名前空間で拡張（東京製鐵）
}
# 上の2つで経常収益が紛れたことは無いが、**ラベルで二重に止める**。独自拡張の
# 要素はラベルが空になるので、「空でなく、かつ経常収益」のときだけ弾く。
OI_REJECT_LABEL = "経常収益"
EMPLOYEES_LOCAL_NAME = "NumberOfEmployees"

# 「主要な経営指標等の推移」のコンテキスト。**当期からの遡り年数**を持つ。
OI_CONTEXTS = {
    "CurrentYearDuration": 0,
    "Prior1YearDuration": 1,
    "Prior2YearDuration": 2,
    "Prior3YearDuration": 3,
    "Prior4YearDuration": 4,
}

HEADERS = [
    "edinet_code",
    "year",
    "ordinary_income",
    "oi_basis",
    "employees_consolidated",
    "employees_nonconsolidated",
    "source_year",
    "back",
]


def num(v):
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def parse(path):
    """1書類から経常利益（5期・連結と単体）と当期の従業員数を抜く。"""
    oi = {}       # 遡り年数 → 連結の経常利益
    oi_nc = {}    # 遡り年数 → 単体の経常利益
    emp_c = None
    emp_nc = None
    try:
        z = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, FileNotFoundError):
        return None
    for name in z.namelist():
        if not name.lower().endswith(".csv") or "jpcrp" not in name:
            continue
        raw = z.read(name)
        try:
            text = raw.decode("utf-16")
        except UnicodeError:
            text = raw.decode("utf-8", "replace")
        for line in text.splitlines()[1:]:
            cols = line.split("\t")
            if len(cols) < 9:
                continue
            elem = cols[0].strip().strip('"')
            label = cols[1].strip().strip('"')
            ctx = cols[2].strip().strip('"')
            value = cols[8].strip().strip('"')
            if value in ("", "－", "-", "－"):
                continue
            local = elem.split(":")[-1]
            if local in OI_LOCAL_NAMES and OI_REJECT_LABEL not in label:
                if ctx in OI_CONTEXTS:
                    oi.setdefault(OI_CONTEXTS[ctx], num(value))
                elif ctx.endswith("_NonConsolidatedMember"):
                    base = ctx[: -len("_NonConsolidatedMember")]
                    if base in OI_CONTEXTS:
                        oi_nc.setdefault(OI_CONTEXTS[base], num(value))
            elif local == EMPLOYEES_LOCAL_NAME:
                if ctx == "CurrentYearInstant":
                    emp_c = emp_c if emp_c is not None else num(value)
                elif ctx == "CurrentYearInstant_NonConsolidatedMember":
                    emp_nc = emp_nc if emp_nc is not None else num(value)
    return {"oi": oi, "oi_nc": oi_nc, "emp_c": emp_c, "emp_nc": emp_nc}


def documents(first_year, last_year):
    out = []
    with open(HISTORY, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            year = int(row["year"])
            if not (first_year <= year <= last_year) or not row.get("doc_id"):
                continue
            out.append((row["edinet_code"], year, row["doc_id"]))
    return out


def main():
    first_year = int(sys.argv[1]) if len(sys.argv) > 1 else 2017
    last_year = int(sys.argv[2]) if len(sys.argv) > 2 else 2026

    docs = documents(first_year, last_year)
    # (edinet_code, year) → 行。**同じ年が複数の書類から来る**（2026年の書類の
    # Prior1 と 2025年の書類の当期）。**遡りの少ないほう＝当期の値を優先する**
    # ——遡った値は会計基準の変更で組み替えられていることがあり、その年の書類の
    # 当期のほうが一次の記載になる。
    best = {}
    missing = 0
    for edinet_code, year, doc_id in docs:
        parsed = parse(edinet.CACHE / f"{doc_id}.zip")
        if parsed is None:
            missing += 1
            continue
        for back, value in sorted(parsed["oi"].items()):
            _put(best, edinet_code, year - back, value, "consolidated", back, year, parsed)
        for back, value in sorted(parsed["oi_nc"].items()):
            # 連結が無い年だけ単体で埋める（`_put` が basis の優先を見る）。
            _put(best, edinet_code, year - back, value, "nonconsolidated", back, year, parsed)

    rows = sorted(best.values(), key=lambda r: (r["edinet_code"], r["year"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADERS)
        w.writeheader()
        for r in rows:
            w.writerow(r)

    years = {}
    for r in rows:
        years.setdefault(r["year"], 0)
        years[r["year"]] += 1
    print(f"書類 {len(docs)}件（読めず {missing}件） → {len(rows)}行", flush=True)
    print("年ごとの社数:", dict(sorted(years.items())), flush=True)
    print(f"→ {OUT}", flush=True)


def _put(best, edinet_code, year, value, basis, back, source_year, parsed):
    if value is None:
        return
    key = (edinet_code, year)
    old = best.get(key)
    if old is not None:
        # 連結を優先し、同じ基準なら遡りの少ないほうを採る。
        old_rank = (0 if old["oi_basis"] == "consolidated" else 1, int(old["back"]))
        new_rank = (0 if basis == "consolidated" else 1, back)
        if old_rank <= new_rank:
            return
    best[key] = {
        "edinet_code": edinet_code,
        "year": year,
        "ordinary_income": int(value),
        "oi_basis": basis,
        # 従業員数はその書類の**当期**のもの。遡った年には付けない。
        "employees_consolidated": ""
        if back != 0 or parsed["emp_c"] is None
        else int(parsed["emp_c"]),
        "employees_nonconsolidated": ""
        if back != 0 or parsed["emp_nc"] is None
        else int(parsed["emp_nc"]),
        "source_year": source_year,
        "back": back,
    }


if __name__ == "__main__":
    main()
