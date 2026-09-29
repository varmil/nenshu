"""更新台帳（refresh の D2・#872・`docs/refresh/ledger/design.md`）。

会社ごとに、企業 ID・最後の有報の提出日・工程ごとに反映した書類を持つ。**台帳に行が
あることが「一度載った」ことを表す**——行は足すだけで、消さない（ADR-0018 で、外れた会社の
ページも残す）。

  python3 -m unittest discover -s ledger -t ledger -p 'test_*.py'

**書くのはこちら（Python）、読むのはビルド（`pipeline/scripts/lib/ledger.ts`）。** 毎日の取得
（D4）と文章の工程（D6）が Python なので、ID を振るのも入る条件を見るのもここに置く。
出る条件（24か月）で絞るのはビルドの側で、**同じ規則を両側に持たない。**
"""

import csv
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PATH = ROOT.parent / "data" / "ledger.csv"

# 列の並びは `ledger.ts` の `LEDGER_COLUMNS` と同じ。**読む側は見出しを完全一致で検める**
# ので、列を足すときは両側を直す。
COLUMNS = [
    "edinet_code",
    "id",
    # 最後の有報の提出日（`YYYY-MM-DD`）。出る条件（24か月）はここから数える
    "filed",
    # 工程ごとに反映した書類 ID。空はその工程をまだどの書類でも回していない
    "doc_numbers",
    "doc_description",
    "doc_analysis",
    "doc_pay_policy",
]
DOC_COLUMNS = ["doc_numbers", "doc_description", "doc_analysis", "doc_pay_policy"]

# 入る条件の窓（ADR-0011）と、出るまでの猶予（ADR-0018）。
ENTRY_MONTHS = 12
EXIT_MONTHS = 24

_EDINET_CODE = re.compile(r"^E\d{5}$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def add_months(d, n):
    """`d` の `n` か月後（負なら前）。**月末は丸める**（3月31日の1か月前は2月28日か29日）。

    `run.twelve_month_window` の「2月29日に回したら前年は2月28日」と同じ扱い。
    """
    y, m = divmod(d.month - 1 + n, 12)
    year, month = d.year + y, m + 1
    last = [31, 29 if _leap(year) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    return date(year, month, min(d.day, last))


def _leap(y):
    return y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)


def may_enter(filed, as_of):
    """台帳に無い会社が、この提出で新しく載ってよいか（ADR-0018 決定1）。

    **直近12か月（`as_of` を含めて遡る。`run.twelve_month_window` と同じ両端を含む窓）に
    提出した有報だけ。** 1〜2年前に提出をやめた会社を新しく載せない。
    """
    return add_months(as_of, -ENTRY_MONTHS) <= filed <= as_of


def assign_id(sec_code, edinet_code, taken):
    """新しく載る会社の企業 ID（ADR-0017）。

    **証券コードがあれば証券コード、無ければ EDINETコード**（ADR-0006 決定2）。証券コードが
    既に別の会社の ID になっていたら、**後から来たこの会社を EDINETコードにする**——先に
    公開していたページの URL を守る（証券コードは上場廃止の後に別の会社へ振り直されうる）。

    **書類 ID は使わない。** 毎年の有報で新しく振られるので、URL が年ごとに変わる。
    """
    if not _EDINET_CODE.match(edinet_code or ""):
        raise ValueError(f"EDINETコードの形ではありません: {edinet_code!r}")
    candidate = sec_code or edinet_code
    if candidate in taken:
        candidate = edinet_code
    if candidate in taken:
        raise ValueError(f"{edinet_code} に振れる ID がありません（{sec_code} と {edinet_code} が使用中）")
    return candidate


def admit(entries, *, edinet_code, sec_code, doc_id, filed, as_of):
    """有報1件を台帳に反映する。返すのはその会社の行、載せないなら `None`。

    - **台帳にある会社**は、提出日と数字の書類を替える。**ID は変えない**——上場で証券コードが
      付いても、上場廃止で消えても（ADR-0017 決定1）
    - **台帳に無い会社**は、直近12か月の提出なら ID を振って足す（`may_enter`・`assign_id`）

    `filed` と `as_of` は `date`。どの書類を採るか（期末が新しいほう）は呼び出し側が決める。
    """
    entry = entries.get(edinet_code)
    if entry is None:
        if not may_enter(filed, as_of):
            return None
        taken = {e["id"] for e in entries.values()}
        entry = {c: "" for c in COLUMNS}
        entry.update(edinet_code=edinet_code, id=assign_id(sec_code, edinet_code, taken))
        entries[edinet_code] = entry
    elif entry["filed"] > filed.isoformat():
        # 呼び出し側が書類の選び方を間違えている。出る条件の時計を巻き戻さない。
        raise ValueError(f"{edinet_code} の提出日が {entry['filed']} から {filed} に戻ります")
    entry["filed"] = filed.isoformat()
    entry["doc_numbers"] = doc_id
    return entry


def check(entries):
    """台帳の形を検める。**同じ ID が2社にあったら落とす**（ADR-0017「結果」）。"""
    ids = {}
    for code, e in entries.items():
        if code != e["edinet_code"] or not _EDINET_CODE.match(code):
            raise ValueError(f"台帳の鍵が EDINETコードではありません: {code!r}")
        if not e["id"]:
            raise ValueError(f"{code} に企業 ID がありません")
        if e["id"] in ids:
            raise ValueError(f"企業 ID {e['id']} が {ids[e['id']]} と {code} の2社にあります")
        ids[e["id"]] = code
        if not _DATE.match(e["filed"]):
            raise ValueError(f"{code} の提出日が YYYY-MM-DD の形ではありません: {e['filed']!r}")


def load(path=None):
    """EDINETコード → 行（列名 → 文字列）。

    **置き場所は呼んだ時点の `PATH` を見る**（既定の引数に束ねない）。テストが `PATH` を差し替えても、
    既定の引数は定義した時点の値のままなので、本物の台帳を読み書きしてしまう（D4 で実際に踏んだ）。
    """
    path = path or PATH
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != COLUMNS:
            raise ValueError(f"{path} の見出しが想定と違います: {reader.fieldnames}")
        entries = {r["edinet_code"]: r for r in reader}
    check(entries)
    return entries


def save(entries, path=None):
    """**EDINETコードの順に1社1行で書く。** 毎日書き換わるので、差分が会社ごとに出る形にする。"""
    path = path or PATH
    check(entries)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, lineterminator="\n")
        w.writeheader()
        for code in sorted(entries):
            w.writerow({c: entries[code][c] for c in COLUMNS})
