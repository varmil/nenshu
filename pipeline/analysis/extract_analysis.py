"""有報の4節（MD&A・リスク・課題・サステナビリティ）を平文で抜く。

C8（[#240](https://github.com/varmil/nenshu/issues/240)・親 #214・ADR-0015・
`docs/company/spec.md` AC-24）。**要約も分析もここでは作らない**（C9）。**表示も変わらない。**

読むのは `ranking_unified_2026.csv` に載っている会社の `doc_id` ——**平均年間給与を
拾ったのと同じ書類**なので、母集団の定義がこの Unit でずれることがない。ZIP は
`fetch.py` が落としてある前提で、**ここでは EDINET に一切リクエストしない**
（C5 の `extract.py` と同じ）。

  python3 fetch.py             # 未取得の書類を落とす（キャッシュが生きていれば0件）
  python3 extract_analysis.py  # → ../data/analysis_text_*.csv（3つ書く）

**書くものが3つある。**

| ファイル | 大きさ | git |
| --- | --- | --- |
| `analysis_text_2026.csv`（切らない原文） | 167MB | **置かない** |
| `analysis_text_head1800_2026.csv.gz`（節ごと1,800字） | gzip 15.8MB | **置く** |
| `analysis_text_manifest_2026.csv`（節ごとの字数と SHA-1） | 740KB | **置く** |

**切らない原文は git に置けない。** 実測で167MB（gzip 46.6MB）あり、`pipeline/data/` の
最大である `business_text_2026.csv` の15.2MB とは桁が違う。

**切った版を置くのは、C9 のセッションを持ち運べるようにするため**（2026-08-28・運営者の
判断）。**ZIP キャッシュ（326MB）はコンテナが変わると消える**ので、置かないと C9 の
セッションごとに `fetch.py` の26分がかかる（**約48セッションで21時間**）。C9 が読むのは
節ごと1,800字までなので、そこまでを置けば**キャッシュも EDINET キーも要らなくなる。**

**切る長さは C9 のパイロットが決めた1,800字**（`docs/company/analysis-generation/design.md`）。
**ファイル名に長さを入れてある**——変えたら別名になるので、古い版が残っていても混ざらない。
"""

import argparse
import csv
import gzip
import hashlib
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "salary"))
import edinet  # noqa: E402

ROOT = Path(__file__).resolve().parent
UNIVERSE = ROOT / "../data/ranking_unified_2026.csv"
OUT = ROOT / "../data/analysis_text_2026.csv"
MANIFEST = ROOT / "../data/analysis_text_manifest_2026.csv"

# **git に置くほうの切り方。** C9 のパイロットが決めた値で、`generate.py` の
# `--max-chars` の既定と同じ。**この定数からファイル名を組む**ので、長さを変えれば
# 別名になり、古い版が残っていても混ざらない。
CUT_CHARS = 1800
CUT_OUT = ROOT / f"../data/analysis_text_head{CUT_CHARS}_2026.csv.gz"

KEYS = [s.key for s in edinet.ANALYSIS_SECTIONS]
LABELS = {s.key: s.label for s in edinet.ANALYSIS_SECTIONS}

# EDINET 側の打ち切り。**ここでは復元しない**——原本の XBRL（`type=1`）を読めば伸びるが、
# この Unit の範囲は「平均年間給与を拾ったのと同じ書類から拾う」ことに閉じている。
# 当たった会社と節は数えてマニフェストに残す。
#
# **30,000 ちょうどで判定すると取りこぼす。** 実測した12件のうち10件は 29,999字だった
# ——`parse_csv_zip` が値を `strip()` しており、**30,000字目が空白だった書類ではそれが
# 落ちる**ため。1字ぶん緩めて数える。**本当に 29,999字ちょうどの節を打ち切りと呼ぶ**
# 取り違えは残るが、これはマニフェストの目印の話で、原文そのものには影響しない。
EDINET_VALUE_CAP = 30000

BASE_HEADERS = ["edinet_code", "sec_code", "name", "doc_id", "period_end"]

# 取れなかった理由。**件数を出さないと気づけない**（C5 の `extract.py` と同じ線）。
# 取得失敗は `fetch.py` を回せば直り、要素が無い・値が空は書類そのものの話で
# 回し直しても変わらない。**同じ数字に混ぜると、どちらなのか誰も言えなくなる。**
REASONS = ("取得失敗", "4節とも無い")


def universe():
    rows = []
    with open(UNIVERSE, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row.get("doc_id"):
                rows.append(row)
    return rows


def base_of(row):
    """**書類ではなく母集団の CSV から作る**——掲載中の社名・証券コードは
    `unified.py` が確定させたものが正で、書類の中の表記（旧商号など）ではない。"""
    return {
        "edinet_code": (row.get("edinet_code") or "").strip(),
        "sec_code": (row.get("sec_code") or "").strip()[:4],
        "name": (row.get("name") or "").strip(),
        "doc_id": row["doc_id"],
        "period_end": (row.get("period_end") or "").strip(),
    }


def extract(row, max_chars=0):
    """1社ぶん。`(record, reason)` を返す。取れた場合の `reason` は `None`。"""
    path = edinet.CACHE / f"{row['doc_id']}.zip"
    if not path.exists():
        return None, "取得失敗"
    parsed = edinet.parse_csv_zip(path)
    texts = edinet.analysis_texts(parsed)
    if not any(texts.values()):
        # ZIP が壊れていても `parse_csv_zip` は空の辞書を返すので、ここには
        # 「書類はあるが4節が1つも無い」会社と一緒に落ちてくる。**取得失敗と分けたい
        # のは前段だけ**なので、ここは1つの理由にまとめる。
        return None, "4節とも無い"

    rec = dict(base_of(row))
    truncated = []
    for key in KEYS:
        text = texts[key]
        if max_chars and len(text) > max_chars:
            text = text[:max_chars]
        rec[key] = text
        rec[f"{key}_len"] = len(text)
        # **SHA-1 は節ごとに取る。** 4節をまとめて1つにすると、1節だけ変わった会社と
        # 全部変わった会社を区別できない（C9 が回し直す範囲がそのぶん広がる）。
        # **平文にした後の文字列で取る**——整え方を変えたら全社ぶん作り直す、が正しい。
        rec[f"{key}_sha1"] = hashlib.sha1(text.encode("utf-8")).hexdigest() if text else ""
        raws = parsed.get(f"analysis__{key}") or []
        if any(len(v) >= EDINET_VALUE_CAP - 1 for v in raws):
            truncated.append(key)
    rec["truncated"] = " ".join(truncated)
    return rec, None


def report(out, total):
    """節ごとの取得率と文字数、打ち切りの件数（AC-24）。"""
    for key in KEYS:
        lens = sorted(r[f"{key}_len"] for r in out if r[f"{key}_len"])
        cut = sum(1 for r in out if key in r["truncated"].split())
        if not lens:
            print(f"  {LABELS[key]}: 0社", flush=True)
            continue
        print(
            f"  {LABELS[key]}: {len(lens)}社（{len(lens) / total * 100:.1f}%）"
            f" 中央 {statistics.median(lens):.0f}字 / 平均 {statistics.mean(lens):.0f}字"
            f" / 最大 {lens[-1]}字 / 打ち切り {cut}社",
            flush=True,
        )
    per = [sum(r[f"{k}_len"] for k in KEYS) for r in out]
    if per:
        print(
            f"  1社あたり合計: 中央 {statistics.median(per):.0f}字"
            f" / 平均 {statistics.mean(per):.0f}字 / 総計 {sum(per) / 10000:.0f}万字",
            flush=True,
        )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-chars", type=int, default=0,
                    help="節ごとに先頭N字で切る（既定は切らない。切り方を決めるのは C9）")
    args = ap.parse_args()

    rows = universe()
    out = []
    missed = {r: [] for r in REASONS}
    for row in rows:
        rec, reason = extract(row, args.max_chars)
        if rec is None:
            missed[reason].append(row)
        else:
            out.append(rec)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=BASE_HEADERS + KEYS, extrasaction="ignore")
        w.writeheader()
        for r in out:
            w.writerow(r)

    # **git に置く版。** 節ごとに `CUT_CHARS` で切って gzip で書く。**列は切らない版と
    # 同じ**にしてあり、`generate.py` はどちらを読んでも同じように扱える。
    with gzip.open(CUT_OUT, "wt", encoding="utf-8", newline="", compresslevel=6) as f:
        w = csv.DictWriter(f, fieldnames=BASE_HEADERS + KEYS, extrasaction="ignore")
        w.writeheader()
        for r in out:
            w.writerow({**r, **{k: (r[k] or "")[:CUT_CHARS] for k in KEYS}})

    meta_headers = BASE_HEADERS + [c for k in KEYS for c in (f"{k}_len", f"{k}_sha1")] + ["truncated"]
    with open(MANIFEST, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=meta_headers, extrasaction="ignore")
        w.writeheader()
        for r in out:
            w.writerow(r)

    rate = len(out) / len(rows) * 100 if rows else 0.0
    print(f"母集団 {len(rows)}社 → 原文 {len(out)}社（{rate:.1f}%）", flush=True)
    for reason in REASONS:
        bad = missed[reason]
        print(f"  {reason}: {len(bad)}社", flush=True)
        for row in bad[:10]:
            print(f"    {row.get('sec_code') or row.get('edinet_code')} {row.get('name')}", flush=True)
        if len(bad) > 10:
            print(f"    …ほか{len(bad) - 10}社", flush=True)
    report(out, len(rows))
    print(f"→ {OUT}（{OUT.stat().st_size / 1024 / 1024:.0f}MB・git には置かない）", flush=True)
    print(f"→ {CUT_OUT.name}（節ごと{CUT_CHARS}字・"
          f"{CUT_OUT.stat().st_size / 1024 / 1024:.1f}MB・git に置く）", flush=True)
    print(f"→ {MANIFEST.name}", flush=True)


if __name__ == "__main__":
    main()
