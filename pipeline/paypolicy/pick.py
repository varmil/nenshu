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
    python3 pick.py verify                         # AC-35 の実行ログ（社数・空の理由・原文との突き合わせ）
    python3 pick.py recut                          # 分解の規則を直したあと、書き出した番号から切り直す
    python3 pick.py clear                          # 次の回の前に work/ を空にする
    python3 pick.py status

**生成AIには文を書かせない。** バッチには番号を振った文の列（`blocks.render`）を入れ、
エージェントは「どの番号からどの番号までか」だけを答える。本文は `blocks.cut` が原文から
組み立てるので、**文が変わることが構造上起きない**。確かめるのは範囲の取り違えで、
それは機械では判定できないので、40社の突き合わせ（`compare`）と目視で見る。

**参照だけの会社は2回に分けて回す。** 節の中で「給与の決定方針は第2 事業の状況 2 サステ
ナビリティ…をご参照ください」とだけ書く会社がある（KDDI・兼松）。1回目で `referenced` と
答えたら、2回目（`plan --referenced`）で参照先の節を見せて同じことを答えさせる。参照先は
ほとんどがサステナビリティの節で、「従業員の状況」を指す会社（LIXIL）だけそちらを見せる
（`reference_target`）。全社に参照先の節まで見せると、読む量が数倍になる。
"""

import argparse
import csv
import hashlib
import json
import re
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
        for key in ("section", "sustainability", "employees"):
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


def pending(referenced=False, force=False):
    """まだ判定していない会社（原文が変わった会社を含む）。`referenced` なら参照の会社。

    `force` なら判定済みの会社も選ぶ（指示を直して回し直すとき）。
    """
    comp = companies()
    out = {} if force else read_out()
    rows = []
    for doc_id, r in comp.items():
        cache = cached(doc_id)
        if cache is None:
            continue
        prev = out.get(doc_id)
        if referenced:
            if prev and prev.get("verdict") == "referenced":
                target = reference_target(source_html(cache, "section"))
                html = source_html(cache, target)
                if html is not None:
                    rows.append((r, target, html))
            continue
        html = source_html(cache, "section")
        if html is None:
            continue
        if prev and prev.get("section_sha1") == sha1(html):
            continue
        rows.append((r, "section", html))
    return rows


# 参照文が給与の決定方針の在りかとして「従業員の状況」を指しているか（LIXIL は
# 「従業員給与等の…決定に関する方針は、『（２）従業員の状況 ⑤ …』に記載のとおりです。」）
_EMPLOYEES_REF = re.compile(r"従業員の状況(?!等)")
_PAY_WORDS = re.compile(r"給与|報酬|賃金")


def reference_target(section_html):
    """参照の会社の2回目に見せる節。**ほとんどはサステナビリティの節**（1回目の参照110社で
    109社）で、給与に触れる文が「従業員の状況」を指していればそちらを見せる。"""
    for b in B.parse(section_html):
        for sent in b.get("sentences", []):
            if _PAY_WORDS.search(sent) and _EMPLOYEES_REF.search(sent):
                return "employees"
    return "sustainability"


def cmd_plan(args):
    if args.referenced and args.force:
        raise SystemExit("--referenced と --force は一緒に使えない（参照の会社は判定済みの記録から選ぶ）")
    rows = pending(referenced=args.referenced, force=args.force)
    # 判定中のバッチ（work/ にあって、まだ merge していない）の会社は選ばない。
    # 回の途中で取得が進んだとき、残りの会社だけを足すため
    in_flight = set()
    for bpath in WORK.glob("batch_*.json") if WORK.exists() else []:
        for c in json.loads(bpath.read_text(encoding="utf-8"))["companies"]:
            in_flight.add((c["doc_id"], c["source"]))
    rows = [x for x in rows if (x[0]["doc_id"], x[1]) not in in_flight]
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
    if source != "section" and verdict == "referenced":
        return None, "参照先の節でさらに参照と答えた"
    if verdict == "none" or (verdict == "referenced" and not pick.get("start")):
        return {"verdict": verdict, "title": None, "blocks": [], "range": None, "note": pick.get("note", "")}, None
    # own と、節の中に短い要約がある referenced（要約は参照先で見つからなかったときの戻り先）
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
    # 番号も残す。分解の規則を直したときに、答えを取り直さずに切り直せる（`recut`）
    rng = {"title": pick.get("title") or None, "start": pick["start"], "end": pick["end"]}
    return {"verdict": verdict, "title": title, "blocks": body, "range": rng, "note": pick.get("note", "")}, None


def cmd_gate(args):
    ok = ng = 0
    only = {int(x) for x in args.batch.split(",") if x} if args.batch else None
    for bpath in sorted(WORK.glob("batch_*.json")):
        n = int(bpath.stem.split("_")[1])
        # エージェントを並べて回すときは自分のバッチだけを見る（他の書きかけを読まない）
        if only is not None and n not in only:
            continue
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
                            f"{rec['source']}_sha1": rec["source_sha1"], "verdict": rec["verdict"]})
                if rec["verdict"] == "own":
                    row["source"] = rec["source"]
            title, body, rng = rec["title"], rec["blocks"], rec.get("range")
            if rec["source"] == "section" and rec["verdict"] == "referenced":
                # 本文は2回目（参照先）で決める。節の中の要約は戻り先として持っておく
                row["fallback"] = {"title": title, "blocks": body, "range": rng}
                title, body, rng = None, [], None
            if rec["source"] != "section" and rec["verdict"] == "none" and prev.get("fallback", {}).get("blocks"):
                # 参照先に詳しい記載が無かった。節の中の要約を使う
                row.update({"verdict": "own", "source": "section"})
                title, body, rng = prev["fallback"]["title"], prev["fallback"]["blocks"], prev["fallback"].get("range")
            row.update({"title": title, "blocks": body, "range": rng, **stats(body),
                        "note": rec["note"], "picked_at": today})
            out[rec["doc_id"]] = row
            merged += 1
    write_out(out, comp)
    print(f"取り込み {merged}件 → {OUT.name}（{len(out)}社）")


def write_out(out, comp):
    """1社1行で書く（差分が会社ごとに出るように）。並びは `ranking_unified_2026.csv` のまま。"""
    order = {d: i for i, d in enumerate(comp)}
    rows = sorted(out.values(), key=lambda x: order.get(x["doc_id"], len(order)))
    OUT.write_text("[\n" + ",\n".join(json.dumps(x, ensure_ascii=False) for x in rows) + "\n]\n",
                   encoding="utf-8")


def cmd_recut(args):
    """書き出した番号から、いまの分解の規則で本文を切り直す。答えは取り直さない。

    番号は塊の並びで振っているので、塊の中身の作り方（表のセルの改行など）を直しても変わらない。
    **塊の分け方そのものを変えたら番号がずれるので、これでは足りない**（判定から回し直す）。
    """
    comp = companies()
    out = read_out()
    changed = 0
    for d, row in out.items():
        cache = cached(d)
        for part, source in ((row, row.get("source")), (row.get("fallback"), "section")):
            if not part or not part.get("range") or source is None:
                continue
            blocks = B.parse(source_html(cache, source))
            rng = part["range"]
            body = B.cut(blocks, rng["start"], rng["end"])
            title = blocks[B.parse_id(rng["title"])[0] - 1]["text"] if rng["title"] else None
            if body != part["blocks"] or title != part["title"]:
                part.update({"blocks": body, "title": title})
                if part is row:
                    row.update(stats(body))
                changed += 1
    write_out(out, comp)
    print(f"切り直して変わった {changed}件")


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


# ── verify ────────────────────────────────────────────────────────


def body_mismatch(orig, body):
    """本文が原文の塊の連続した一部かを確かめる。**合わなければ理由、合えば None。**

    AC-35 の「空白を除いて1字も違わない」「段落の区切りは原文と一致する」を機械で見る。
    `cut` の作りで保証されているが、書き出したファイルを後から直接直されても気づけるように、
    ファイルと原文だけから確かめる。間の塊は原文の塊と完全に同じ、両端の段落だけは文の単位で
    切れていてよい（先頭は原文の段落の後ろ寄り、末尾は前寄り）。
    """
    if not body:
        return "本文が空"
    n = len(body)

    def same(o, b, edge):
        if o["kind"] != b["kind"]:
            return False
        if b["kind"] != "para":
            return o == b
        if edge == "only":
            return B.squash(b["text"]) in B.squash(o["text"])
        if edge == "first":
            return B.squash(o["text"]).endswith(B.squash(b["text"]))
        if edge == "last":
            return B.squash(o["text"]).startswith(B.squash(b["text"]))
        return o["text"] == b["text"]

    for i in range(len(orig) - n + 1):
        if n == 1:
            ok = same(orig[i], body[0], "only")
        else:
            ok = (same(orig[i], body[0], "first") and same(orig[i + n - 1], body[-1], "last")
                  and all(same(orig[i + k], body[k], "mid") for k in range(1, n - 1)))
        if ok:
            if any(orig[i + k]["kind"] == "title" for k in range(n)):
                return "節の見出しを含む"
            return None
    return "原文の連続した一部になっていない"


# 空になった理由。AC-35 の実行ログに出す
EMPTY_REASONS = {
    "none": "節に給与の決定方針が無く、参照先も示していない",
    "referenced_none": "節は参照だけで、参照先の節にも無い",
    "referenced_no_target": "節は参照だけで、参照先の節が取れない",
    "referenced_pending": "節は参照だけで、参照先をまだ判定していない",
    "pending": "まだ判定していない",
}


def empty_reason(row):
    if row is None:
        return "pending"
    if row["verdict"] == "none":
        return "referenced_none" if row.get("referenced") else "none"
    if row["verdict"] == "referenced":
        return "referenced_pending"
    return None


def cmd_verify(args):
    """AC-35 の実行ログ。節が取れた社数・給与の決定方針が付いた社数と、空の理由を出し、
    付いた会社すべての本文を原文と機械で突き合わせる。**1社でも合わなければ 1 を返す。**"""
    comp = companies()
    out = read_out()
    no_section = {}
    for d in comp:
        cache = cached(d)
        if cache is None:
            no_section[d] = "キャッシュが無い（書類を取れていない）"
        elif not cache.get("section"):
            no_section[d] = "節が見つからない"
        elif len(cache["section"]) > 1:
            no_section[d] = "節が2つ以上ある（どちらを採るか決めていない）"
    print(f"対象 {len(comp)}社（決算期末 {fetch.FIRST_PERIOD_END} 以後）")
    print(f"  節が取れた {len(comp) - len(no_section)}社 / 取れなかった {len(no_section)}社")
    for d, why in no_section.items():
        print(f"    {d} {comp[d]['name']}: {why}")

    filled, empty, bad = {}, {}, []
    for d in comp:
        if d in no_section:
            continue
        row = out.get(d)
        why = empty_reason(row)
        if why == "referenced_pending" and source_html(cached(d), reference_target(source_html(cached(d), "section"))) is None:
            why = "referenced_no_target"
        if why is not None:
            empty.setdefault(why, []).append(d)
            continue
        kind = row["source"] + ("（節の中の要約）" if row.get("referenced") and row["source"] == "section" else "")
        filled[kind] = filled.get(kind, 0) + 1
        cache = cached(d)
        html = source_html(cache, row["source"])
        if html is None or row.get(f"{row['source']}_sha1") != sha1(html):
            bad.append((d, "原文が判定したときと変わった"))
            continue
        why = body_mismatch(B.parse(html), row["blocks"])
        if why:
            bad.append((d, why))
    print(f"  給与の決定方針が付いた {sum(filled.values())}社"
          + "（" + " / ".join(f"{k} {v}" for k, v in filled.items()) + "）")
    print(f"  空 {sum(len(v) for v in empty.values())}社")
    for why, docs in empty.items():
        print(f"    {EMPTY_REASONS[why]}: {len(docs)}社")
    print(f"  原文との突き合わせ: 合わない {len(bad)}社")
    for d, why in bad:
        print(f"    {d} {comp[d]['name']}: {why}")
    return 1 if bad else 0


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
    p.add_argument("--force", action="store_true", help="判定済みの会社も選ぶ（指示を直して回し直すとき）")
    p.set_defaults(fn=cmd_plan)
    g = sub.add_parser("gate")
    g.add_argument("--batch", default="", help="バッチ番号をカンマ区切りで（並べて回すとき）")
    g.set_defaults(fn=cmd_gate)
    sub.add_parser("merge").set_defaults(fn=cmd_merge)
    c = sub.add_parser("compare")
    c.add_argument("-v", "--verbose", action="store_true")
    c.set_defaults(fn=cmd_compare)
    sub.add_parser("verify").set_defaults(fn=cmd_verify)
    sub.add_parser("recut").set_defaults(fn=cmd_recut)
    sub.add_parser("clear").set_defaults(fn=cmd_clear)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    args = ap.parse_args()
    sys.exit(args.fn(args) or 0)


if __name__ == "__main__":
    main()
