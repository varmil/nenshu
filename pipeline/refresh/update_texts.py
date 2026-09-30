"""文章の差分生成（refresh の D6・#876・`docs/refresh/text-refresh/design.md`）。

数字が新しい書類に替わった会社の文章（分析と要約・説明文・給与の決定方針）を、1社ずつ新しい
書類に合わせる。**生成と検証はここでは回さない**——回すのは定期実行のセッションのエージェントで、
ここが持つのはその前後の機械の仕事だけ（どの会社を選ぶか・原文を取る・台帳と待ち行列に書く）。

  cd pipeline/refresh
  python3 update_texts.py queue --limit 16     # 今日の会社を選ぶ（上から順に処理する）
  python3 update_texts.py prepare E01991       # 1社ぶんの原文を取る
  （分析と要約 → 説明文 → 給与の決定方針。手順は .claude/skills/refresh-daily/texts.md）
  python3 update_texts.py finish E01991        # 台帳と文章の待ち行列に書く
  python3 update_texts.py status

**1社の工程を全部終えてから次の会社に移る**（spec 1.6）。途中で止まった会社は、次の回の
`queue` が先頭に置く。

**同じ書類で一度落ちた工程は選び直さない。** 落ちた工程は文章の待ち行列
（`pipeline/data/texts_pending.csv`）に理由と一緒に残り、知らせ（`alerts.py`）が Issue にする。
その会社の次の有報が出たら、また選ばれる。
"""

import argparse
import csv
import importlib.util
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PIPELINE = ROOT.parent
DATA = PIPELINE / "data"
WORK = ROOT / "work" / "texts"

sys.path.insert(0, str(PIPELINE / "salary"))
sys.path.insert(0, str(PIPELINE / "ledger"))
import edinet  # noqa: E402
import ledger  # noqa: E402
import unified  # noqa: E402

RANKING = DATA / "ranking_unified.csv"
ANALYSIS = DATA / "company_analysis.csv"
SUMMARY = DATA / "company_summary.csv"
PAY_POLICY = DATA / "pay_policy.json"
PENDING = DATA / "texts_pending.csv"

JST = timezone(timedelta(hours=9))

# 工程 → 台帳の列。**並びが処理の順**（spec 1.6: 分析と要約 → 説明文 → 給与の決定方針）
STAGES = {
    "analysis": "doc_analysis",
    "description": "doc_description",
    "pay_policy": "doc_pay_policy",
}
STAGE_LABELS = {"analysis": "分析と要約", "description": "説明文", "pay_policy": "給与の決定方針"}

PENDING_COLUMNS = ["edinet_code", "stage", "doc_id", "name", "reason", "since"]

csv.field_size_limit(200 * 1024 * 1024)


def _load(name, path):
    """ほかの工程のスクリプトを、名前がぶつからないように読み込む。

    `summary/extract.py` と `performance/extract.py`、`summary/fetch.py` と `paypolicy/fetch.py` の
    ように同じ名前のモジュールがあるので、`sys.path` に足して `import` すると取り違える。
    """
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def paypolicy_fetch():
    return _load("paypolicy_fetch", PIPELINE / "paypolicy" / "fetch.py")


# ---------------------------------------------------------------------------
# 純関数（test_update_texts.py が合成データで見る）


def below_line(row):
    """ランキングの行が単体従業員の線（`unified.MIN_EMPLOYEES`）を割っているか（D11・#903）。"""
    return float(row.get("employees_nonconsolidated") or 0) < unified.MIN_EMPLOYEES


def applies(stage, row, first_pay_policy_period):
    """その工程が、この会社のいまの書類に掛かるか。

    - 給与の決定方針の節は改正後の期にしか無い
    - **単体従業員の線を割った会社は、分析と要約を書かない**（D11）。ランキングの外の会社の画面は
      分析と要約を出さない（D9 と同じ）ので、書いても読まれない。線に戻れば、台帳の分析の書類が
      数字の書類と食い違ったままなので、次の回で選ばれる
    """
    if stage == "pay_policy":
        return row["period_end"] >= first_pay_policy_period
    if stage == "analysis":
        return not below_line(row)
    return True


def todo_stages(entry, row, failed, first_pay_policy_period):
    """その会社で、いまの数字の書類に合わせる工程（処理の順）。

    - 台帳の工程の書類が数字の書類と同じなら済んでいる
    - **同じ書類で一度落ちた工程（`failed` に `(工程, 書類)` がある）は選ばない**
    - 給与の決定方針は、数字の書類の決算期末が節の適用に掛かるときだけ
    """
    doc = entry["doc_numbers"]
    return [
        stage
        for stage, column in STAGES.items()
        if applies(stage, row, first_pay_policy_period)
        and entry[column] != doc
        and (stage, doc) not in failed
    ]


def select_queue(entries, ranking, pending, first_pay_policy_period, limit):
    """今日の会社。`[(EDINETコード, 工程の並び)]` を処理の順に返す（spec 1.6・1.7）。

    - **途中で止まった会社を先に**（いまの書類で済んだか落ちた工程があり、残りがある）。
      文章の要素どうしの期のずれを、長くても定期実行1回ぶんにするため
    - 残りは実測値の全体順位（`rank_raw`）の高い順
    - `limit` 社まで
    """
    failed = {}
    for p in pending:
        failed.setdefault(p["edinet_code"], set()).add((p["stage"], p["doc_id"]))
    picked = []
    for code, entry in entries.items():
        row = ranking.get(code)
        if row is None:
            continue
        stages = todo_stages(entry, row, failed.get(code, set()), first_pay_policy_period)
        if not stages:
            continue
        applicable = [s for s in STAGES if applies(s, row, first_pay_policy_period)]
        partial = len(stages) < len(applicable)
        picked.append((0 if partial else 1, int(row["rank_raw"]), code, stages))
    picked.sort()
    return [(code, stages) for _, _, code, stages in picked[:limit]]


def stage_docs(code, analysis_rows, summary_rows, pay_policy_rows):
    """成果物が指している書類（工程 → 書類 ID。無ければ空）。台帳はこれに合わせる。"""
    policies = [r for r in pay_policy_rows if r["edinet_code"] == code]
    if len(policies) > 1:
        raise ValueError(f"{code} の給与の決定方針の記録が {len(policies)}件ある")
    return {
        "analysis": (analysis_rows.get(code) or {}).get("source_doc_id", ""),
        "description": (summary_rows.get(code) or {}).get("source_doc_id", ""),
        "pay_policy": policies[0]["doc_id"] if policies else "",
    }


def stage_failure(stage, doc, analysis_row, summary_row, pay_doc):
    """工程が落ちたときの理由。通ったら `None`。**書類だけでなく判定まで見る。**

    書き直しが落ちた会社は前の版が残るので、成果物の書類が前の書類のままになる（落ちたと分かる）。
    **前の版が無い会社（新しく載った会社）は、新しい書類のまま判定が rejected の行が残る**——書類だけ
    見ると通ったことになり、知らせが立たない。
    """
    if stage == "analysis":
        r = analysis_row or {}
        if r.get("source_doc_id") != doc:
            return r.get("analysis_reason") or r.get("summary_reason") or ""
        if r.get("summary_verdict") != "ok" or r.get("analysis_verdict") != "ok":
            return r.get("analysis_reason") or r.get("summary_reason") or "rejected"
        return None
    if stage == "description":
        r = summary_row or {}
        if r.get("source_doc_id") != doc:
            return r.get("reject_reason") or ""
        # 生成側が「原文に事業の中身が無い」と判断して空を返したのは、落ちたのではない
        # （C17。ENEOS など10社。書き直しても変わらない）
        if r.get("verdict") != "ok" and r.get("reject_reason") != "説明文が空":
            return r.get("reject_reason") or "rejected"
        return None
    return None if pay_doc == doc else ""


def drop_unfinished_pay_policy(rows, code, doc):
    """新しい書類の給与の決定方針が、参照先で答え直す前（`referenced`）のまま残っていれば外す。

    `pick.py merge` は答えが決まる（own・none）まで前の書類の記録を外さないので、外せば前の
    書類の記録だけが残る。**外したかどうかを返す**（外したら落ちたと数える）。
    """
    keep = [r for r in rows if not (r["edinet_code"] == code and r["doc_id"] == doc and r["verdict"] == "referenced")]
    return keep, len(keep) != len(rows)


def update_pending(pending, code, name, doc, results, today):
    """文章の待ち行列を、この会社の結果で書き直す。`results` は工程 → 落ちた理由（通ったら `None`）。

    - 通った工程の行は消す（前の書類で落ちていた行も）
    - 落ちた工程は `(会社, 工程)` の行を今の書類で置き換える。**同じ書類で既にあれば `since` を残す**
    """
    out = [p for p in pending if p["edinet_code"] != code or p["stage"] not in results]
    before = {(p["stage"], p["doc_id"]): p for p in pending if p["edinet_code"] == code}
    for stage, reason in results.items():
        if reason is None:
            continue
        prev = before.get((stage, doc))
        out.append({
            "edinet_code": code,
            "stage": stage,
            "doc_id": doc,
            "name": name,
            "reason": reason,
            "since": prev["since"] if prev else today,
        })
    return sorted(out, key=lambda p: (p["edinet_code"], list(STAGES).index(p["stage"])))


# ---------------------------------------------------------------------------
# 読み書き


def read_csv(path):
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def read_pending(path=None):
    return read_csv(path or PENDING)


def write_pending(rows, path=None):
    with open(path or PENDING, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=PENDING_COLUMNS, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def read_pay_policy():
    return json.loads(PAY_POLICY.read_text(encoding="utf-8")) if PAY_POLICY.exists() else []


def write_pay_policy(rows):
    """`pick.write_out` と同じ書き方（1社1行）。並びは変えない。"""
    PAY_POLICY.write_text("[\n" + ",\n".join(json.dumps(x, ensure_ascii=False) for x in rows) + "\n]\n",
                          encoding="utf-8")


def ranking_rows():
    return {r["edinet_code"]: r for r in read_csv(RANKING)}


def today_jst():
    return datetime.now(JST).date().isoformat()


def _prep_path(code):
    return WORK / f"{code}.json"


# ---------------------------------------------------------------------------
# コマンド


def cmd_queue(args):
    entries = ledger.load()
    ranking = ranking_rows()
    first = paypolicy_fetch().FIRST_PERIOD_END
    pending = read_pending()
    everything = select_queue(entries, ranking, pending, first, limit=len(entries))
    picked = everything[: args.limit]
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "queue.json").write_text(json.dumps(
        [{"edinet_code": c, "stages": s} for c, s in picked], ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"文章を合わせる会社 {len(everything)}社のうち、今日の {len(picked)}社（上から順に処理する）", flush=True)
    for code, stages in picked:
        row = ranking[code]
        print(f"  {code} {row['name']}（実測値 {row['rank_raw']}位）: {'・'.join(STAGE_LABELS[s] for s in stages)}",
              flush=True)


def cmd_prepare(args):
    """1社ぶんの原文を取る。工程ごとに「回せるか」を `work/texts/<会社>.json` に残す。

    - 数字の書類の ZIP（CSV 形式）から、分析の4節（`analysis/cache/overlay.csv` とマニフェスト）と
      事業の内容（`business_text.csv` のその会社の行）
    - 給与の決定方針が掛かる期なら、XBRL 本体から節の HTML（`paypolicy/cache/`）
    """
    code = args.code
    entries = ledger.load()
    ranking = ranking_rows()
    if code not in entries or code not in ranking:
        raise SystemExit(f"{code} は台帳かランキングに無い")
    row = ranking[code]
    doc = entries[code]["doc_numbers"]
    if row["doc_id"] != doc:
        raise SystemExit(f"{code} の数字の書類が台帳（{doc}）とランキング（{row['doc_id']}）で違う")
    pp = paypolicy_fetch()
    ready = {}
    try:
        edinet.fetch_csv(doc)
    except Exception as e:  # noqa: BLE001
        reason = f"書類を取れない（{type(e).__name__}: {e}）"
        ready = {"analysis": reason, "description": reason}
    if not ready:
        summary = _load("summary_extract", PIPELINE / "summary" / "extract.py")
        # 分析の原文は、分析を書く会社だけ取る（マニフェストの書類を分析と食い違わせない）
        if applies("analysis", row, pp.FIRST_PERIOD_END):
            analysis = _load("analysis_extract", PIPELINE / "analysis" / "extract_analysis.py")
            _, reason = analysis.update_one(row)
            ready["analysis"] = f"原文が取れない（{reason}）" if reason else None
        _, reason = summary.update_one(row)
        ready["description"] = f"原文が取れない（{reason}）" if reason else None
    else:
        ready = {k: v for k, v in ready.items() if applies(k, row, pp.FIRST_PERIOD_END)}
    if applies("pay_policy", row, pp.FIRST_PERIOD_END):
        pp.CACHE.mkdir(exist_ok=True)
        _, status = pp.fetch_one(doc)
        if status not in ("ok", "cached"):
            ready["pay_policy"] = f"書類を取れない（{status}）"
        else:
            cache = json.loads((pp.CACHE / f"{doc}.json").read_text(encoding="utf-8"))
            n = len(cache.get("section", []))
            ready["pay_policy"] = None if n == 1 else f"人材戦略の節が{n}個ある" if n else "人材戦略の節が無い"
    WORK.mkdir(parents=True, exist_ok=True)
    _prep_path(code).write_text(json.dumps({"doc_id": doc, "ready": ready}, ensure_ascii=False, indent=1),
                                encoding="utf-8")
    print(f"{code} {row['name']}（{doc}）", flush=True)
    for stage, reason in ready.items():
        print(f"  {STAGE_LABELS[stage]}: {'回せる' if reason is None else reason}", flush=True)


def _pay_policy_reason(doc):
    """給与の決定方針の落ちた理由。`gate` の記録（`paypolicy/work/gated_*.json`）から拾う。"""
    reasons = []
    for path in sorted((PIPELINE / "paypolicy" / "work").glob("gated_*.json")):
        g = json.loads(path.read_text(encoding="utf-8"))
        reasons += [e["reason"] for e in g.get("errors", []) if e.get("doc_id") == doc]
        if doc in g.get("missing", []):
            reasons.append("答えが無い")
    return " / ".join(reasons)


def cmd_finish(args):
    """台帳の工程ごとの書類を成果物に合わせ、落ちた工程を文章の待ち行列に書く。

    **通ったかどうかは成果物で決める**——成果物の書類がいまの数字の書類になっていれば通った。
    エージェントの報告は見ない（C6 の「ファイルを数える」と同じ線）。
    """
    code = args.code
    entries = ledger.load()
    ranking = ranking_rows()
    entry = entries[code]
    row = ranking[code]
    doc = entry["doc_numbers"]
    pp_first = paypolicy_fetch().FIRST_PERIOD_END
    prep = json.loads(_prep_path(code).read_text(encoding="utf-8")) if _prep_path(code).exists() else {}
    if prep and prep.get("doc_id") != doc:
        prep = {}

    policies, dropped = drop_unfinished_pay_policy(read_pay_policy(), code, doc)
    if dropped:
        write_pay_policy(policies)
    analysis_rows = {r["edinet_code"]: r for r in read_csv(ANALYSIS)}
    summary_rows = {r["edinet_code"]: r for r in read_csv(SUMMARY)}
    docs = stage_docs(code, analysis_rows, summary_rows, policies)

    results = {}
    for stage, column in STAGES.items():
        entry[column] = docs[stage]
        if not applies(stage, row, pp_first):
            continue
        failure = stage_failure(stage, doc, analysis_rows.get(code), summary_rows.get(code), docs["pay_policy"])
        if failure is None:
            results[stage] = None
            continue
        reason = (prep.get("ready") or {}).get(stage)
        if not reason and stage == "pay_policy":
            reason = "参照先で答え直せなかった" if dropped else _pay_policy_reason(doc)
        results[stage] = reason or failure or "回していない"
    ledger.save(entries)
    write_pending(update_pending(read_pending(), code, row["name"], doc, results, today_jst()))
    print(f"{code} {row['name']}（{doc}）", flush=True)
    for stage, reason in results.items():
        print(f"  {STAGE_LABELS[stage]}: {'新しい書類になった' if reason is None else '前の書類のまま——' + reason}",
              flush=True)


def cmd_status(args):
    entries = ledger.load()
    ranking = ranking_rows()
    pending = read_pending()
    first = paypolicy_fetch().FIRST_PERIOD_END
    rest = select_queue(entries, ranking, pending, first, limit=len(entries))
    print(f"文章を合わせる会社: {len(rest)}社 / 落ちて待っている工程: {len(pending)}件", flush=True)


def main(argv=None):
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    q = sub.add_parser("queue")
    q.add_argument("--limit", type=int, required=True)
    q.set_defaults(func=cmd_queue)
    for name, fn in (("prepare", cmd_prepare), ("finish", cmd_finish)):
        s = sub.add_parser(name)
        s.add_argument("code", help="EDINETコード")
        s.set_defaults(func=fn)
    sub.add_parser("status").set_defaults(func=cmd_status)
    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
