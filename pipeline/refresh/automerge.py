"""定期実行の PR を、CI の結果を見て自動でマージする（refresh の D8・#878）。

docs/refresh/routine/design.md「自動マージ」。GitHub Actions の `refresh-automerge.yml` が、
CI（`ci.yml`）の完了を受けて `python3 pipeline/refresh/automerge.py run` を呼ぶ。

- **テストが通ったかどうかは CI の結果で決める。** 定期実行のセッションの報告は見ない（spec 1.12）
- 対象は `refresh` のラベルが付いた PR だけ。定期実行のセッションが PR を立てるときに付ける
- **通る基準のファイル（`criteria.txt`）に触れる PR はマージしない。** `refresh-criteria` を付けて
  止め、知らせる（alerts.py）。判定に使う一覧とこのスクリプトは main のもので、PR の側の変更は
  その PR の判定に効かない
- CI が落ちた PR には `refresh-ci-failed` を付ける（知らせる）

判定は `decide()` の1か所で、テスト（test_automerge.py）が固定する。`gh` を呼ぶのは `run` だけ。
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CRITERIA = ROOT / "criteria.txt"

LABEL = "refresh"
LABEL_CRITERIA = "refresh-criteria"
LABEL_CI_FAILED = "refresh-ci-failed"

# ラベルの色と説明。ワークフローが毎回 `gh label create --force` で揃える
LABELS = {
    LABEL: ("0e8a16", "定期実行が立てた PR（CI が通れば自動でマージする）"),
    LABEL_CRITERIA: ("d93f0b", "通る基準を変えるので自動でマージしない（運営者が見る）"),
    LABEL_CI_FAILED: ("b60205", "定期実行の PR の CI が落ちた"),
}

# CI（ci.yml）のジョブ。**名前を変えたらここも直す**（ci.yml の冒頭の注記）
REQUIRED_JOBS = ("pipeline", "web", "e2e")


def glob_to_regex(pattern: str) -> re.Pattern[str]:
    """`**` は0個以上のディレクトリ、`*` は `/` を含まない任意の文字列、`?` は1文字。"""
    out = ""
    i = 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out += "(?:.*/)?"
            i += 3
        elif pattern.startswith("**", i):
            out += ".*"
            i += 2
        elif pattern[i] == "*":
            out += "[^/]*"
            i += 1
        elif pattern[i] == "?":
            out += "[^/]"
            i += 1
        else:
            out += re.escape(pattern[i])
            i += 1
    return re.compile(out + r"\Z")


def load_patterns(path: Path = CRITERIA) -> list[str]:
    patterns = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            patterns.append(line)
    if not patterns:
        raise SystemExit(f"{path} に基準のファイルが1つもない")
    return patterns


def criteria_hits(files: list[str], patterns: list[str]) -> list[str]:
    """基準のファイルに当たる変更（並びは `files` のまま）。"""
    regexes = [glob_to_regex(p) for p in patterns]
    return [f for f in files if any(r.match(f) for r in regexes)]


@dataclass
class Decision:
    action: str  # merge | hold | failed | skip
    reason: str
    hits: list[str] = field(default_factory=list)


def decide(
    *,
    state: str,
    labels: list[str],
    pr_head: str,
    run_head: str,
    run_conclusion: str,
    jobs: dict[str, str],
    hits: list[str],
) -> Decision:
    """1つの PR をどう扱うか。`jobs` はジョブ名 → conclusion。"""
    if state != "OPEN":
        return Decision("skip", f"PR が開いていない（{state}）")
    if LABEL not in labels:
        return Decision("skip", f"`{LABEL}` のラベルが無い（定期実行の PR ではない）")
    if pr_head != run_head:
        return Decision("skip", "CI の実行が PR の最新のコミットのものではない")
    missing = [j for j in REQUIRED_JOBS if jobs.get(j) != "success"]
    if run_conclusion != "success" or missing:
        detail = "・".join(f"{j}: {jobs.get(j, '無い')}" for j in missing) or run_conclusion
        return Decision("failed", f"CI が通っていない（{detail}）")
    if hits:
        return Decision("hold", "通る基準のファイルに触れている", hits)
    return Decision("merge", "CI が通り、通る基準のファイルに触れていない")


def hold_comment(hits: list[str]) -> str:
    listed = "\n".join(f"- `{h}`" for h in hits)
    return (
        "この PR は通る基準のファイルに触れているので、自動ではマージしません"
        "（`pipeline/refresh/criteria.txt`・docs/refresh/spec.md 1.12）。運営者が見てマージしてください。\n\n"
        f"{listed}\n"
    )


# --- ここから下は GitHub Actions の中でだけ動く ---


def gh(*args: str) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def ensure_labels(repo: str) -> None:
    for name, (color, description) in LABELS.items():
        gh("label", "create", name, "--repo", repo, "--color", color, "--description", description, "--force")


def ci_run_for(repo: str, head_sha: str) -> dict | None:
    """そのコミットの CI（ci.yml）の最新の実行。PR から起きたものだけを見る。"""
    runs = json.loads(
        gh("api", f"repos/{repo}/actions/workflows/ci.yml/runs?head_sha={head_sha}&event=pull_request&per_page=5")
    )["workflow_runs"]
    return runs[0] if runs else None


def targets(repo: str, event: dict) -> list[tuple[str, dict]]:
    """判定する (PR 番号, CI の実行) の組。

    - CI の完了（`workflow_run`）: その実行が結びついた PR
    - PR にラベルが付いた（`pull_request_target`）: その PR の最新のコミットの CI。**ラベルが CI の
      完了より後に付いても取りこぼさない**ため。CI がまだ終わっていなければ、終わったときに判定する
    """
    if "workflow_run" in event:
        wr = event["workflow_run"]
        return [(str(pr["number"]), wr) for pr in wr.get("pull_requests") or []]
    pr = event["pull_request"]
    wr = ci_run_for(repo, pr["head"]["sha"])
    if wr is None or wr["status"] != "completed":
        print(f"#{pr['number']}: CI がまだ終わっていない。終わったときに判定する")
        return []
    return [(str(pr["number"]), wr)]


def run() -> None:
    repo = os.environ["GITHUB_REPOSITORY"]
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    ensure_labels(repo)
    patterns = load_patterns()
    for number, wr in targets(repo, event):
        jobs_json = json.loads(gh("api", f"repos/{repo}/actions/runs/{wr['id']}/jobs?per_page=100"))
        jobs = {j["name"]: j["conclusion"] or j["status"] for j in jobs_json["jobs"]}
        view = json.loads(gh("pr", "view", number, "--repo", repo, "--json", "state,labels,headRefOid"))
        labels = [label["name"] for label in view["labels"]]
        files = gh("api", f"repos/{repo}/pulls/{number}/files?per_page=100", "--paginate", "--jq", ".[].filename").split()
        d = decide(
            state=view["state"],
            labels=labels,
            pr_head=view["headRefOid"],
            run_head=wr["head_sha"],
            run_conclusion=wr["conclusion"] or "",
            jobs=jobs,
            hits=criteria_hits(files, patterns),
        )
        print(f"#{number}: {d.action} — {d.reason}")
        if d.action == "skip":
            continue
        if d.action == "failed":
            gh("pr", "edit", number, "--repo", repo, "--add-label", LABEL_CI_FAILED)
            continue
        if LABEL_CI_FAILED in labels:
            gh("pr", "edit", number, "--repo", repo, "--remove-label", LABEL_CI_FAILED)
        if d.action == "hold":
            if LABEL_CRITERIA not in labels:
                gh("pr", "edit", number, "--repo", repo, "--add-label", LABEL_CRITERIA)
                gh("pr", "comment", number, "--repo", repo, "--body", hold_comment(d.hits))
            continue
        gh("pr", "merge", number, "--repo", repo, "--squash", "--match-head-commit", wr["head_sha"])


def main(argv: list[str]) -> None:
    if argv[1:] == ["run"]:
        run()
    elif argv[1:2] == ["check"]:
        # 手元で確かめる: git diff --name-only origin/main | python3 automerge.py check
        hits = criteria_hits(sys.stdin.read().split(), load_patterns())
        print("\n".join(hits) if hits else "基準のファイルに触れていない")
    else:
        raise SystemExit("usage: automerge.py run | check < files")


if __name__ == "__main__":
    main(sys.argv)
