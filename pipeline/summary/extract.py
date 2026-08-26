"""有報の「事業の内容」を平文で抜き、`pipeline/data/business_text_2026.csv` にする。

C5（[#159](https://github.com/varmil/nenshu/issues/159)・親 #158・ADR-0010・
`docs/company/spec.md` AC-18）。**要約はここでは作らない**（C6）。**表示も変わらない。**

読むのは `ranking_unified_2026.csv` に載っている会社の `doc_id` ——**平均年間給与を
拾ったのと同じ書類**から「事業の内容」も出てくるので、母集団の定義がこの Unit で
ずれることがない。ZIP は `fetch.py` が落としてある前提で、**ここでは EDINET に
一切リクエストしない**（キャッシュにある物だけを読む）。

  python3 fetch.py      # 未取得の書類を落とす（キャッシュが生きていれば0件）
  python3 extract.py    # → ../data/business_text_2026.csv
"""

import csv
import hashlib
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "salary"))
import edinet  # noqa: E402

ROOT = Path(__file__).resolve().parent
UNIVERSE = ROOT / "../data/ranking_unified_2026.csv"
OUT = ROOT / "../data/business_text_2026.csv"

HEADERS = [
    "edinet_code",
    "sec_code",
    "name",
    "doc_id",
    "period_end",
    "text",
    "char_len",
    "text_sha1",
]

# 取れなかった理由。**件数を出さないと気づけない**——原文が空でも後段（C6）は
# 「書けない会社」として静かに落とすので、取得の失敗と区別が付かなくなる。
REASONS = ("取得失敗", "要素が無い", "値が空")


def universe():
    """母集団の行。CSV に載っている順のまま返す。"""
    rows = []
    with open(UNIVERSE, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row.get("doc_id"):
                rows.append(row)
    return rows


def meta_of(row):
    """`edinet.to_record` に渡すメタ。**書類ではなく母集団の CSV から作る**——
    掲載中の社名・証券コードは `unified.py` が確定させたものが正で、書類の中の
    表記（旧商号など）ではない。"""
    return {
        "secCode": row.get("sec_code") or "",
        "edinetCode": row.get("edinet_code") or "",
        "filerName": row.get("name") or "",
        "docID": row["doc_id"],
        "periodEnd": row.get("period_end") or "",
    }


def extract(row):
    """1社ぶん。`(record, reason)` を返す。取れた場合の `reason` は `None`。"""
    path = edinet.CACHE / f"{row['doc_id']}.zip"
    # **「取れなかった」を1つにまとめない**（AC-18）。ZIP が無い・壊れているのは
    # 取得の失敗で、`fetch.py` を回せば直る。要素が無い・値が空は書類そのものの話で、
    # 回し直しても変わらない。**同じ数字に混ぜると、どちらなのか誰も言えなくなる。**
    if not path.exists() or not zipfile.is_zipfile(path):
        return None, "取得失敗"
    parsed = edinet.parse_csv_zip(path)
    if not parsed.get("business_textblocks"):
        return None, "要素が無い"
    rec = edinet.to_record(meta_of(row), parsed)
    text = rec["business_text"]
    if not text:
        return None, "値が空"
    return {
        "edinet_code": rec["edinet_code"],
        "sec_code": rec["sec_code"],
        "name": rec["name"],
        "doc_id": rec["doc_id"],
        "period_end": rec["period_end"],
        "text": text,
        "char_len": len(text),
        # **翌年に原文が変わった会社だけ C6 を回し直すための鍵**（AC-18）。
        # 平文にした後の文字列で取る——整え方を変えたら全社ぶん作り直す、が正しい。
        "text_sha1": hashlib.sha1(text.encode("utf-8")).hexdigest(),
    }, None


def main():
    rows = universe()
    out = []
    missed = {r: [] for r in REASONS}
    for row in rows:
        rec, reason = extract(row)
        if rec is None:
            missed[reason].append(row)
        else:
            out.append(rec)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADERS)
        w.writeheader()
        for r in out:
            w.writerow(r)

    rate = len(out) / len(rows) * 100 if rows else 0.0
    print(f"母集団 {len(rows)}社 → 原文 {len(out)}社（{rate:.1f}%）", flush=True)
    for reason in REASONS:
        bad = missed[reason]
        print(f"  {reason}: {len(bad)}社", flush=True)
        for row in bad[:10]:
            print(f"    {row.get('sec_code') or row.get('edinet_code')} {row.get('name')}",
                  flush=True)
        if len(bad) > 10:
            print(f"    …ほか{len(bad) - 10}社", flush=True)

    lens = sorted(r["char_len"] for r in out)
    if lens:
        mid = lens[len(lens) // 2]
        print(f"文字数: 中央値 {mid} / 平均 {sum(lens) / len(lens):.0f} / 最大 {lens[-1]}"
              f" / 200字未満 {sum(1 for n in lens if n < 200)}社", flush=True)
    print(f"→ {OUT}", flush=True)


if __name__ == "__main__":
    main()
