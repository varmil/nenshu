"""更新できなかったものを数え上げ、GitHub の Issue と突き合わせる（refresh の D8・#878・AC-14）。

docs/refresh/routine/design.md「知らせ」。

    python3 pipeline/refresh/alerts.py list    いまの件を出す（手元で）
    python3 pipeline/refresh/alerts.py sync    Issue を立て、解消したものを閉じる（GitHub Actions の中で）

- **件はリポジトリのファイルから数える。** 定期実行のセッションの報告は見ない（spec 1.12 と同じ理由）
- **1件につき Issue 1つ。** 同じ件で重ねないための鍵は、Issue の本文の1行目（`鍵: numbers:E02485`）
- 件が無くなったら Issue を閉じる。定期実行は Issue を読まない（次の回が読むのは台帳と待ち行列）

件の出どころ:

| 鍵 | 出どころ |
| --- | --- |
| `numbers:<EDINETコード>` | `pipeline/data/numbers_pending.csv`（D4 の待ち行列） |
| `worklife:rejected` | `pipeline/worklife/manifest.json` の `rejected`（D7） |
| `routine:stalled` | `pipeline/data/universe.json` の書類一覧を読んだ日が古い |
| `pr-criteria:<番号>`・`pr-failed:<番号>` | 開いている PR のラベル（automerge.py が付ける） |
"""
from __future__ import annotations

import csv
import json
import subprocess
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PIPELINE = HERE.parent
DATA = PIPELINE / "data"

LABEL = "refresh-alert"
LABEL_COLOR = "fbca04"
LABEL_DESCRIPTION = "定期実行で更新できなかったもの（解消すると自動で閉じる）"

JST = timezone(timedelta(hours=9))

# 待ち行列の理由。**次の回で取り直すもの**は、2回続けて残ったときだけ知らせる
# （1回の取得の失敗は次の日に直ることが多い。spec 1.13「取得の失敗が続いている」）
PENDING_REASONS = {
    "fetch_failed": "有報の書類を取れない",
    "reread": "読み直しの判定が無い",
    "unresolved": "読み直しても数字が決まらない",
    "not_eligible": "掲載の条件を満たさない",
}
RETRY = {"fetch_failed", "reread"}
RETRY_GRACE_DAYS = 2

# 書類一覧は毎回「日本時間の昨日」まで読む。これより古ければ定期実行が止まっている
STALL_DAYS = 3

FOOTER = "\n\n---\n定期実行の知らせ（`docs/refresh/routine/design.md`）。解消すると自動で閉じる。"


@dataclass(frozen=True)
class Case:
    key: str
    title: str
    body: str

    def issue_body(self) -> str:
        return f"鍵: {self.key}\n\n{self.body}{FOOTER}"


def key_of(issue_body: str) -> str | None:
    first = (issue_body or "").splitlines()[0:1]
    if first and first[0].startswith("鍵: "):
        return first[0][len("鍵: "):].strip()
    return None


def pending_cases(rows: list[dict], today: date) -> list[Case]:
    cases = []
    for row in rows:
        reason = row["reason"]
        if reason in RETRY:
            since = date.fromisoformat(row["since"])
            if (today - since).days < RETRY_GRACE_DAYS:
                continue
        label = PENDING_REASONS.get(reason, reason)
        detail = row.get("detail") or ""
        cases.append(
            Case(
                key=f"numbers:{row['edinet_code']}",
                title=f"数字を更新できない: {row['name']}（{label}）",
                body=(
                    f"{row['name']}（{row['edinet_code']}・{row['sec_code'] or '証券コードなし'}）の有報を反映できていない。"
                    "前の期の数字のまま（新しい会社なら載せていない）。\n\n"
                    f"- 理由: {label}（`{reason}`）\n"
                    + (f"- 中身: {detail}\n" if detail else "")
                    + f"- 書類: `{row['doc_id']}`（決算期末 {row['period_end']}・提出 {row['filed']}）"
                    f" https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?{row['doc_id']},,\n"
                    f"- 待ち行列に入った日: {row['since']}\n\n"
                    "待ち行列は `pipeline/data/numbers_pending.csv`、理由の読み方は `docs/refresh/numbers/design.md`「待ち行列」。"
                ),
            )
        )
    return cases


def worklife_case(manifest: dict | None) -> Case | None:
    rejected = (manifest or {}).get("rejected")
    if not rejected:
        return None
    return Case(
        key="worklife:rejected",
        title=f"女性活躍DB の版を取り込めない（{rejected['file']}）",
        body=(
            "女性活躍DB の全件版を検証で落とし、取り込まなかった。働きやすさの値は前の版"
            f"（{manifest.get('file')}・{manifest.get('fetchedAt')} に取得）のまま。\n\n"
            f"- 落とした版: `{rejected['file']}`（{rejected['fetchedAt']} に取得・sha256 `{rejected['sha256'][:16]}…`）\n"
            f"- 理由: {rejected['reason']}\n\n"
            "列が変わったなら、取り込みの規則（`pipeline/worklife/positivedb.ts`）を新しい列に合わせる。"
            "構造は `docs/refresh/worklife-fetch/design.md`。"
        ),
    )


def stalled_case(universe: dict, today: date) -> Case | None:
    read_to = date.fromisoformat(universe["filingWindow"]["to"])
    days = (today - read_to).days
    if days < STALL_DAYS:
        return None
    return Case(
        key="routine:stalled",
        title="定期実行が止まっている（数字の書類一覧が進んでいない）",
        body=(
            f"有報の書類一覧を {read_to.isoformat()} までしか読んでいない（{days}日前）。"
            "ふだんは毎日、日本時間の昨日まで進む。\n\n"
            "定期実行が回っていないか、書類一覧が取れずに止まっている（線 A。`docs/refresh/numbers/design.md`）か、"
            "データ更新の PR がマージされていない。定期実行のセッションと、`refresh` のラベルが付いた PR を見る。"
        ),
    )


def pr_cases(prs: list[dict]) -> list[Case]:
    cases = []
    for pr in prs:
        labels = {label["name"] for label in pr.get("labels", [])}
        n = pr["number"]
        if "refresh-criteria" in labels:
            cases.append(
                Case(
                    key=f"pr-criteria:{n}",
                    title=f"通る基準を変える PR が止まっている（#{n}）",
                    body=(
                        f"#{n}「{pr['title']}」は通る基準のファイル（テスト・止める線の閾値・生成の規格）に触れているので、"
                        f"自動ではマージしていない。見てマージするか閉じる。\n\n{pr['url']}\n\n"
                        "基準のファイルの一覧は `pipeline/refresh/criteria.txt`。この PR が開いたままでも、ほかの更新は続く。"
                    ),
                )
            )
        if "refresh-ci-failed" in labels:
            cases.append(
                Case(
                    key=f"pr-failed:{n}",
                    title=f"定期実行の PR の CI が落ちた（#{n}）",
                    body=(
                        f"#{n}「{pr['title']}」の CI が通っていないので、マージしていない。\n\n{pr['url']}\n\n"
                        "次の回の定期実行が原因を調べて直す。直らなければこの Issue が残る。"
                    ),
                )
            )
    return cases


def read_pending(path: Path = DATA / "numbers_pending.csv") -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def read_json(path: Path) -> dict | None:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def collect(today: date, prs: list[dict]) -> list[Case]:
    cases = pending_cases(read_pending(), today)
    for case in [
        worklife_case(read_json(PIPELINE / "worklife" / "manifest.json")),
        stalled_case(read_json(DATA / "universe.json"), today),
    ]:
        if case:
            cases.append(case)
    return cases + pr_cases(prs)


@dataclass
class Plan:
    create: list[Case]
    update: list[tuple[int, Case]]
    close: list[int]


def plan(cases: list[Case], issues: list[dict]) -> Plan:
    """開いている Issue（`number`・`title`・`body`）と件を突き合わせる。鍵の無い Issue には触らない。"""
    by_key: dict[str, dict] = {}
    duplicates: list[int] = []
    for issue in sorted(issues, key=lambda i: i["number"]):
        key = key_of(issue["body"])
        if key is None:
            continue
        if key in by_key:
            duplicates.append(issue["number"])  # 同じ件の2つ目以降は閉じる
        else:
            by_key[key] = issue
    wanted = {c.key: c for c in cases}
    create = [c for k, c in wanted.items() if k not in by_key]
    update = [
        (by_key[k]["number"], c)
        for k, c in wanted.items()
        if k in by_key and (by_key[k]["title"] != c.title or by_key[k]["body"] != c.issue_body())
    ]
    close = sorted([i["number"] for k, i in by_key.items() if k not in wanted] + duplicates)
    return Plan(create, update, close)


# --- ここから下は GitHub Actions の中でだけ動く ---


def gh(*args: str) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def sync(repo: str) -> None:
    today = datetime.now(JST).date()
    # ラベルはここで揃える。定期実行のセッションが PR に `refresh` を付ける前に在る必要がある
    from automerge import LABELS

    for name, (color, description) in {**LABELS, LABEL: (LABEL_COLOR, LABEL_DESCRIPTION)}.items():
        gh("label", "create", name, "--repo", repo, "--color", color, "--description", description, "--force")
    prs = json.loads(
        gh("pr", "list", "--repo", repo, "--state", "open", "--label", "refresh", "--json", "number,title,url,labels", "--limit", "100")
    )
    issues = json.loads(
        gh("issue", "list", "--repo", repo, "--state", "open", "--label", LABEL, "--json", "number,title,body", "--limit", "500")
    )
    p = plan(collect(today, prs), issues)
    for case in p.create:
        gh("issue", "create", "--repo", repo, "--title", case.title, "--body", case.issue_body(), "--label", LABEL)
        print(f"立てた: {case.key}")
    for number, case in p.update:
        gh("issue", "edit", str(number), "--repo", repo, "--title", case.title, "--body", case.issue_body())
        print(f"直した: #{number} {case.key}")
    for number in p.close:
        gh("issue", "close", str(number), "--repo", repo, "--comment", "解消したので閉じる（定期実行の知らせ）。")
        print(f"閉じた: #{number}")


def main(argv: list[str]) -> None:
    if argv[1:2] == ["sync"]:
        import os

        sync(os.environ["GITHUB_REPOSITORY"])
    elif argv[1:2] == ["list"]:
        for case in collect(datetime.now(JST).date(), []):
            print(f"{case.key}\t{case.title}")
    else:
        raise SystemExit("usage: alerts.py list | sync")


if __name__ == "__main__":
    main(sys.argv)
