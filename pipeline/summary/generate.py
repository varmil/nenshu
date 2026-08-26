"""説明文の生成を回す。**LLM は呼ばない。** 呼ぶのはセッションのエージェント。

C6（[#160](https://github.com/varmil/nenshu/issues/160)・親 #158・ADR-0010）。
ADR-0010 の追記（2026-08-26）のとおり **Anthropic API は使わず、生成と検証は
Claude Code のセッションで回す**。このスクリプトが持つのは、その前後にある
**機械の仕事だけ**——原文をバッチに切り、機械ゲート（`gate.py`）を当て、CSV に
取り込み、進み具合を数える。

    python3 generate.py plan   --size 20 --batches 3   # work/batch_0001.json …
    （エージェントが prompts/generate.md に従って work/gen_0001.jsonl を書く）
    python3 generate.py gate                           # work/gated_0001.json …
    （エージェントが prompts/verify.md に従って work/verify_0001.jsonl を書く）
    python3 generate.py merge                          # → ../data/company_summary_2026.csv
    python3 generate.py clear                          # 次の回の前に work/ を空にする
    python3 generate.py status

**1回では全社ぶんが回らない**（原文は2,960社で535万字）。`plan` は
`company_summary_2026.csv` に載っていない会社と、**原文の SHA-1 が変わった会社**
だけを選ぶので、回すたびに進む（AC-8）。

**生成に渡す原文は2,000字で切るが、検証パスに渡すのは原文の全部。** 切った先に
書いてあることを説明文が述べていたら、それは原文が支えていない——**検証は配って
いる原文そのものに対して行う**（`gate` が `business_text_2026.csv` の全文を渡す）。
"""

import argparse
import csv
import json
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gate  # noqa: E402

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "../data/business_text_2026.csv"
OUT = ROOT / "../data/company_summary_2026.csv"
WORK = ROOT / "work"

HEADERS = [
    "edinet_code",
    "sec_code",
    "summary",
    "source_doc_id",
    "source_period_end",
    "source_sha1",
    "model",
    "generated_at",
    "verdict",
    "reject_reason",
]

# 目視の回帰ケース（AC-5・AC-7）。**パイロットには必ず入れる。**
PILOT_ANCHORS = ("6861", "5020", "9904", "2329", "2395")

csv.field_size_limit(10 * 1024 * 1024)


def read_csv(path):
    if not Path(path).exists():
        return []
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def sources():
    return {r["edinet_code"]: r for r in read_csv(SOURCE)}


def done():
    """既に説明文を持っている会社。`edinet_code → 行`。"""
    return {r["edinet_code"]: r for r in read_csv(OUT)}


def pending(force=False):
    """未生成の会社。**原文の SHA-1 が変わった会社も入れる**（AC-8）。"""
    have = {} if force else done()
    out = []
    for code, row in sources().items():
        old = have.get(code)
        if old is not None and old.get("source_sha1") == row["text_sha1"]:
            continue
        out.append(row)
    return out


def _batch_path(kind, n):
    return WORK / f"{kind}_{n:04d}.json"


def _jsonl(path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def cmd_plan(args):
    rows = pending(force=args.force)
    if args.pilot:
        by_sec = {r["sec_code"]: r for r in rows if r["sec_code"]}
        anchors = [by_sec[s] for s in PILOT_ANCHORS if s in by_sec]
        rest = [r for r in rows if r not in anchors]
        random.Random(args.seed).shuffle(rest)
        rows = anchors + rest[: max(0, args.size * args.batches - len(anchors))]

    WORK.mkdir(exist_ok=True)
    made = 0
    used = 0
    for i in range(args.batches):
        chunk = rows[i * args.size : (i + 1) * args.size]
        if not chunk:
            break
        payload = []
        for r in chunk:
            text = r["text"]
            if args.max_chars and len(text) > args.max_chars:
                text = text[: args.max_chars]
            used += len(text)
            payload.append({
                "edinet_code": r["edinet_code"],
                "sec_code": r["sec_code"],
                "name": r["name"],
                "source": text,
            })
        path = _batch_path("batch", made + 1)
        path.write_text(json.dumps(
            {"batch": made + 1, "companies": payload}, ensure_ascii=False, indent=1
        ), encoding="utf-8")
        made += 1

    print(f"未生成 {len(rows) if args.pilot else len(pending(force=args.force))}社 "
          f"→ バッチ {made}本（1本 {args.size}社）", flush=True)
    print(f"エージェントに読ませる原文の量: {used:,}字", flush=True)
    print(f"→ {WORK}/batch_0001.json …", flush=True)


def cmd_gate(args):
    """生成された説明文に機械ゲートを当て、**通ったものだけ**を検証に回す。

    **検証に渡すファイルは `--chunk` 社ずつに割る。** `Read` は256KBまでしか読めず、
    超えるとエージェントが分割して読むために手数が増える（実測で30手かかった回がある）。
    1ターンの費用は「固定費＋そこまでに積んだ文脈」なので、**手数が増えることが
    そのまま高くつく。**

    **渡す原文は打ち切らない。** 生成には2,000字までしか見せていないが、検証は
    配っている原文そのものに対して行う（切った先のことを述べていたら支持されていない）。
    """
    src = sources()
    total = passed = 0
    chunks = []
    for path in sorted(WORK.glob("gen_*.json*")):
        n = int(path.stem.split("_")[1])
        out = []
        for rec in _jsonl(path):
            code = rec["edinet_code"]
            row = src.get(code)
            if row is None:
                continue
            total += 1
            text, reasons = gate.apply_gate(rec.get("summary", ""), row["name"], row["text"])
            if text:
                passed += 1
                out.append({"edinet_code": code, "name": row["name"],
                            "summary": text, "source": row["text"]})
            (WORK / "gate_reasons.jsonl").open("a", encoding="utf-8").write(
                json.dumps({"edinet_code": code, "passed": bool(text),
                            "reasons": reasons}, ensure_ascii=False) + "\n")
        for i in range(0, len(out), args.chunk):
            chunks.append(out[i : i + args.chunk])

    for i, companies in enumerate(chunks, 1):
        _batch_path("gated", i).write_text(
            json.dumps({"batch": i, "companies": companies}, ensure_ascii=False, indent=1),
            encoding="utf-8")
    print(f"機械ゲート: {passed}/{total}社 通過 → 検証は {len(chunks)}本"
          f"（1本 {args.chunk}社まで）", flush=True)


def cmd_merge(args):
    """ゲートと検証の結果を CSV に取り込む。**verdict が ok 以外は説明文を空にする。**"""
    src = sources()
    verdicts = {}
    for path in sorted(WORK.glob("verify_*.json*")):
        for rec in _jsonl(path):
            verdicts[rec["edinet_code"]] = rec

    rows = done()
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    counts = {"ok": 0, "rejected": 0}
    reasons = {}
    for path in sorted(WORK.glob("gen_*.json*")):
        for rec in _jsonl(path):
            code = rec["edinet_code"]
            row = src.get(code)
            if row is None:
                continue
            text, gate_reasons = gate.apply_gate(rec.get("summary", ""), row["name"], row["text"])
            reason = "" if text else " / ".join(gate_reasons)
            if text:
                v = verdicts.get(code)
                if v is None:
                    reason = "検証パス未実施"
                    text = ""
                elif not v.get("supported"):
                    reason = "検証パス: " + (v.get("reason") or "原文から支持されない")
                    text = ""
            verdict = "ok" if text else "rejected"
            counts[verdict] += 1
            if reason:
                head = reason.split("（")[0].split(":")[0].strip()
                reasons[head] = reasons.get(head, 0) + 1
            rows[code] = {
                "edinet_code": code,
                "sec_code": row["sec_code"],
                "summary": text,
                "source_doc_id": row["doc_id"],
                "source_period_end": row["period_end"],
                "source_sha1": row["text_sha1"],
                "model": args.model,
                "generated_at": stamp,
                "verdict": verdict,
                "reject_reason": reason,
            }

    order = list(src)
    ordered = [rows[c] for c in order if c in rows]
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADERS)
        w.writeheader()
        for r in ordered:
            w.writerow(r)

    n = counts["ok"] + counts["rejected"]
    print(f"この回: {n}社 → ok {counts['ok']}社 / rejected {counts['rejected']}社", flush=True)
    for k, v in sorted(reasons.items(), key=lambda kv: -kv[1]):
        print(f"  {k}: {v}社", flush=True)
    print(f"→ {OUT}（{len(ordered)}行）", flush=True)


def cmd_clear(args):
    """作業ディレクトリを空にする。**`merge` が済んだ回の後に必ず呼ぶ。**

    `plan` は `batch_0001.json` から振り直すので、前の回の `gen_*.jsonl` が残っていると
    **別の会社の生成物が次の回の取り込みに混ざる。** 消すのは中間ファイルだけで、
    成果物（`company_summary_2026.csv`）には触らない。
    """
    n = 0
    for path in WORK.glob("*"):
        if path.is_file():
            path.unlink()
            n += 1
    print(f"work/ を空にした（{n}ファイル）", flush=True)


def cmd_status(args):
    src = sources()
    have = done()
    ok = sum(1 for r in have.values() if r["verdict"] == "ok")
    stale = sum(1 for c, r in have.items()
                if c in src and r.get("source_sha1") != src[c]["text_sha1"])
    print(f"原文 {len(src)}社 / 生成済み {len(have)}社"
          f"（ok {ok}社・rejected {len(have) - ok}社）", flush=True)
    print(f"未生成 {len(src) - len(have)}社 / 原文が変わって作り直しが要る {stale}社", flush=True)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("plan")
    a.add_argument("--size", type=int, default=20)
    a.add_argument("--batches", type=int, default=1)
    # **既定で2,000字に切る**（C6 のパイロットで決めた。design.md 参照）。原文の
    # 26%が切られるが、実測した8社すべてで説明文の質は落ちず、機械ゲートも
    # **打ち切り前の原文に対して**全通過した。`--max-chars 0` で切らない。
    a.add_argument("--max-chars", type=int, default=2000, help="0で打ち切らない")
    a.add_argument("--pilot", action="store_true", help="回帰ケース＋無作為で選ぶ")
    a.add_argument("--seed", type=int, default=20260826)
    a.add_argument("--force", action="store_true")
    a.set_defaults(func=cmd_plan)

    b = sub.add_parser("gate")
    # 25社で 100〜200KB。`Read` の 256KB に収まる大きさにしてある。**30社にすると
    # 原文の長い会社が集まった1本が 256KB ちょうどに達した**ので、余裕を持たせてある。
    b.add_argument("--chunk", type=int, default=25)
    b.set_defaults(func=cmd_gate)

    c = sub.add_parser("merge")
    c.add_argument("--model", default="claude-opus-5")
    c.set_defaults(func=cmd_merge)

    d = sub.add_parser("clear")
    d.set_defaults(func=cmd_clear)

    e = sub.add_parser("status")
    e.set_defaults(func=cmd_status)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
