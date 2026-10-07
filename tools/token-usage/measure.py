#!/usr/bin/env python3
"""Claude Code のセッション記録（jsonl）から、期間内のトークン消費を役割別に集計する。

使い方:
  python3 tools/token-usage/measure.py <開始 UTC> <終了 UTC> [記録のディレクトリ]
  例: python3 tools/token-usage/measure.py 2026-10-06T21:46 2026-10-07T01:10

記録のディレクトリの既定は ~/.claude/projects/-home-user-nenshu/<セッション ID>（唯一のものを探す）。
メインの会話は <ディレクトリ>.jsonl、サブエージェントは <ディレクトリ>/subagents/agent-*.jsonl。

見るもの（docs/refresh/token-cost.md）:
  calls   API の呼び出し回数
  ctx     1回の呼び出しが読む文脈の平均（input + cache_creation + cache_read）
  first   サブエージェントの最初の呼び出しの文脈（＝CLAUDE.md・ツール定義などの固定費）
  cc / cr キャッシュへの書き込み / 読み出し（100万トークン単位）
  重み付き input×1 + cache_creation×1.25 + cache_read×0.1。料金の目安で、制限への効き方とは限らない
"""
import collections
import glob
import json
import os
import sys


def scan(path, start, end):
    seen, tot, calls, first, first_user = set(), collections.Counter(), 0, None, ""
    for line in open(path, errors="replace"):
        try:
            o = json.loads(line)
        except ValueError:
            continue
        if o.get("type") == "user" and not first_user:
            c = (o.get("message") or {}).get("content")
            first_user = c if isinstance(c, str) else json.dumps(c, ensure_ascii=False)
        m = o.get("message") or {}
        u = m.get("usage")
        if not u or o.get("type") != "assistant":
            continue
        ts = o.get("timestamp", "")[:16]
        if not (start <= ts <= end):
            continue
        key = m.get("id") or o.get("uuid")
        if key in seen:
            continue
        seen.add(key)
        calls += 1
        for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"):
            tot[k] += u.get(k, 0) or 0
        if first is None:
            first = sum(u.get(k, 0) or 0 for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
    return calls, tot, first or 0, first_user


def weighted(t):
    return t["input_tokens"] + 1.25 * t["cache_creation_input_tokens"] + 0.1 * t["cache_read_input_tokens"]


def role(first_user):
    for needle, name in (
        ("pick.md", "pick（給与の範囲）"),
        ("gen_task.md", "gen（分析・要約）"),
        ("verify_task.md", "verify（分析・要約）"),
        ("summary/prompts/verify.md", "verify（説明文）"),
        ("summary/prompts/generate.md", "gen（説明文）"),
    ):
        if needle in first_user:
            return name
    return "その他"


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    start, end = sys.argv[1][:16], sys.argv[2][:16]
    if len(sys.argv) > 3:
        d = sys.argv[3]
    else:
        cands = [p for p in glob.glob(os.path.expanduser("~/.claude/projects/*/*")) if os.path.isdir(p) and os.path.isdir(p + "/subagents")]
        if len(cands) != 1:
            sys.exit("記録のディレクトリが1つに決まらない。第3引数で渡す: %s" % cands)
        d = cands[0]
    calls, tot, _, _ = scan(d + ".jsonl", start, end)
    rows = [("メイン", 1, calls, tot, 0)]
    roles = collections.defaultdict(lambda: [0, 0, collections.Counter(), []])
    for f in glob.glob(d + "/subagents/agent-*.jsonl"):
        c, t, first, fu = scan(f, start, end)
        if not c:
            continue
        r = roles[role(fu)]
        r[0] += 1
        r[1] += c
        r[2].update(t)
        r[3].append(first)
    for name, (n, c, t, firsts) in sorted(roles.items()):
        rows.append((name, n, c, t, sum(firsts) // max(len(firsts), 1)))
    print("%-22s %6s %6s %9s %9s %8s %8s %8s" % ("", "agents", "calls", "ctx平均", "first", "cc(M)", "cr(M)", "重み付き(M)"))
    total = 0.0
    for name, n, c, t, first in rows:
        ctx = (t["input_tokens"] + t["cache_creation_input_tokens"] + t["cache_read_input_tokens"]) // max(c, 1)
        w = weighted(t) / 1e6
        total += w
        print("%-22s %6d %6d %9d %9d %8.2f %8.1f %8.2f" % (name, n, c, ctx, first, t["cache_creation_input_tokens"] / 1e6, t["cache_read_input_tokens"] / 1e6, w))
    print("%-22s %6s %6s %9s %9s %8s %8s %8.2f" % ("合計", "", "", "", "", "", "", total))


if __name__ == "__main__":
    main()
