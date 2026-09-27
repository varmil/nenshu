"""給与の決定方針の範囲を判定させ、原文を切り出す（C18・#851・親 #850）。

**LLM は呼ばない。** 呼ぶのはセッションのエージェント（C6・C9 と同じ。API キーは使わない）。
このスクリプトが持つのは、その前後にある機械の仕事だけ。

    python3 pick.py check                          # 全キャッシュで、分解が原文と一致するか
    python3 pick.py plan --size 40 --batches 3     # work/batch_0001.json …
    （エージェントが prompts/pick.md に従って work/pick_0001.jsonl を書く）
    python3 pick.py gate                           # 範囲を確かめて work/gated_0001.json …
    python3 pick.py merge                          # → ../data/pay_policy_2026.json
    python3 pick.py plan --referenced ...          # 参照だけの会社を、サステナビリティの節で回す
    python3 pick.py compare                        # 起票前に読んだ40社と突き合わせる
    python3 pick.py clear                          # 次の回の前に work/ を空にする
    python3 pick.py status

**生成AIには文を書かせない。** バッチには番号を振った文の列（`blocks.render`）を入れ、
エージェントは「どの番号からどの番号までか」だけを答える。本文は `blocks.cut` が原文から
組み立てるので、**文が変わることが構造上起きない**。確かめるのは範囲の取り違えで、
それは機械では判定できないので、40社の突き合わせ（`compare`）と目視で見る。

**参照だけの会社は2回に分けて回す。** 節の中で「給与の決定方針は第2 事業の状況 2 サステ
ナビリティ…をご参照ください」とだけ書く会社がある（KDDI・兼松）。1回目で `referenced` と
答えたら、2回目（`plan --referenced`）でサステナビリティの節を見せて同じことを答えさせる。
全社にサステナビリティの節まで見せると、読む量が数倍になる。
"""

import argparse
import csv
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import blocks as B  # noqa: E402
import fetch  # noqa: E402

WORK = ROOT / "work"
OUT = ROOT / "../data/pay_policy_2026.json"
SAMPLE40 = ROOT / "../../docs/company/pay-policy-text/sample40.json"

VERDICTS = {"own", "referenced", "none"}

# spec 1.23 の AC-35 が名指しする会社。**パイロットには必ず入れる。**
ANCHORS = ("7203", "6501", "9433", "9501")


# ── 入力 ──────────────────────────────────────────────────────────


def companies():
    """対象の会社を書類 ID で引く辞書。`ranking_unified_2026.csv` の並びのまま。"""
    return {r["doc_id"]: r for r in fetch.targets()}


def cached(doc_id):
    path = fetch.CACHE / f"{doc_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def source_html(cache, source):
    """節の HTML。**同じ節が2つ以上あったら None**（どちらを採るか決めていない）。"""
    items = cache.get(source, [])
    if len(items) != 1:
        return None
    return items[0]["html"]


def sha1(text):
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def read_out():
    if not OUT.exists():
        return {}
    return {r["doc_id"]: r for r in json.loads(OUT.read_text(encoding="utf-8"))}


def _jsonl(path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _batch_path(kind, n, ext="json"):
    return WORK / f"{kind}_{n:04d}.{ext}"


# ── check ─────────────────────────────────────────────────────────


def cmd_check(args):
    """全キャッシュで、塊への分解が空白以外の文字を1字も落としていないかを確かめる。"""
    comp = companies()
    counts = {"ok": 0, "no_cache": 0, "no_section": 0, "multi_section": 0}
    bad = []
    for doc_id in comp:
        cache = cached(doc_id)
        if cache is None:
            counts["no_cache"] += 1
            continue
        n = len(cache.get("section", []))
        if n == 0:
            counts["no_section"] += 1
            continue
        if n > 1:
            counts["multi_section"] += 1
        for key in ("section", "sustainability"):
            for item in cache.get(key, []):
                bl = B.parse(item["html"])
                got = B.squash("".join(B.block_text(b) for b in bl))
                if got != B.squash(B.plain_text(item["html"])):
                    bad.append((doc_id, key))
                for b in bl:
                    if b["kind"] == "para" and "".join(b["sentences"]) != b["text"]:
                        bad.append((doc_id, key, "sentences"))
        counts["ok"] += 1
    print(f"対象 {len(comp)}件: " + " / ".join(f"{k} {v}" for k, v in counts.items()))
    print(f"分解が原文と一致しない: {len(bad)}件")
    for x in bad[:20]:
        print("  ", x)
    return 1 if bad else 0


# ── plan ──────────────────────────────────────────────────────────


def pending(referenced=False):
    """まだ判定していない会社（原文が変わった会社を含む）。`referenced` なら参照だけの会社。"""
    comp = companies()
    out = read_out()
    rows = []
    for doc_id, r in comp.items():
        cache = cached(doc_id)
        if cache is None:
            continue
        prev = out.get(doc_id)
        if referenced:
            if prev and prev.get("verdict") == "referenced":
                html = source_html(cache, "sustainability")
                if html is not None:
                    rows.append((r, "sustainability", html))
            continue
        html = source_html(cache, "section")
        if html is None:
            continue
        if prev and prev.get("section_sha1") == sha1(html):
            continue
        rows.append((r, "section", html))
    return rows


def cmd_plan(args):
    rows = pending(referenced=args.referenced)
    if args.docs:
        want = args.docs.split(",")
        rows = [x for x in rows if x[0]["doc_id"] in want]
    elif args.pilot:
        anchors = [x for x in rows if x[0]["sec_code"] in ANCHORS]
        rows = anchors + [x for x in rows if x not in anchors]
    WORK.mkdir(exist_ok=True)
    start = len(list(WORK.glob("batch_*.json")))
    made = used = 0
    for i in range(args.batches):
        chunk = rows[i * args.size:(i + 1) * args.size]
        if not chunk:
            break
        payload = []
        for r, source, html in chunk:
            text = B.render(B.parse(html))
            used += len(text)
            payload.append({
                "doc_id": r["doc_id"],
                "sec_code": r["sec_code"],
                "name": r["name"],
                "source": source,
                "units": text,
            })
        path = _batch_path("batch", start + made + 1)
        path.write_text(json.dumps({"batch": start + made + 1, "companies": payload},
                                   ensure_ascii=False, indent=1), encoding="utf-8")
        made += 1
    label = "参照だけの会社" if args.referenced else "未判定"
    print(f"{label} {len(rows)}社 → バッチ {made}本（1本 {args.size}社）")
    print(f"エージェントに読ませる量: {used:,}字")


# ── gate ──────────────────────────────────────────────────────────


def judge(blocks, pick, source):
    """エージェントの答え1件を確かめ、本文を組み立てる。**落とす理由は文字列で返す。**

    戻り値は (記録, 落とした理由)。どちらか一方が None。
    """
    verdict = pick.get("verdict")
    if verdict not in VERDICTS:
        return None, f"verdict が不正: {verdict!r}"
    if source == "sustainability" and verdict == "referenced":
        return None, "参照先の節でさらに参照と答えた"
    if verdict != "own":
        return {"verdict": verdict, "title": None, "blocks": [], "note": pick.get("note", "")}, None
    try:
        body = B.cut(blocks, pick.get("start"), pick.get("end"))
    except ValueError as e:
        return None, str(e)
    if not body:
        return None, "範囲が空"
    title = None
    if pick.get("title"):
        try:
            ti, ts = B.parse_id(pick["title"])
        except ValueError as e:
            return None, f"title: {e}"
        bs, _ = B.parse_id(pick["start"])
        if ts is not None or not 1 <= ti <= len(blocks) or blocks[ti - 1]["kind"] != "heading":
            return None, f"title が小見出しの塊でない: {pick['title']}"
        if ti >= bs:
            return None, f"title が範囲の始まりより後ろ: {pick['title']}"
        title = blocks[ti - 1]["text"]
    return {"verdict": verdict, "title": title, "blocks": body, "note": pick.get("note", "")}, None


def cmd_gate(args):
    ok = ng = 0
    for bpath in sorted(WORK.glob("batch_*.json")):
        n = int(bpath.stem.split("_")[1])
        ppath = _batch_path("pick", n, "jsonl")
        if not ppath.exists():
            print(f"  {ppath.name} がまだ無い")
            continue
        batch = json.loads(bpath.read_text(encoding="utf-8"))["companies"]
        picks = {p.get("doc_id"): p for p in _jsonl(ppath)}
        # **エージェントの報告ではなく、ファイルで数える**（C6 で食い違いが4回起きた）
        missing = [c["doc_id"] for c in batch if c["doc_id"] not in picks]
        extra = [d for d in picks if d not in {c["doc_id"] for c in batch}]
        results, errors = [], []
        for c in batch:
            p = picks.get(c["doc_id"])
            if p is None:
                continue
            cache = cached(c["doc_id"])
            html = source_html(cache, c["source"])
            rec, err = judge(B.parse(html), p, c["source"])
            if err:
                errors.append({"doc_id": c["doc_id"], "reason": err, "pick": p})
                continue
            rec.update({"doc_id": c["doc_id"], "source": c["source"], "source_sha1": sha1(html)})
            results.append(rec)
        _batch_path("gated", n).write_text(json.dumps(
            {"results": results, "errors": errors, "missing": missing, "extra": extra},
            ensure_ascii=False, indent=1), encoding="utf-8")
        ok += len(results)
        ng += len(errors) + len(missing)
        print(f"  batch {n:04d}: 通った {len(results)} / 落ちた {len(errors)} / 答えが無い {len(missing)}"
              + (f" / バッチに無い会社 {len(extra)}" if extra else ""))
        for e in errors:
            print(f"    {e['doc_id']}: {e['reason']}")
    print(f"通った {ok}社 / 回し直しが要る {ng}社")


# ── merge ─────────────────────────────────────────────────────────


def stats(body):
    text = "".join(B.block_text(b) for b in body)
    return {
        "chars": len(B.squash(text)),
        "has_table": any(b["kind"] == "table" for b in body),
        "has_image": any(b["kind"] == "image" for b in body),
    }


def cmd_merge(args):
    comp = companies()
    out = read_out()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    merged = 0
    for gpath in sorted(WORK.glob("gated_*.json")):
        for rec in json.loads(gpath.read_text(encoding="utf-8"))["results"]:
            r = comp[rec["doc_id"]]
            prev = out.get(rec["doc_id"], {})
            row = {
                "doc_id": rec["doc_id"],
                "edinet_code": r["edinet_code"],
                "sec_code": r["sec_code"],
                "name": r["name"],
                "period_end": r["period_end"],
            }
            if rec["source"] == "section":
                row.update({"section_sha1": rec["source_sha1"], "verdict": rec["verdict"]})
                if rec["verdict"] == "own":
                    row["source"] = "section"
            else:
                # 参照先で判定した結果。節の SHA-1 と、節で「参照だけ」と答えたことは残す
                row.update({"section_sha1": prev.get("section_sha1"), "referenced": True,
                            "sustainability_sha1": rec["source_sha1"], "verdict": rec["verdict"]})
                if rec["verdict"] == "own":
                    row["source"] = "sustainability"
            row.update({"title": rec["title"], "blocks": rec["blocks"], **stats(rec["blocks"]),
                        "note": rec["note"], "picked_at": today})
            out[rec["doc_id"]] = row
            merged += 1
    order = list(comp)
    rows = sorted(out.values(), key=lambda x: order.index(x["doc_id"]) if x["doc_id"] in comp else len(order))
    OUT.write_text("[\n" + ",\n".join(json.dumps(x, ensure_ascii=False) for x in rows) + "\n]\n",
                   encoding="utf-8")
    print(f"取り込み {merged}件 → {OUT.name}（{len(rows)}社）")


# ── compare ───────────────────────────────────────────────────────


def cmd_compare(args):
    """起票前に1社ずつ読んだ40社（PDF から起こした）と突き合わせる。空白を落として比べる。"""
    sample = json.loads(SAMPLE40.read_text(encoding="utf-8"))
    out = read_out()
    same = sub = sup = diff = missing = 0
    for s in sample:
        r = out.get(s["doc_id"])
        if r is None:
            missing += 1
            continue
        want_none = s["status"] == "absent"
        got_none = r["verdict"] != "own"
        want = B.squash(s["pay_text"])
        got = B.squash("".join(B.block_text(b) for b in r.get("blocks", [])))
        if want_none or got_none or r["verdict"] == "referenced":
            label = "一致" if want_none == got_none and r["verdict"] != "referenced" else "食い違い"
            same += label == "一致"
            diff += label == "食い違い"
            print(f"  {label} {s['name']}: 40社={s['status']} / 判定={r['verdict']}")
            continue
        if got == want:
            same += 1
            continue
        if got in want:
            sub += 1
            kind = "判定のほうが短い"
        elif want in got:
            sup += 1
            kind = "判定のほうが長い"
        else:
            diff += 1
            kind = "ずれ"
        print(f"  {kind} {s['name']}: 40社 {len(want)}字 / 判定 {len(got)}字")
        if args.verbose:
            print(f"    40社: {want[:80]}…{want[-40:]}")
            print(f"    判定: {got[:80]}…{got[-40:]}")
    print(f"一致 {same} / 判定のほうが短い {sub} / 長い {sup} / ずれ {diff} / 未判定 {missing}")


# ── clear / status ────────────────────────────────────────────────


def cmd_clear(args):
    if WORK.exists():
        shutil.rmtree(WORK)
    print("work/ を空にした")


def cmd_status(args):
    comp = companies()
    out = read_out()
    no_cache = sum(1 for d in comp if cached(d) is None)
    by = {}
    for d in comp:
        r = out.get(d)
        key = r["verdict"] if r else "未判定"
        if r and r.get("verdict") == "own":
            key = f"own（{r['source']}）"
        by[key] = by.get(key, 0) + 1
    print(f"対象 {len(comp)}社 / キャッシュ無し {no_cache}社")
    for k, v in sorted(by.items(), key=lambda kv: -kv[1]):
        print(f"  {k}: {v}社")
    chars = sorted(r["chars"] for r in out.values() if r.get("verdict") == "own")
    if chars:
        mid = chars[len(chars) // 2]
        print(f"  字数: 最短 {chars[0]} / 中央値 {mid} / 最長 {chars[-1]}"
              f" / 1,000字超 {sum(c > 1000 for c in chars)}社")
        print(f"  表を含む {sum(r['has_table'] for r in out.values() if r.get('verdict') == 'own')}社"
              f" / 画像を含む {sum(r['has_image'] for r in out.values() if r.get('verdict') == 'own')}社")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check").set_defaults(fn=cmd_check)
    p = sub.add_parser("plan")
    p.add_argument("--size", type=int, default=40)
    p.add_argument("--batches", type=int, default=1)
    p.add_argument("--referenced", action="store_true")
    p.add_argument("--pilot", action="store_true", help="AC-35 の会社を先頭に入れる")
    p.add_argument("--docs", default="", help="書類 ID をカンマ区切りで（40社の突き合わせ用）")
    p.set_defaults(fn=cmd_plan)
    sub.add_parser("gate").set_defaults(fn=cmd_gate)
    sub.add_parser("merge").set_defaults(fn=cmd_merge)
    c = sub.add_parser("compare")
    c.add_argument("-v", "--verbose", action="store_true")
    c.set_defaults(fn=cmd_compare)
    sub.add_parser("clear").set_defaults(fn=cmd_clear)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    args = ap.parse_args()
    sys.exit(args.fn(args) or 0)


if __name__ == "__main__":
    main()
