"""分析の品質の見張り（refresh の D10・#880・`docs/refresh/text-quality/design.md`）。

月1回、その月に書いた分析を物差しで数え、いま載っている版5の分布と比べる。ずれが大きければ
知らせ（`pipeline/refresh/alerts.py`）が Issue を立てる。**規格は自動では変えない**（spec 1.14）。

    python3 quality.py baseline            # 版5の分布を数えて固定する（物差しを変えたときだけ）
    python3 quality.py report              # 日本時間の先月ぶんを集計して data/analysis_quality/ に書く
    python3 quality.py report --month 2026-10

**1社ずつの機械ゲートには入れない。** 主観の語に下限を課すと分析が単調になる（`gate.py` の
「逃げの語」の注記）。ここで見るのは月の平均で、1社ずつは落とさない。

## 物差し

C9 の版3で分析が要約に戻っていたのを見つけた物差し（主観の語・事実の語・外部の資料を使った
割合）を、語の並びとして起こした。C9 では語の並びをコードに残していなかったので、**git の履歴に
残っている版2の分析（2026-09-06 時点の676社）と版5を並べて、同じ向きに開くことを確かめてある**
（design.md「物差しを起こす」）。

- **主観の語**: 評価・見立て・読者に向けた判断を表す語（`SUBJECTIVE`）
- **事実の語**: 数字と、業績の言い回し（`FACT`）。要約に戻ると増える
- **外部の資料**: `sources` が空でない会社の割合
- 参考（判定に使わない）: 読者への語（`READER`）・逃げの語（`gate.escape_phrases`）・字数
"""

import argparse
import csv
import json
import re
import statistics
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import gate  # noqa: E402

DATA = ROOT.parent / "data"
ANALYSIS = DATA / "company_analysis.csv"
BASELINE = ROOT / "quality_baseline.json"
REPORTS = DATA / "analysis_quality"
THRESHOLDS = ROOT.parent / "refresh" / "thresholds.json"

JST = timezone(timedelta(hours=9))

# **物差しの版。** 語の並びを変えたら上げ、`baseline` を回し直す。固定した分布と版が食い違うと
# `report` は止まる——違う物差しで数えた値どうしを比べない。
YARDSTICK = "1"

# 主観の語。**評価（強み・危うさ）・見立て（とみる・と読める）・読者への判断（べきだ・おきたい）**。
# 版2 → 版5 で 0.39 → 1.36 語/社に開く（design.md）。
SUBJECTIVE = (
    "強み", "弱み", "強さ", "弱さ", "危うさ", "危うい", "脆", "頼み", "有利", "不利", "見劣り", "際立",
    "突出", "盤石", "手堅", "物足りな", "伸びしろ", "頭打ち", "正念場", "試金石", "分岐点", "岐路",
    "鍵を握", "カギ", "本質", "裏返し", "代償", "引き換え", "表裏", "賭け", "綱渡り", "追い風", "逆風",
    "向かい風", "好調", "不調", "堅調", "苦戦", "失速", "息切れ", "踊り場",
    "べきだ", "べきである", "ほうがいい", "ほうがよい", "おきたい", "と見る", "とみる", "と見て",
    "とみて", "と読める", "と言える", "といえる", "に過ぎない", "にすぎない", "ほかならない",
    "意味を持つ", "見逃せない", "無視できない", "侮れない", "懸念", "期待",
)

# 読者（求職者）に向けた語。参考として並べる（判定には使わない。版2 → 版5 の開きが小さい）。
READER = (
    "求職者", "入る側", "入るなら", "入れば", "入って", "入った人", "入る人", "入ると", "入社するなら",
    "入社を", "働く側", "働き手", "あなた", "読者",
)

# 事実の語。数字（全角も）と業績の言い回し。版2 → 版5 で 8.3 → 5.8 語/社に下がる。
FACT = re.compile(
    r"[0-9０-９]+(?:[.．][0-9０-９]+)?|前期|当期|前年|増収|減収|増益|減益|売上高|営業利益|経常利益"
    r"|純利益|億円|百万円"
)

# 判定に使う3つ（線は `drifts`。design.md「線」）。
JUDGED = ("subjective", "fact", "external")
LABELS = {
    "subjective": "主観の語（語/社）",
    "fact": "事実の語（語/社）",
    "external": "外部の資料を使った割合",
    "reader": "読者への語（語/社）",
    "escape": "逃げの語（語/社）",
    "chars": "字数（見出し＋本文）",
}

csv.field_size_limit(200 * 1024 * 1024)


# ---------------------------------------------------------------------------
# 純関数（test_quality.py が合成データで見る）


def measure(headline, analysis, sources):
    """1社ぶん。見出しと本文を合わせて数える。"""
    text = (headline or "") + (analysis or "")
    return {
        "subjective": sum(text.count(w) for w in SUBJECTIVE),
        "fact": len(FACT.findall(text)),
        "external": 1 if sources else 0,
        "reader": sum(text.count(w) for w in READER),
        "escape": len(gate.escape_phrases(text)),
        "chars": len(text),
    }


def summarize(measures):
    """会社ごとの値の平均（外部は割合）。`n` は社数。"""
    n = len(measures)
    if n == 0:
        return {"n": 0}
    out = {"n": n}
    for key in LABELS:
        out[key] = round(statistics.mean(m[key] for m in measures), 4)
    return out


def month_of(generated_at):
    """書いた日時（UTC の ISO 形式）の、日本時間の月（`YYYY-MM`）。"""
    return datetime.fromisoformat(generated_at).astimezone(JST).strftime("%Y-%m")


def previous_month(today):
    first = today.replace(day=1)
    return (first - timedelta(days=1)).strftime("%Y-%m")


def parse_sources(value):
    try:
        return json.loads(value or "[]")
    except json.JSONDecodeError:
        return []


def written(row):
    """数える行。**要約と分析が通って公開されている行だけ**（落ちて空の行は書いた数に入れない）。"""
    return row.get("analysis_verdict") == "ok" and bool(row.get("analysis"))


def measure_row(row):
    return measure(row.get("headline"), row.get("analysis"), parse_sources(row.get("sources")))


def drifts(stats, baseline, lines):
    """版5からのずれ。**社数が `minCompanies` に満たない月は判定しない**（空を返す）。

    - 主観の語・事実の語: 版5の平均からの比が ±`maxRelativeShift` を超えたら（両向き）
    - 外部の資料: 版5の割合から `maxExternalDrop`（割合の差）を超えて**減った**ら。増えるのは
      規格どおり（`gen_task.md` は採用ページと直近のリリースを見に行かせる）で、C9 で起きた
      壊れ方は「外部情報が死んだ」ほう
    """
    if stats.get("n", 0) < lines["minCompanies"]:
        return []
    out = []
    for key in JUDGED:
        value, base = stats[key], baseline[key]
        if key == "external":
            over = base - value > lines["maxExternalDrop"]
        else:
            over = base > 0 and abs(value / base - 1) > lines["maxRelativeShift"]
        if over:
            out.append({"metric": key, "value": value, "baseline": base})
    return out


def build_report(rows, month, baseline, lines):
    """その月の集計。モデルごとの内訳（AC-16 の記録）を並べる。"""
    picked = [r for r in rows if written(r) and month_of(r["generated_at"]) == month]
    stats = summarize([measure_row(r) for r in picked])
    by_model = {}
    for r in picked:
        by_model.setdefault(r.get("model") or "（記録なし）", []).append(measure_row(r))
    return {
        "month": month,
        "yardstick": YARDSTICK,
        "stats": stats,
        "byModel": {m: summarize(ms) for m, ms in sorted(by_model.items())},
        "baseline": {k: baseline["stats"][k] for k in LABELS},
        "judged": stats.get("n", 0) >= lines["minCompanies"],
        "drifts": drifts(stats, baseline["stats"], lines),
        "lines": lines,
    }


# ---------------------------------------------------------------------------
# 読み書き


def read_rows(path=None):
    with open(path or ANALYSIS, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def read_lines():
    return json.loads(THRESHOLDS.read_text(encoding="utf-8"))["quality"]


def read_baseline(path=None):
    baseline = json.loads((path or BASELINE).read_text(encoding="utf-8"))
    if baseline["yardstick"] != YARDSTICK:
        raise SystemExit(
            f"固定した版5の分布は物差しの版 {baseline['yardstick']} で数えてある（いまは {YARDSTICK}）。"
            "`python3 quality.py baseline` で数え直すこと"
        )
    return baseline


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def latest_report(reports=None):
    """いちばん新しい月の集計（無ければ `None`）。知らせ（`alerts.py`）が読む。"""
    paths = sorted((reports or REPORTS).glob("*.json"))
    return json.loads(paths[-1].read_text(encoding="utf-8")) if paths else None


# ---------------------------------------------------------------------------
# コマンド


def cmd_baseline(args):
    """版5の分布を数えて固定する。**C9 が書いた全社ぶん**（`--before` より前に書いた行）。"""
    rows = [r for r in read_rows() if written(r) and r["generated_at"] < args.before]
    specs = {r.get("spec") for r in rows}
    if specs != {"5"}:
        raise SystemExit(f"版5以外の行が混ざっている: {sorted(specs)}")
    measures = [measure_row(r) for r in rows]
    stats = summarize(measures)
    spread = {k: round(statistics.pstdev(m[k] for m in measures), 4) for k in LABELS}
    write_json(BASELINE, {
        "yardstick": YARDSTICK,
        "spec": "5",
        "before": args.before,
        "stats": stats,
        "stdev": spread,
    })
    print(f"版5の分布を固定した（{stats['n']}社・{args.before} より前に書いた行）→ {BASELINE.name}", flush=True)
    for k in LABELS:
        print(f"  {LABELS[k]}: 平均 {stats[k]}（標準偏差 {spread[k]}）", flush=True)


def cmd_report(args):
    month = args.month or previous_month(datetime.now(JST).date())
    report = build_report(read_rows(), month, read_baseline(), read_lines())
    path = REPORTS / f"{month}.json"
    write_json(path, report)
    s = report["stats"]
    print(f"{month} に書いた分析: {s['n']}社 → {path.relative_to(ROOT.parent)}", flush=True)
    if s["n"]:
        for k in LABELS:
            print(f"  {LABELS[k]}: {s[k]}（版5 {report['baseline'][k]}）", flush=True)
    if not report["judged"]:
        print(f"  社数が {report['lines']['minCompanies']}社に満たないので判定しない", flush=True)
    for d in report["drifts"]:
        print(f"  ずれ: {LABELS[d['metric']]} {d['value']}（版5 {d['baseline']}）", flush=True)


def main(argv=None):
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("baseline")
    # C9 が全社を書き終えたのは 2026-09-23。定期実行（D6）の分析はそれより後に書かれる
    b.add_argument("--before", default="2026-09-24")
    b.set_defaults(func=cmd_baseline)
    r = sub.add_parser("report")
    r.add_argument("--month", default="", help="YYYY-MM（既定は日本時間の先月）")
    r.set_defaults(func=cmd_report)
    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
