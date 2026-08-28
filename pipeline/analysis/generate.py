"""要約と分析の生成を回す。**LLM は呼ばない。** 呼ぶのはセッションのエージェント。

C9（[#241](https://github.com/varmil/nenshu/issues/241)・親 #214・ADR-0015）。
ADR-0010 の追記（2026-08-26）のとおり **Anthropic API は使わず、生成と検証は
Claude Code のセッションで回す**。このスクリプトが持つのは、その前後にある
**機械の仕事だけ**——材料をバッチに切り、機械ゲート（`gate.py`）を当て、CSV に
取り込み、進み具合を数える。C6 の `summary/generate.py` と同じ形にしてある。

    python3 generate.py plan --pilot --size 6 --batches 2
    （エージェントが prompts/generate.md に従って work/gen_0001.jsonl を書く）
    python3 generate.py gate
    （エージェントが prompts/verify.md に従って work/verify_0001.jsonl を書く）
    python3 generate.py merge
    python3 generate.py clear
    python3 generate.py status

**1回では全社ぶんが回らない。** 有報の原文だけで1社あたり平均21,005字・全社6,220万字ある
（C8 の実測）。`plan` は CSV に載っていない会社と、**原文の SHA-1 が変わった会社**だけを
選ぶので、回すたびに進む。

**原文（`analysis_text_2026.csv`）は git に無い**（175MB。`pipeline/.gitignore`）。
`analysis/extract_analysis.py` をキャッシュに対して回せば27秒で作り直せる。

**分析の材料は有報の外にもある**（ADR-0015 決定2）。**このスクリプトは外部の文書を
取りに行かない**——何を探すべきかは会社によって違うので、**生成エージェントが検索して
取りに行き、使った URL を出力に残す**（決定6）。ここが用意するのは有報の4節と、
**同じページが表示している数値**までである。
"""

import argparse
import csv
import gzip
import hashlib
import json
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gate  # noqa: E402
import extract_analysis  # noqa: E402

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "../data"

# **原文は2つある。切らない版が git に無いので、切った版が既定の入り口になる。**
#
#   analysis_text_2026.csv                       切らない・167MB・gitignore
#   analysis_text_cut2200-1500-3000-1500_….gz    節ごとに切った版・**コミットする**
#
# **切らない版があればそちらを使う**——`--max-chars 0` で切らずに読ませる余地を残すため。
# 無ければ切った版に落ちる。**ZIP キャッシュはコンテナが変わると消える**ので、
# 切った版があることで C9 のセッションはキャッシュも EDINET キーも要らなくなる
# （`extract_analysis.py` の表）。
SOURCE = DATA / "analysis_text_2026.csv"
# **名前は `extract_analysis` が持つ。** 切り方を変えるとファイル名も変わるので、
# こちらで組み立てると片方だけ古くなる。
CUT_SOURCE = DATA / extract_analysis.CUT_OUT.name
MANIFEST = DATA / "analysis_text_manifest_2026.csv"
UNIVERSE = DATA / "ranking_unified_2026.csv"
SALARY_HISTORY = DATA / "salary_history.csv"
# **稼ぐ力は `web/public/data/` の生成物から読む。** `pipeline/data/` にあるのは
# 年ごとの生の CSV（`performance_history.csv`）で、「直近5期の中央値 ÷ 従業員数」に
# するのは `build-data.ts` の仕事——**規則を Python 側に書き写さない。**
PERFORMANCE = ROOT / "../../web/public/data/performance.json"
WORKLIFE = DATA / "worklife_2026.csv"
OUT = DATA / "company_analysis_2026.csv"
WORK = ROOT / "work"

KEYS = ["mdna", "risks", "issues", "sustainability"]

HEADERS = [
    "edinet_code",
    "sec_code",
    "summary",
    "headline",
    "analysis",
    "sources",
    "source_doc_id",
    "source_period_end",
    "source_sha1",
    "model",
    "generated_at",
    "summary_verdict",
    "summary_reason",
    "analysis_verdict",
    "analysis_reason",
]

# 目視の回帰ケース。**パイロットには必ず入れる。**
# #214 が**この5社について「好調かどうかの一言」を人手で書いている**ので、
# 生成した一言と突き合わせられる——規格が効いているかを実物で見られる唯一の組。
PILOT_ANCHORS = ("6740", "8011", "6954", "6146", "2484")

csv.field_size_limit(200 * 1024 * 1024)


def read_csv(path):
    """CSV を読む。**`.gz` なら展開しながら読む**（切った版はそれで置いてある）。"""
    path = Path(path)
    if not path.exists():
        return []
    opener = (lambda: gzip.open(path, "rt", encoding="utf-8-sig")) if path.suffix == ".gz" \
        else (lambda: open(path, encoding="utf-8-sig"))
    with opener() as f:
        return list(csv.DictReader(f))


def source_path():
    """使う原文と、それが切った版かどうか。**切らない版を優先する。**"""
    if SOURCE.exists():
        return SOURCE, False
    return CUT_SOURCE, True


def _num(v):
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def salary_history():
    """`edinet_code → {年: 平均年収}`。**欠測の年は入れない**（`check_trend_claims` の約束）。"""
    out = {}
    for r in read_csv(SALARY_HISTORY):
        v = _num(r.get("avg_salary"))
        if v:
            out.setdefault(r["edinet_code"], {})[int(r["year"])] = int(v)
    return out


def profit_per_employee():
    """`(sec/edinet の並び順の添字 → 稼ぐ力, 業種 → 業種中央値)`。

    `performance.json` の `perEmployee` は **`companies.rows` と同じ並びの配列**
    （`build-data.ts`）で、その並びは `ranking_unified_2026.csv` の行順に等しい。
    **行がずれると別の会社の数字を出す**ので、ここでも同じループで組む。
    """
    if not PERFORMANCE.exists():
        return [], {}
    d = json.loads(PERFORMANCE.read_text(encoding="utf-8"))
    return d.get("perEmployee") or [], d.get("industryMedian") or []


def worklife():
    """`sec/edinet の id → {残業, 有給}`。**全体値だけを渡す**——区分別まで載せると
    材料が膨らむわりに、分析が使うのは水準の当たりだけである。"""
    out = {}
    for r in read_csv(WORKLIFE):
        out[r["id"]] = {
            "overtime_hours_per_month": _num(r.get("overtime_all")),
            "paid_leave_rate": _num(r.get("paid_leave_all")),
            "as_of": r.get("as_of") or "",
        }
    return out


def universe():
    """母集団の行。**CSV に載っている順のまま**返す（`performance.json` の並びと揃う）。"""
    return [r for r in read_csv(UNIVERSE) if r.get("edinet_code")]


def sources_by_code():
    return {r["edinet_code"]: r for r in read_csv(source_path()[0])}


def combined_sha1(manifest_row):
    """4節の SHA-1 をまとめた鍵。**節ごとの SHA-1 は残したまま**、再開の判定にはこれを使う。"""
    joined = "|".join(manifest_row.get(f"{k}_sha1", "") for k in KEYS)
    return hashlib.sha1(joined.encode("utf-8")).hexdigest()


def manifest():
    return {r["edinet_code"]: r for r in read_csv(MANIFEST)}


def done():
    return {r["edinet_code"]: r for r in read_csv(OUT)}


def pending(force=False):
    """未生成の会社。**4節の SHA-1 が変わった会社も入れる。**"""
    have = {} if force else done()
    man = manifest()
    out = []
    for code, row in sources_by_code().items():
        m = man.get(code)
        if m is None:
            continue
        old = have.get(code)
        if old is not None and old.get("source_sha1") == combined_sha1(m):
            continue
        out.append(row)
    return out


def _batch_path(kind, n):
    return WORK / f"{kind}_{n:04d}.json"


def _jsonl(path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip()]


def build_figures(row, uni_index, history, per_emp, ind_by_name, wl):
    """**同じページが既に表示している数値だけ**を渡す（ADR-0015 決定2）。

    外部から新しく数値を引いてこない——読者が根拠を同じページの中で突き合わせられる
    ことが、評価を書いてよい前提になる。
    """
    u = uni_index.get(row["edinet_code"])
    if u is None:
        return {}
    idx = u["_index"]
    industry = u.get("tse33") or ""
    figures = {
        "avg_salary_yen": _num(u.get("avg_salary")),
        "avg_age": _num(u.get("avg_age")),
        "avg_tenure_years": _num(u.get("avg_tenure")),
        "employees": _num(u.get("employees_nonconsolidated")),
        "industry": industry,
        "period_end": u.get("period_end") or "",
        "salary_history_yen": {str(y): v for y, v in
                               sorted(history.get(row["edinet_code"], {}).items())},
    }
    if idx < len(per_emp) and per_emp[idx]:
        figures["profit_per_employee_yen"] = per_emp[idx]
    if industry in ind_by_name:
        figures["industry_median_profit_per_employee_yen"] = ind_by_name[industry]
    key = u.get("sec_code") or row["edinet_code"]
    if key in wl:
        got = {k: v for k, v in wl[key].items() if v not in (None, "")}
        if got:
            figures["worklife"] = got
    return figures


def cut_sections(row, max_chars=None):
    """節ごとに切った版。**`plan` と `gate` の両方がこれを使う。**

    **`gate` が検証パスに渡す `sections` が全文だった**（32回目に検証パス自身が
    見つけた）。検証パスには「これが生成の見た材料だ」と伝えているので、**全文を渡すと
    切った先を根拠にした指摘が出るし、こちらもそれを「切った版にある」と誤って
    確かめてしまう**（実際、25回目以降は `gated_*.json` を grep して確かめていた）。
    **切り方を2か所に書き写さない**ためにここへ寄せてある。
    """
    out = {}
    for k in KEYS:
        text = row.get(k) or ""
        limit = extract_analysis.CUT_CHARS[k] if max_chars is None else max_chars
        if limit and len(text) > limit:
            text = text[:limit]
        out[k] = text
    return out


def figures_context():
    """`build_figures` に渡す表をまとめて読む。

    **`plan` と `gate` の両方が同じ数値を必要とする。** 生成に渡した `figures` を検証にも
    渡さないと、**検証パスが数値の根拠を見ないまま通す**（C9 の16回目に検証側から指摘が
    来た。`verify.md` は `figures` があると書いていたのに、`gated_NNNN.json` は持って
    いなかった）。**読み方を2か所に書き写さない**ためにここへ寄せてある。
    """
    uni = universe()
    uni_index = {}
    industries = sorted({u.get("tse33") or "" for u in uni})
    for i, u in enumerate(uni):
        u["_index"] = i
        uni_index[u["edinet_code"]] = u
    per_emp, ind_median = profit_per_employee()
    ind_by_name = {}
    if isinstance(ind_median, list) and len(ind_median) == len(industries) - (1 if "" in industries else 0):
        names = [n for n in industries if n]
        ind_by_name = dict(zip(names, ind_median))
    return uni_index, salary_history(), per_emp, ind_by_name, worklife()


def cmd_plan(args):
    src_path, is_cut = source_path()
    if not src_path.exists():
        raise SystemExit(
            f"{CUT_SOURCE.name} も {SOURCE.name} も無い。"
            "切った版は git にあるはずなので、まず `git status` を見ること。"
            "作り直すなら `python3 extract_analysis.py`（キャッシュがあれば51秒）。"
        )
    if is_cut:
        cut = extract_analysis.CUT_CHARS
        if args.max_chars == 0:
            raise SystemExit(
                "読めるのは切った版だけなので、--max-chars 0（切らない）は出せない。"
                "`python3 extract_analysis.py` で切らない版を作ること。"
            )
        over = [f"{k}は{cut[k]}字" for k in KEYS if args.max_chars and args.max_chars > cut[k]]
        if over:
            raise SystemExit(
                f"--max-chars {args.max_chars} は切った版から出せない（{' / '.join(over)}まで）。"
                "`python3 extract_analysis.py` で切らない版を作ること。"
            )
        # **行数をマニフェストと突き合わせる。** 切った版は git 経由で運ばれてくるので、
        # 古い版が混ざっても字面では気づけない（C6・C8 の「ファイルを数える」と同じ線）。
        want, got = len(manifest()), len(sources_by_code())
        if want != got:
            raise SystemExit(
                f"{src_path.name} は {got}社だが、マニフェストは {want}社。"
                "版がずれているので `python3 extract_analysis.py` で作り直すこと。"
            )
    rows = pending(force=args.force)
    if args.pilot:
        by_sec = {}
        for r in rows:
            if r.get("sec_code"):
                by_sec[r["sec_code"]] = r
        anchors = [by_sec[s] for s in PILOT_ANCHORS if s in by_sec]
        codes = {r["edinet_code"] for r in anchors}
        rest = [r for r in rows if r["edinet_code"] not in codes]
        random.Random(args.seed).shuffle(rest)
        rows = anchors + rest[: max(0, args.size * args.batches - len(anchors))]

    uni_index, history, per_emp, ind_by_name, wl = figures_context()

    WORK.mkdir(exist_ok=True)
    made = used = 0
    for i in range(args.batches):
        chunk = rows[i * args.size : (i + 1) * args.size]
        if not chunk:
            break
        payload = []
        for r in chunk:
            # **既定は節ごとの表**（`extract_analysis.CUT_CHARS`）。`--max-chars` を
            # 渡したときだけ全節をその長さで切る。**0 は「切らない」。**
            sections = cut_sections(r, args.max_chars)
            used += sum(len(v) for v in sections.values())
            figures = build_figures(r, uni_index, history, per_emp, ind_by_name, wl)
            payload.append({
                "edinet_code": r["edinet_code"],
                "sec_code": r.get("sec_code") or "",
                "name": r.get("name") or "",
                "sections": sections,
                "figures": figures,
            })
        path = _batch_path("batch", made + 1)
        path.write_text(json.dumps({"batch": made + 1, "companies": payload},
                                   ensure_ascii=False, indent=1), encoding="utf-8")
        made += 1

    print(f"未生成 {len(pending(force=args.force))}社 → バッチ {made}本"
          f"（1本 {args.size}社）", flush=True)
    print(f"原文: {src_path.name}{'（節ごと' + str(extract_analysis.CUT_CHARS) + '字に切った版）' if is_cut else ''}",
          flush=True)
    how = ("節ごと（" + " / ".join(f"{k}{extract_analysis.CUT_CHARS[k]}" for k in KEYS) + "字）"
           if args.max_chars is None else
           ("切らない" if args.max_chars == 0 else f"全節{args.max_chars}字"))
    print(f"エージェントに読ませる有報の原文: {used:,}字（{how}）", flush=True)
    print(f"→ {WORK}/batch_0001.json …", flush=True)


def _load_generated():
    """`work/gen_*.jsonl` を読み、バッチと突き合わせて返す。

    **エージェントの報告を数えない。ファイルを数える**（C6 の教訓）。「作成した」と
    報告しながらファイルを書いていなかった事故が実際にあり、一部だけ欠けた場合は
    そのまま取り込まれて静かに消える。
    """
    planned = sorted(WORK.glob("batch_*.json"))
    produced = sorted(WORK.glob("gen_*.json*"))
    if len(planned) != len(produced):
        missing = {p.stem.split("_")[1] for p in planned} - {
            p.stem.split("_")[1] for p in produced}
        raise SystemExit(
            f"バッチ {len(planned)}本に対して生成物が {len(produced)}本しかない"
            f"（欠けているのは {', '.join(sorted(missing)) or '不明'}）。"
            "そのバッチを回し直してから実行すること。")
    out = []
    for path in produced:
        n = int(path.stem.split("_")[1])
        want = len(json.loads(_batch_path("batch", n).read_text(encoding="utf-8"))["companies"])
        recs = _jsonl(path)
        if want != len(recs):
            raise SystemExit(
                f"{path.name}: {want}社のバッチに {len(recs)}行しかない。回し直すこと。")
        out += recs
    return out


def _apply_gates(rec, row, history, max_digits):
    """1社ぶんに両方のゲートを当てる。`(要約, 見出し, 本文, 要約の理由, 分析の理由)`。"""
    joined = "\n".join(row.get(k) or "" for k in KEYS)
    summary, s_reasons = gate.apply_summary_gate(rec.get("summary", ""), row.get("name") or "",
                                                 joined)
    headline, analysis, a_reasons = gate.apply_analysis_gate(
        rec.get("headline", ""), rec.get("analysis", ""), rec.get("sources") or [],
        max_digits=max_digits)
    if analysis:
        # **数値の裏付けの照合はここだけ**（AC-26）。見ているのは「N年で M% 上下した」の
        # 型ひとつで、主張一般は突き合わせられない（`gate.check_trend_claims` の注記）。
        series = history.get(row["edinet_code"], {})
        bad = gate.check_trend_claims(headline + analysis, series)
        if bad:
            a_reasons = a_reasons + ["数値の裏付け: " + " / ".join(bad)]
            headline = analysis = ""
    return summary, headline, analysis, s_reasons, a_reasons


def cmd_gate(args):
    """機械ゲートを当て、**通ったものだけ**を検証に回す。

    **検証に渡すファイルは `--chunk` 社ずつに割る。** `Read` は256KBまでしか読めず、
    超えるとエージェントが分割して読むために手数が増える（C6 の実測）。

    **渡す原文は打ち切らない。** 生成には切って見せていても、検証は配っている材料
    そのものに対して行う。
    """
    src = sources_by_code()
    uni_index, history, per_emp, ind_by_name, wl = figures_context()
    total = s_pass = a_pass = 0
    items = []
    for rec in _load_generated():
        row = src.get(rec.get("edinet_code"))
        if row is None:
            continue
        total += 1
        summary, headline, analysis, s_reasons, a_reasons = _apply_gates(
            rec, row, history, args.max_digits)
        if summary:
            s_pass += 1
        if analysis:
            a_pass += 1
        (WORK / "gate_reasons.jsonl").open("a", encoding="utf-8").write(json.dumps(
            {"edinet_code": row["edinet_code"], "summary_passed": bool(summary),
             "analysis_passed": bool(analysis),
             "summary_reasons": s_reasons, "analysis_reasons": a_reasons},
            ensure_ascii=False) + "\n")
        if not (summary or analysis):
            continue
        items.append({
            "edinet_code": row["edinet_code"],
            "name": row.get("name") or "",
            "summary": summary,
            "headline": headline,
            "analysis": analysis,
            "sources": rec.get("sources") or [],
            # **生成に渡したのと同じ数値を検証にも渡す**（`verify.md` の「材料」の表）。
            "figures": build_figures(row, uni_index, history, per_emp, ind_by_name, wl),
            # **生成に渡したのと同じ切った版を渡す。全文を渡さない**（上の
            # `cut_sections` 参照）。
            "sections": cut_sections(row, getattr(args, "max_chars", None)),
        })

    for i in range(0, len(items), args.chunk):
        n = i // args.chunk + 1
        _batch_path("gated", n).write_text(json.dumps(
            {"batch": n, "companies": items[i : i + args.chunk]},
            ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"機械ゲート: 要約 {s_pass}/{total}社・分析 {a_pass}/{total}社 通過"
          f" → 検証は {(len(items) + args.chunk - 1) // args.chunk}本"
          f"（1本 {args.chunk}社まで）", flush=True)


def pair_or_drop(summary, headline, analysis, s_reason, a_reason):
    """**要約と分析は対で出す。片方だけのページを作らない**（2026-08-28・運営者の判断。
    `docs/company/spec.md` 1.19・AC-28）。

    満たし方は2つあり、**書き直して両方通す**のが本筋である——パイロットで落ちた2社は
    どちらも**1文を直せば通った**（材料は足りていて、言い過ぎていただけだった）。
    ここが受け持つのはもう一方、**それでも通らなかったときに残ったほうも落とす**ほうになる。

    **この逃げ道が要る。** 「必ず対にする」を絶対条件にすると、**通らない分析を通す圧力が
    そのまま検証パスに掛かる。** 落とせるようにしておくことで、書き直しの回数に上限を
    置ける（`prompts/verify.md` の「2回まで」）。
    """
    if summary and not analysis:
        return "", "", "", f"分析が付かないため対で落とした（{a_reason}）", a_reason
    if analysis and not summary:
        return "", "", "", s_reason, f"要約が付かないため対で落とした（{s_reason}）"
    return summary, headline, analysis, s_reason, a_reason


def cmd_merge(args):
    """ゲートと検証の結果を CSV に取り込む。**verdict が ok 以外は本文を空にする。**"""
    src = sources_by_code()
    man = manifest()
    history = salary_history()
    verdicts = {}
    for path in sorted(WORK.glob("verify_*.json*")):
        for rec in _jsonl(path):
            verdicts[rec["edinet_code"]] = rec

    rows = done()
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    counts = {"summary_ok": 0, "analysis_ok": 0, "n": 0}
    reasons = {}

    def note(reason):
        head = reason.split("（")[0].split(":")[0].strip()
        reasons[head] = reasons.get(head, 0) + 1

    for rec in _load_generated():
        code = rec.get("edinet_code")
        row = src.get(code)
        m = man.get(code)
        if row is None or m is None:
            continue
        summary, headline, analysis, s_reasons, a_reasons = _apply_gates(
            rec, row, history, args.max_digits)
        s_reason = "" if summary else " / ".join(s_reasons) or "要約が空"
        a_reason = "" if analysis else " / ".join(a_reasons) or "分析が空"

        v = verdicts.get(code)
        if summary:
            if v is None:
                summary, s_reason = "", "検証パス未実施"
            elif not v.get("summary_supported"):
                summary = ""
                s_reason = "検証パス: " + (v.get("summary_reason") or "原文から支持されない")
        if analysis:
            if v is None:
                headline = analysis = ""
                a_reason = "検証パス未実施"
            elif not v.get("analysis_supported"):
                headline = analysis = ""
                a_reason = "検証パス: " + (v.get("analysis_reason") or "材料から導けない")

        summary, headline, analysis, s_reason, a_reason = pair_or_drop(
            summary, headline, analysis, s_reason, a_reason)

        counts["n"] += 1
        counts["summary_ok"] += bool(summary)
        counts["analysis_ok"] += bool(analysis)
        if s_reason:
            note("要約 " + s_reason)
        if a_reason:
            note("分析 " + a_reason)

        rows[code] = {
            "edinet_code": code,
            "sec_code": row.get("sec_code") or "",
            "summary": summary,
            "headline": headline,
            "analysis": analysis,
            "sources": json.dumps(rec.get("sources") or [], ensure_ascii=False)
                       if analysis else "[]",
            "source_doc_id": row.get("doc_id") or "",
            "source_period_end": row.get("period_end") or "",
            "source_sha1": combined_sha1(m),
            "model": args.model,
            "generated_at": stamp,
            "summary_verdict": "ok" if summary else "rejected",
            "summary_reason": s_reason,
            "analysis_verdict": "ok" if analysis else "rejected",
            "analysis_reason": a_reason,
        }

    order = list(src)
    ordered = [rows[c] for c in order if c in rows]
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADERS)
        w.writeheader()
        for r in ordered:
            w.writerow(r)

    n = counts["n"]
    # **対で出すので、通った社数は要約と分析で必ず一致する。** ずれたら対にする処理が
    # 効いていないということなので、数を並べて出しておく。
    print(f"この回: {n}社 → 要約 ok {counts['summary_ok']}社 / "
          f"分析 ok {counts['analysis_ok']}社"
          f"{'' if counts['summary_ok'] == counts['analysis_ok'] else '  ← 対になっていない'}",
          flush=True)
    for k, v in sorted(reasons.items(), key=lambda kv: -kv[1]):
        print(f"  {k}: {v}社", flush=True)
    print(f"→ {OUT}（{len(ordered)}行）", flush=True)


def cmd_clear(args):
    """作業ディレクトリを空にする。**`merge` が済んだ回の後に必ず呼ぶ。**

    `plan` は `batch_0001.json` から振り直すので、前の回の `gen_*.jsonl` が残っていると
    **別の会社の生成物が次の回の取り込みに混ざる。** 成果物には触らない。
    """
    n = 0
    for path in WORK.glob("*"):
        if path.is_file():
            path.unlink()
            n += 1
    print(f"work/ を空にした（{n}ファイル）", flush=True)


def cmd_status(args):
    src = sources_by_code()
    man = manifest()
    have = done()
    s_ok = sum(1 for r in have.values() if r.get("summary_verdict") == "ok")
    a_ok = sum(1 for r in have.values() if r.get("analysis_verdict") == "ok")
    stale = sum(1 for c, r in have.items()
                if c in man and r.get("source_sha1") != combined_sha1(man[c]))
    print(f"原文 {len(src)}社 / 生成済み {len(have)}社"
          f"（要約 ok {s_ok}社・分析 ok {a_ok}社）", flush=True)
    print(f"未生成 {len(src) - len(have)}社 / 原文が変わって作り直しが要る {stale}社",
          flush=True)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("plan")
    a.add_argument("--size", type=int, default=6)
    a.add_argument("--batches", type=int, default=1)
    # **既定は節ごとの表**（`extract_analysis.CUT_CHARS`）。全節を同じ長さにしたいときだけ
    # 渡す。`0` で切らない（切らない版が要る）。
    a.add_argument("--max-chars", type=int, default=None,
                   help="全節をこの長さで切る（既定は節ごとの表。0で切らない）")
    a.add_argument("--pilot", action="store_true", help="回帰ケース＋無作為で選ぶ")
    a.add_argument("--seed", type=int, default=20260828)
    a.add_argument("--force", action="store_true")
    a.set_defaults(func=cmd_plan)

    b = sub.add_parser("gate")
    b.add_argument("--chunk", type=int, default=6)
    b.add_argument("--max-digits", type=int, default=gate.MAX_ANALYSIS_DIGITS)
    b.set_defaults(func=cmd_gate)

    c = sub.add_parser("merge")
    c.add_argument("--model", default="claude-opus-5")
    c.add_argument("--max-digits", type=int, default=gate.MAX_ANALYSIS_DIGITS)
    c.set_defaults(func=cmd_merge)

    d = sub.add_parser("clear")
    d.set_defaults(func=cmd_clear)

    e = sub.add_parser("status")
    e.set_defaults(func=cmd_status)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
