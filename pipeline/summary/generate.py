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
    python3 generate.py retry                          # 落ちた会社だけ書き直しへ（2回まで）
    python3 generate.py merge                          # → ../data/company_summary_2026.csv
    python3 generate.py clear                          # 次の回の前に work/ を空にする
    python3 generate.py status

**落ちた会社を回し直すときは `plan --rejected`**（C17・#840）。CSV で rejected の会社だけを
選び、前回の落ちた理由を添える。`retry` はその回で落ちた会社を、**落ちた文と理由を添えて**
生成側に戻す。書き直しは2回まで（C9・#241 と同じ上限）。

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
import shutil
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

# **書き直しの上限**（C17・#840）。C9 と同じ2回。**通るまで直せるなら、検証パスは
# 落とすことができなくなる**——上限があることが2段目を守っている。
MAX_RETRIES = 2

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


def rejected():
    """CSV で rejected になっている会社（C17・#840）。`(原文の行, 前回の CSV の行)` の並び。

    **ok の会社は選ばない。** 選べてしまうと、通っていた文が回し直しで変わりうる。
    **原文が変わった会社も選ばない**——そちらは `pending()` の仕事で、前回の理由は
    古い原文に対するものになっている。
    """
    have = done()
    out = []
    for code, row in sources().items():
        old = have.get(code)
        if old is None or old.get("verdict") != "rejected":
            continue
        if old.get("source_sha1") != row["text_sha1"]:
            continue
        out.append((row, old))
    return out


def previous_reason(reason):
    """生成側に添える前回の理由。**生成側が自分で空を返した会社には添えない。**

    「説明文が空」は生成側の判断で、検証も機械ゲートも関わっていない。添えると
    「前回は書かなかった」ことが次に書く圧力になる。
    """
    reason = (reason or "").strip()
    return "" if reason in ("", "説明文が空") else reason


def _cut(text, max_chars):
    return text[:max_chars] if max_chars and len(text) > max_chars else text


def _batch_path(kind, n):
    return WORK / f"{kind}_{n:04d}.json"


def _jsonl(path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def cmd_plan(args):
    reasons = {}
    if args.rejected:
        picked = rejected()
        rows = [row for row, _ in picked]
        reasons = {row["edinet_code"]: previous_reason(old.get("reject_reason"))
                   for row, old in picked}
    else:
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
            text = _cut(r["text"], args.max_chars)
            used += len(text)
            item = {
                "edinet_code": r["edinet_code"],
                "sec_code": r["sec_code"],
                "name": r["name"],
                "source": text,
            }
            if reasons.get(r["edinet_code"]):
                item["previous_reason"] = reasons[r["edinet_code"]]
            payload.append(item)
        path = _batch_path("batch", made + 1)
        path.write_text(json.dumps(
            {"batch": made + 1, "companies": payload}, ensure_ascii=False, indent=1
        ), encoding="utf-8")
        made += 1

    label = "rejected" if args.rejected else "未生成"
    print(f"{label} {len(rows)}社 → バッチ {made}本（1本 {args.size}社）", flush=True)
    print(f"エージェントに読ませる原文の量: {used:,}字", flush=True)
    print(f"→ {WORK}/batch_0001.json …", flush=True)


def _round_dirs():
    """書き直しの前の回を退避した場所（`work/round_1/`・`work/round_2/`）。番号順。

    **`retry` が回の中間ファイルを丸ごとここへ移す。** `gate` と検証エージェントは
    `work/` の直下だけを見るので、前の回の `gen_*.jsonl` が次の回に混ざらない。
    `merge` は番号順に読み、**後の回の結果で前の回を上書きする。**
    """
    if not WORK.exists():
        return []
    dirs = [d for d in WORK.glob("round_*") if d.is_dir()]
    return sorted(dirs, key=lambda d: int(d.name.split("_")[1]))


def _generated(where):
    """`where` の `gen_*.jsonl` をバッチと突き合わせて読む。

    **バッチの数と生成物の数が合わなければ止める。** エージェントが「作成した」と
    報告しながらファイルを書いていなかったことが実際にある（2026-08-27）。
    気づけたのは社数が 240 → 180 と目に見えて減ったからで、**1本まるごとではなく
    一部が欠けた場合は、そのまま取り込まれて静かに消える。**
    """
    planned = sorted(where.glob("batch_*.json"))
    produced = sorted(where.glob("gen_*.json*"))
    if len(planned) != len(produced):
        missing = {p.stem.split("_")[1] for p in planned} - {
            p.stem.split("_")[1] for p in produced
        }
        raise SystemExit(
            f"{where.name}: バッチ {len(planned)}本に対して生成物が {len(produced)}本しかない"
            f"（欠けているのは {', '.join(sorted(missing)) or '不明'}）。"
            "そのバッチを回し直してから実行すること。"
        )
    out = []
    for path in produced:
        n = int(path.stem.split("_")[1])
        # **社数も突き合わせる。** 途中で切れた出力は行数が足りない。
        batch = where / f"batch_{n:04d}.json"
        want = len(json.loads(batch.read_text(encoding="utf-8"))["companies"])
        recs = _jsonl(path)
        if want != len(recs):
            raise SystemExit(
                f"{where.name}/{path.name}: {want}社のバッチに {len(recs)}行しかない。回し直すこと。"
            )
        out += recs
    return out


def _check_verified(where):
    """`gated_*.json` のすべてに、同じ社数の `verify_*.jsonl` があるか。

    **無ければ止める。** C6 の `merge` は検証の無い会社を「検証パス未実施」として
    rejected にしていたが、`retry` がそれを「落ちた」と読むと、検証していない文を
    書き直しに回してしまう。
    """
    for gated in sorted(where.glob("gated_*.json")):
        n = int(gated.stem.split("_")[1])
        want = len(json.loads(gated.read_text(encoding="utf-8"))["companies"])
        got = len(_jsonl(where / f"verify_{n:04d}.jsonl"))
        if want != got:
            raise SystemExit(
                f"{where.name}/{gated.name}: {want}社に対して検証が {got}行しかない。"
                "検証エージェントを回し直すこと。"
            )


def _results(where, src):
    """1回ぶんの結果。`edinet_code → {summary, reason, raw}`。

    `summary` は機械ゲートと検証パスの両方を通った文（通らなければ空）、`reason` は
    落ちた理由、`raw` は生成側が書いたそのままの文。**`raw` が空なのは生成側が自分で
    書かないと判断した会社で、`retry` はこれを書き直しに回さない。**
    """
    verdicts = {}
    for path in sorted(where.glob("verify_*.json*")):
        for rec in _jsonl(path):
            verdicts[rec["edinet_code"]] = rec
    out = {}
    for rec in _generated(where):
        code = rec["edinet_code"]
        row = src.get(code)
        if row is None:
            continue
        raw = (rec.get("summary") or "").strip()
        text, gate_reasons = gate.apply_gate(raw, row["name"], row["text"])
        reason = "" if text else " / ".join(gate_reasons)
        if text:
            v = verdicts.get(code)
            if v is None:
                reason = "検証パス未実施"
                text = ""
            elif not v.get("supported"):
                reason = "検証パス: " + (v.get("reason") or "原文から支持されない")
                text = ""
        out[code] = {"summary": text, "reason": reason, "raw": raw}
    return out


def cmd_gate(args):
    """生成された説明文に機械ゲートを当て、**通ったものだけ**を検証に回す。

    **検証に渡すファイルは `--chunk` 社ずつに割る。** `Read` は256KBまでしか読めず、
    超えるとエージェントが分割して読むために手数が増える（実測で30手かかった回がある）。
    1ターンの費用は「固定費＋そこまでに積んだ文脈」なので、**手数が増えることが
    そのまま高くつく。**

    **渡す原文は打ち切らない。** 生成には2,000字までしか見せていないが、検証は
    配っている原文そのものに対して行う（切った先のことを述べていたら支持されていない）。

    **書き直しの回でも、前の回の文と落ちた理由は検証に渡さない**（C17・#840）。
    渡すのは初回と同じ4つだけで、検証は書き直した文を独立に判定する。
    """
    src = sources()
    total = passed = 0
    out = []
    # **開いたまま残さない。** `retry` がこのファイルを `round_N/` へ移す。
    with (WORK / "gate_reasons.jsonl").open("a", encoding="utf-8") as log:
        for rec in _generated(WORK):
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
            log.write(json.dumps({"edinet_code": code, "passed": bool(text),
                                  "reasons": reasons}, ensure_ascii=False) + "\n")

    chunks = [out[i : i + args.chunk] for i in range(0, len(out), args.chunk)]
    for i, companies in enumerate(chunks, 1):
        _batch_path("gated", i).write_text(
            json.dumps({"batch": i, "companies": companies}, ensure_ascii=False, indent=1),
            encoding="utf-8")
    print(f"機械ゲート: {passed}/{total}社 通過 → 検証は {len(chunks)}本"
          f"（1本 {args.chunk}社まで）", flush=True)


def cmd_retry(args):
    """その回で落ちた会社だけを、**落ちた文と理由を添えて**生成側に戻す（C17・#840）。

    C6 には書き直しが無く、検証で1回落ちたらそのまま空にしていた。落ちた型の大半は
    「重みを付けた」「子会社と断定した」のような言い過ぎで、1文を直せば通る——C9 は
    同じ二段構えに書き直しを入れて全社を通している。

    **回の中間ファイルは `work/round_N/` へ移す。** `work/` の直下には次の回の
    `batch_*.json` だけが残るので、`gate` と検証エージェントは初回と同じ手順で回せる。

    **書き直しに回さないもの。** 通った会社と、**生成側が自分で空を返した会社**
    （原文に事業の中身が無いと判断した。ENEOS がこれ）。後者を戻すと「前回は
    書かなかった」ことが書く圧力になる。

    **上限は `MAX_RETRIES` 回。** 超えて呼ぶと止める。残った会社は空のまま `merge` する。
    """
    rounds = _round_dirs()
    if len(rounds) >= MAX_RETRIES:
        raise SystemExit(
            f"書き直しは {MAX_RETRIES}回まで（既に {len(rounds)}回）。"
            "残った会社は空のまま merge すること。"
        )
    _check_verified(WORK)
    src = sources()
    results = _results(WORK, src)
    failed = [(code, r) for code, r in results.items() if not r["summary"] and r["raw"]]
    if not failed:
        print("書き直す会社は無い。merge してよい。", flush=True)
        return

    dest = WORK / f"round_{len(rounds) + 1}"
    dest.mkdir()
    for path in list(WORK.iterdir()):
        if path.is_file():
            shutil.move(str(path), str(dest / path.name))

    items = []
    for code, r in failed:
        row = src[code]
        items.append({
            "edinet_code": code,
            "sec_code": row["sec_code"],
            "name": row["name"],
            "source": _cut(row["text"], args.max_chars),
            "previous": r["raw"],
            "previous_reason": r["reason"],
        })
    made = 0
    for i in range(0, len(items), args.size):
        made += 1
        _batch_path("batch", made).write_text(json.dumps(
            {"batch": made, "retry": len(rounds) + 1, "companies": items[i : i + args.size]},
            ensure_ascii=False, indent=1), encoding="utf-8")
    passed = sum(1 for r in results.values() if r["summary"])
    print(f"この回: {len(results)}社 → 通過 {passed}社 / 書き直し {len(items)}社"
          f"（{len(rounds) + 1}回目の書き直し・上限 {MAX_RETRIES}回）", flush=True)
    print(f"前の回は {dest} へ移した → {WORK}/batch_0001.json …（{made}本）", flush=True)


def cmd_merge(args):
    """ゲートと検証の結果を CSV に取り込む。**verdict が ok 以外は説明文を空にする。**

    **書き直しがあれば、回の番号順に読んで後の回で上書きする**（`work/round_1/` →
    `work/round_2/` → `work/`）。ある回で通った会社は次の回に回らないので、上書き
    されるのは落ちた会社だけになる。
    """
    src = sources()
    final = {}
    for where in _round_dirs() + [WORK]:
        _check_verified(where)
        final.update(_results(where, src))

    rows = done()
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    counts = {"ok": 0, "rejected": 0}
    reasons = {}
    for code, r in final.items():
        row = src[code]
        text, reason = r["summary"], r["reason"]
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
    **別の会社の生成物が次の回の取り込みに混ざる。** 消すのは中間ファイルと
    書き直しで退避した回（`work/round_N/`）で、成果物（`company_summary_2026.csv`）には触らない。
    """
    n = 0
    if WORK.exists():
        for path in WORK.glob("*"):
            if path.is_file():
                path.unlink()
                n += 1
        for d in _round_dirs():
            n += sum(1 for p in d.glob("*") if p.is_file())
            shutil.rmtree(d)
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
    rounds = _round_dirs()
    if rounds:
        print(f"書き直し {len(rounds)}回目の途中（上限 {MAX_RETRIES}回）", flush=True)


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
    # C17（#840）。CSV で rejected の会社だけを選び、前回の落ちた理由を添える。
    a.add_argument("--rejected", action="store_true", help="rejected の会社だけを選ぶ")
    a.set_defaults(func=cmd_plan)

    b = sub.add_parser("gate")
    # 25社で 100〜200KB。`Read` の 256KB に収まる大きさにしてある。**30社にすると
    # 原文の長い会社が集まった1本が 256KB ちょうどに達した**ので、余裕を持たせてある。
    b.add_argument("--chunk", type=int, default=25)
    b.set_defaults(func=cmd_gate)

    r = sub.add_parser("retry")
    # 1回あたりの社数は落ちた会社の数で決まるので、plan と違って --batches は取らない。
    r.add_argument("--size", type=int, default=60)
    r.add_argument("--max-chars", type=int, default=2000, help="0で打ち切らない")
    r.set_defaults(func=cmd_retry)

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
